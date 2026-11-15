// Forum constants. Client-safe (no DB imports). Mirrors the enums in
// src/database/schemas/forum_events.ts — keep the two in sync.
//
// Forum is for internal club meetings only; external events live in Canon.

export const MEETING_KINDS = [
  "domain_meeting",
  "club_meeting",
  "assoc_leads_meeting",
] as const;
export type MeetingKind = (typeof MEETING_KINDS)[number];

export const EVENT_STATUSES = ["scheduled", "cancelled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const MEETING_KIND_LABELS: Record<MeetingKind, string> = {
  domain_meeting: "Domain meeting",
  club_meeting: "Full-team meeting",
  assoc_leads_meeting: "Associate-leads meeting",
};

/** Badge colour per meeting kind (Badge variants in components/ui/badge.tsx). */
export const KIND_BADGE: Record<MeetingKind, "default" | "info" | "warning"> = {
  club_meeting: "default",
  domain_meeting: "info",
  assoc_leads_meeting: "warning",
};

/**
 * The role whose holders make up an associate-leads meeting's audience. This is
 * an audience rule (who is expected), not authorization — creating one is gated
 * on `forum.assoc.manage`. Must match the `role_label` enum value.
 */
export const ASSOC_LEAD_ROLE = "associate lead";

export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 2000;
export const VENUE_MAX = 120;

/** Forum shows and accepts times in IST, like Canon. */
export const FORUM_TZ = "Asia/Kolkata";
/** IST has no DST, so a fixed offset is exact. */
export const FORUM_UTC_OFFSET = "+05:30";
