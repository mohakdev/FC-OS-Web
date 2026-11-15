import { redirect } from "next/navigation";

import { ThemeSelector } from "@/components/theme/theme-selector";
import { getAuthState, needsRaNumber } from "@/lib/auth/context";
import { canAny } from "@/lib/auth/permissions";
import { linkLimit } from "@/lib/validation/profile";
import { getOwnProfileExtras } from "@/utils/dbActions";
import DetailsForm from "./details-form";

export const dynamic = "force-dynamic";

/**
 * Two callers, one screen:
 * - onboarding step 2 — a fresh (pending) applicant adds the optional extras;
 * - the one-time screen for approved members with no RA on file (the dashboard
 *   layout redirects here): RA required, extras prefilled.
 * Approved members who already have an RA (or are exempt) go straight back.
 */
export default async function OnboardingDetailsPage() {
  const state = await getAuthState();

  if (state.kind === "unauthenticated") redirect("/login");
  if (state.kind === "no-profile") redirect("/onboarding");
  const { ctx } = state;
  if (ctx.status === "rejected") redirect("/pending");

  const askRa = needsRaNumber(ctx);
  if (ctx.status === "approved" && !askRa) redirect("/dashboard");

  const extras = await getOwnProfileExtras(ctx.userId);

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4">
      <ThemeSelector />
      <DetailsForm
        mode={askRa ? "ra-required" : "onboarding-step-2"}
        profile={{
          id: ctx.userId,
          firstName: ctx.firstName,
          lastName: ctx.lastName,
          avatarVersion: extras.avatarVersion,
        }}
        initialQuote={extras.quote ?? ""}
        initialLinks={extras.links.map((l) => l.url)}
        maxLinks={linkLimit(canAny(ctx.grants, "profile.links.extended"))}
      />
    </main>
  );
}
