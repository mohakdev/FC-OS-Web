import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * PRESENTATION ONLY — which roles get the "leadership" badge treatment on the
 * dashboard. Never gate a capability on this; use the permission model
 * (`src/lib/auth/permissions.ts`).
 *
 * It looks like the old `APPROVER_ROLES` set because today it holds the same
 * roles, but it is answering a different question: "is this person leadership?"
 * is about identity/tier, whereas "may this person approve members?" is about
 * capability, and the permission grid can now change the latter without the
 * former. Deriving the badge from `can("member.approve")` would recolour
 * people's badges the moment an admin grants that to a lead.
 */
export const leadershipRoles = new Set([
  "superadmin",
  "president",
  "vice president",
  "human resource manager",
]);
