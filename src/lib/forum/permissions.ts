// Forum authorization. Pure helpers over plain grants — safe on the server, in
// client props and in tests (no DB). Authorize on permissions, never role names.
//
//   domain_meeting → `forum.domain.manage` in THAT domain (`canIn`). A lead holds
//                    it via a domain-scoped role, so only their own domain;
//                    leadership holds it globally, so every domain.
//   club_meeting   → `forum.club.manage` held GLOBALLY (`can`). Ticking it on a
//                    domain-scoped role must not let a lead call a club meet.
//   external       → not manageable until Forum P2 adds its permission.

import { can, canIn, domainsWith, type Grants } from "@/lib/auth/permissions";
import { DOMAIN_IDS, type DomainId } from "@/lib/opus/format";
import type { EventKind } from "./constants";

type Viewer = { grants: Grants };

export const FORUM_DOMAIN_MANAGE = "forum.domain.manage" as const;
export const FORUM_CLUB_MANAGE = "forum.club.manage" as const;

/** Can the viewer create/edit/cancel/invite for an event of this kind + domain? */
export const canManageEvent = (
  v: Viewer,
  event: { kind: EventKind; domain: string | null },
): boolean => {
  switch (event.kind) {
    case "domain_meeting":
      return (
        event.domain !== null &&
        canIn(v.grants, FORUM_DOMAIN_MANAGE, event.domain)
      );
    case "club_meeting":
      return can(v.grants, FORUM_CLUB_MANAGE);
    case "external":
      return false;
  }
};

/** What the "New event" dialog may offer this viewer. */
export type CreateOptions = { club: boolean; domains: DomainId[] };

export const createOptions = (v: Viewer): CreateOptions => ({
  club: can(v.grants, FORUM_CLUB_MANAGE),
  domains: domainsWith(v.grants, FORUM_DOMAIN_MANAGE, DOMAIN_IDS),
});

export const canCreateAny = (o: CreateOptions): boolean =>
  o.club || o.domains.length > 0;
