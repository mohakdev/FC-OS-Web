"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { type AccessContext, getAccessContext } from "@/lib/auth/context";
import { canAny } from "@/lib/auth/permissions";
import { isUniqueViolation } from "@/lib/db/errors";
import { notifyRealtime } from "@/lib/realtime/notify";
import { deleteObject, putObject } from "@/lib/storage/s3";
import {
  AVATAR_MAX_BYTES,
  AVATAR_SIZE_PX,
  linkLimit,
  type ProfileDetailsInput,
  profileDetailsSchema,
} from "@/lib/validation/profile";
import {
  isPhoneTaken,
  setAvatarKey,
  updateOwnProfileDetails,
} from "@/utils/dbActions";

export type ProfileActionResult = { ok: true } | { error: string };

// Editing your own profile needs no permission — only a signed-in, approved
// member. Every action below writes `ctx.userId` and nothing else, so there is
// no way to target another member from the client.
async function requireApprovedSelf(): Promise<
  AccessContext | { error: string }
> {
  const ctx = await getAccessContext();
  if (!ctx) return { error: "You are not signed in." };
  if (ctx.status !== "approved") {
    return { error: "Your account is not approved." };
  }
  return ctx;
}

// The picture can also be set during onboarding step 2, while the application
// is still pending. Still own-profile only (writes `ctx.userId`); a rejected
// member can't touch it.
async function requireSelf(): Promise<AccessContext | { error: string }> {
  const ctx = await getAccessContext();
  if (!ctx) return { error: "You are not signed in." };
  if (ctx.status === "rejected") {
    return { error: "Your account is not approved." };
  }
  return ctx;
}

async function afterProfileChange() {
  revalidatePath("/dashboard/profile");
  revalidatePath("/onboarding/details");
  revalidatePath("/dashboard/member-directory");
  await notifyRealtime({ scope: "member" });
}

export async function updateProfileDetails(
  input: ProfileDetailsInput,
): Promise<ProfileActionResult> {
  const ctx = await requireApprovedSelf();
  if ("error" in ctx) return ctx;

  const parsed = profileDetailsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { phone, dateOfBirth, quote, links } = parsed.data;

  // Personal data, no domain to narrow to — held anywhere counts.
  const maxLinks = linkLimit(canAny(ctx.grants, "profile.links.extended"));
  if (links.length > maxLinks) {
    return { error: `You can add up to ${maxLinks} links.` };
  }

  if (await isPhoneTaken(phone, ctx.userId)) {
    return { error: "That phone number is already used by another member." };
  }

  try {
    await updateOwnProfileDetails(ctx.userId, {
      phone,
      dateOfBirth,
      quote,
      links: links.map((url) => ({ url })),
    });
  } catch (e) {
    // Lost a race with someone saving the same number between check and write.
    if (isUniqueViolation(e)) {
      return { error: "That phone number is already used by another member." };
    }
    throw e;
  }

  await afterProfileChange();
  return { ok: true };
}

/**
 * Stores a new profile picture. The client sends an already-cropped square;
 * this re-encodes it with sharp anyway (fixed size, webp, EXIF stripped), so
 * whatever the browser sent, only a clean 512px image is ever stored or served.
 */
export async function uploadAvatar(
  formData: FormData,
): Promise<ProfileActionResult> {
  const ctx = await requireSelf();
  if ("error" in ctx) return ctx;

  const file = formData.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return { error: "No image received." };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return { error: "Image must be 5 MB or smaller." };
  }

  let webp: Buffer;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    // Trust the decoded bytes, not the declared MIME type.
    const { format } = await sharp(input).metadata();
    if (format !== "jpeg" && format !== "png" && format !== "webp") {
      return { error: "Use a JPG, PNG or WebP image." };
    }
    webp = await sharp(input)
      .rotate() // honour EXIF orientation before it is stripped
      .resize(AVATAR_SIZE_PX, AVATAR_SIZE_PX, { fit: "cover" })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    return { error: "That file could not be read as an image." };
  }

  const key = `avatars/${ctx.userId}/${randomUUID()}.webp`;
  try {
    await putObject(key, webp, "image/webp");
  } catch (e) {
    console.error("avatar upload failed", e);
    return { error: "Could not save the picture. Try again in a moment." };
  }

  const previous = await setAvatarKey(ctx.userId, key);
  // Best effort: an orphaned object costs a few KB, a failed save costs the user.
  if (previous) await deleteObject(previous).catch(() => {});

  await afterProfileChange();
  return { ok: true };
}

export async function removeAvatar(): Promise<ProfileActionResult> {
  const ctx = await requireSelf();
  if ("error" in ctx) return ctx;

  const previous = await setAvatarKey(ctx.userId, null);
  if (previous) await deleteObject(previous).catch(() => {});

  await afterProfileChange();
  return { ok: true };
}
