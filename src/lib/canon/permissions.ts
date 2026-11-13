// Canon authorization. Pure helpers over plain grants — safe on the server and
// in tests (no DB). Authorize on permissions, never role names.
//
// Canon events are club-wide, not domain-bound, so:
//   - `canon.event.manage` only counts when held GLOBALLY (`can`). Ticking it on
//     a domain-scoped role must not hand that role every event in the club.
//   - `canon.event.edit.own` counts in any scope (`canAny`) — it is only ever
//     combined with the SPOC relationship, which already narrows it to one event.

import { can, canAny, type Grants } from "@/lib/auth/permissions";

type Viewer = { userId: string; grants: Grants };

export const CANON_MANAGE = "canon.event.manage" as const;
export const CANON_EDIT_OWN = "canon.event.edit.own" as const;

/** Create/delete any event, edit any event, assign SPOCs, manage categories. */
export const canManageCanon = (v: Viewer): boolean =>
  can(v.grants, CANON_MANAGE);

/**
 * Can the viewer edit this event? Managers always; a SPOC only when they also
 * hold the capability — being listed as SPOC is a relationship, not a grant, so
 * a read-only advisor listed as SPOC still cannot write.
 */
export const canEditEvent = (v: Viewer, spocIds: readonly string[]): boolean =>
  canManageCanon(v) ||
  (canAny(v.grants, CANON_EDIT_OWN) && spocIds.includes(v.userId));

/** Drafts are visible only to the people who could edit them. */
export const canSeeEvent = (
  v: Viewer,
  event: { status: "draft" | "published"; spocIds: readonly string[] },
): boolean =>
  event.status === "published" ||
  canManageCanon(v) ||
  event.spocIds.includes(v.userId);
