// Shared Canon enums + labels (client-safe: no DB imports).

export const DATE_KINDS = ["event", "marketing", "registration"] as const;
export type DateKind = (typeof DATE_KINDS)[number];

export const DATE_KIND_LABEL: Record<DateKind, string> = {
  event: "Event",
  marketing: "Marketing",
  registration: "Registration",
};

export const DATE_STATUSES = ["tentative", "confirmed"] as const;
export type DateStatus = (typeof DATE_STATUSES)[number];

export const VENUE_STATUSES = [
  "not_booked",
  "unconfirmed",
  "confirmed",
  "booked",
] as const;
export type VenueStatus = (typeof VENUE_STATUSES)[number];

export const PARTICIPATIONS = ["individual", "team", "both"] as const;
export type Participation = (typeof PARTICIPATIONS)[number];

export const PARTICIPATION_LABEL: Record<Participation, string> = {
  individual: "Individual",
  team: "Team",
  both: "Team or solo",
};

/** Team size bounds. Mirrored by the `canon_events_team_size_check` DB CHECK. */
export const TEAM_MIN = 2;
export const TEAM_MAX = 10;

export const EVENT_STATUSES = ["draft", "published"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

/** Semantic badge variants (see `src/components/ui/badge.tsx`). */
export type SemanticVariant = "success" | "warning" | "info" | "destructive";

export const DATE_STATUS_META: Record<
  DateStatus,
  { label: string; variant: SemanticVariant }
> = {
  tentative: { label: "Tentative", variant: "warning" },
  confirmed: { label: "Confirmed", variant: "success" },
};

export const VENUE_STATUS_META: Record<
  VenueStatus,
  { label: string; variant: SemanticVariant }
> = {
  not_booked: { label: "Not booked", variant: "destructive" },
  unconfirmed: { label: "Unconfirmed", variant: "warning" },
  confirmed: { label: "Confirmed", variant: "info" },
  booked: { label: "Booked", variant: "success" },
};

export const NAME_MAX = 80;
export const SHORT_DESC_MAX = 500;
