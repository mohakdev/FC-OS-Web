"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAccessContext, needsRaNumber } from "@/lib/auth/context";
import { canAny } from "@/lib/auth/permissions";
import { uniqueViolationConstraint } from "@/lib/db/errors";
import { notifyRealtime } from "@/lib/realtime/notify";
import { raNumberSchema } from "@/lib/validation/onboarding";
import { linkLimit, profileExtrasSchema } from "@/lib/validation/profile";
import { completeOwnProfileDetails, isRaNumberTaken } from "@/utils/dbActions";

export type DetailsActionState = { error: string } | undefined;

const RA_TAKEN =
  "That RA number is already registered. Contact HR if it's yours.";

/**
 * Saves the onboarding details screen for the signed-in member only.
 *
 * - Fresh applicant (step 2, pending): quote + links. RA was set in step 1.
 * - Approved member without an RA (the one-time screen): RA is required here,
 *   and is only ever written while still empty — members can't change it.
 *
 * `raNumber` from the client is ignored unless the member actually needs one.
 */
export async function completeProfileDetails(input: {
  raNumber?: string;
  quote: string;
  links: string[];
}): Promise<DetailsActionState> {
  const ctx = await getAccessContext();
  if (!ctx) return { error: "Your session expired. Please sign in again." };
  if (ctx.status === "rejected") {
    return { error: "Your account is not approved." };
  }

  const askRa = needsRaNumber(ctx);
  let raNumber: string | null = null;
  if (askRa) {
    const parsedRa = raNumberSchema.safeParse(input.raNumber ?? "");
    if (!parsedRa.success) {
      return {
        error: parsedRa.error.issues[0]?.message ?? "Invalid RA number.",
      };
    }
    raNumber = parsedRa.data;
    if (await isRaNumberTaken(raNumber, ctx.userId)) return { error: RA_TAKEN };
  }

  const parsed = profileExtrasSchema.safeParse({
    quote: input.quote,
    links: input.links,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details." };
  }
  const maxLinks = linkLimit(canAny(ctx.grants, "profile.links.extended"));
  if (parsed.data.links.length > maxLinks) {
    return { error: `You can add up to ${maxLinks} links.` };
  }

  try {
    const saved = await completeOwnProfileDetails(ctx.userId, {
      raNumber,
      quote: parsed.data.quote,
      links: parsed.data.links.map((url) => ({ url })),
    });
    if (!saved) return { error: "Your RA number is already set." };
  } catch (e) {
    if (uniqueViolationConstraint(e)?.includes("ra_number")) {
      return { error: RA_TAKEN };
    }
    return { error: "Could not save your details. Please try again." };
  }

  revalidatePath("/dashboard", "layout");
  await notifyRealtime({ scope: "member" });
  redirect(ctx.status === "approved" ? "/dashboard" : "/pending");
}
