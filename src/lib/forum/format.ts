// Forum display + time helpers. Pure and client-safe. Times are shown and
// entered in IST (`FORUM_TZ`); storage is timestamptz.

import { formatDomain } from "@/lib/opus/format";
import {
  FORUM_TZ,
  FORUM_UTC_OFFSET,
  MEETING_KIND_LABELS,
  type MeetingKind,
} from "./constants";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** `("2026-11-18", "17:30")` (IST) → the exact instant. Null if malformed. */
export function istToDate(date: string, time: string): Date | null {
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) return null;
  const d = new Date(`${date}T${time}:00${FORUM_UTC_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const partsIn = (at: Date, opts: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: FORUM_TZ, ...opts })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );

/** Instant → `"2026-11-18"` in IST (for date inputs). */
export function toISTDate(at: Date): string {
  const p = partsIn(at, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${p.year}-${p.month}-${p.day}`;
}

/** Instant → `"17:30"` in IST (for time inputs). */
export function toISTTime(at: Date): string {
  const p = partsIn(at, { hour: "2-digit", minute: "2-digit", hour12: false });
  // Some engines render midnight as "24".
  return `${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

/** `"05:30 PM"` in IST. */
export function formatTime(at: Date): string {
  const p = partsIn(at, { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${p.hour}:${p.minute} ${String(p.dayPeriod ?? "").toUpperCase()}`;
}

/** `"Wed, 18 Nov 2026"` in IST. */
export function formatDate(at: Date): string {
  const p = partsIn(at, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return `${p.weekday}, ${p.day} ${p.month} ${p.year}`;
}

/**
 * `"Wed, 18 Nov 2026 · 05:30 PM – 07:00 PM"`. An end on a different IST day
 * gets its own date.
 */
export function formatWhen(startsAt: Date, endsAt: Date | null): string {
  const start = `${formatDate(startsAt)} · ${formatTime(startsAt)}`;
  if (!endsAt) return start;
  const sameDay = toISTDate(startsAt) === toISTDate(endsAt);
  return sameDay
    ? `${start} – ${formatTime(endsAt)}`
    : `${start} – ${formatDate(endsAt)} · ${formatTime(endsAt)}`;
}

/** `"Technical meeting"`, `"Full-team meeting"`. */
export function kindLabel(kind: MeetingKind, domain: string | null): string {
  if (kind === "domain_meeting" && domain) {
    return `${formatDomain(domain)} meeting`;
  }
  return MEETING_KIND_LABELS[kind];
}

/**
 * Upcoming = not yet over (end, or start when there is no end). Upcoming sorts
 * soonest-first, past most-recent-first.
 */
export function splitByTime<T extends { startsAt: Date; endsAt: Date | null }>(
  events: T[],
  now: Date = new Date(),
): { upcoming: T[]; past: T[] } {
  const over = (e: T) => (e.endsAt ?? e.startsAt).getTime() < now.getTime();
  const time = (e: T) => e.startsAt.getTime();
  return {
    upcoming: events.filter((e) => !over(e)).sort((a, b) => time(a) - time(b)),
    past: events.filter(over).sort((a, b) => time(b) - time(a)),
  };
}
