"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/database/db";
import { profiles } from "@/database/schemas/profiles";
import { auth } from "@/lib/auth/server";
import { uniqueViolationConstraint } from "@/lib/db/errors";
import { onboardingSchema } from "@/lib/validation/onboarding";
import {
  isPhoneTaken,
  isRaNumberTaken,
  onboardProfile,
} from "@/utils/dbActions";

const PHONE_TAKEN = "That phone number is already used by another member.";
const RA_TAKEN =
  "That RA number is already registered. Contact HR if it's yours.";

export type OnboardingActionState = { error: string } | undefined;

export async function submitOnboarding(
  input: unknown,
): Promise<OnboardingActionState> {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;
  if (!user) return { error: "Your session expired. Please sign in again." };

  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details." };
  }

  // Idempotency: if a profile already exists for this auth user, don't create a
  // second one — just move them along to the pending screen.
  const [existing] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.authUserId, user.id))
    .limit(1);

  if (!existing) {
    // The phone check needs a profile id to exclude; a fresh applicant has
    // none, so any match is someone else.
    if (await isPhoneTaken(parsed.data.phone, ""))
      return { error: PHONE_TAKEN };
    if (await isRaNumberTaken(parsed.data.raNumber)) return { error: RA_TAKEN };

    try {
      await onboardProfile(user.id, user.email, parsed.data);
    } catch (e) {
      // Lost a race between the checks above and the insert.
      const constraint = uniqueViolationConstraint(e);
      if (constraint?.includes("ra_number")) return { error: RA_TAKEN };
      if (constraint?.includes("phone")) return { error: PHONE_TAKEN };
      return { error: "Could not complete onboarding. Please try again." };
    }
  }

  // Step 2: the optional extras (picture, quote, links), then /pending.
  redirect("/onboarding/details");
}
