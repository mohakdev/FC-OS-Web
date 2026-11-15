// Forum constants. Client-safe (no DB imports). Mirrors the enums in
// src/database/schemas/events.ts — keep the two in sync.

export const EVENT_KINDS = [
  "domain_meeting",
  "club_meeting",
  "external",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** Kinds Forum can create today. `external` arrives with Forum P2 (Canon link). */
export const MEETING_KINDS = ["domain_meeting", "club_meeting"] as const;
export type MeetingKind = (typeof MEETING_KINDS)[number];

export const EVENT_STATUSES = ["scheduled", "cancelled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  domain_meeting: "Domain meeting",
  club_meeting: "Full-team meeting",
  external: "External event",
};

export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 2000;
export const VENUE_MAX = 120;

/** Forum shows and accepts times in IST, like Canon. */
export const FORUM_TZ = "Asia/Kolkata";
/** IST has no DST, so a fixed offset is exact. */
export const FORUM_UTC_OFFSET = "+05:30";
