// Canon display helpers. Pure + client-safe. Dates follow the spec:
// days as `DD Mon YYYY`, stamps as `DD Mon YYYY; hh:mm AM/PM` in IST.

import { formatDistanceStrict } from "date-fns";
import type { Participation } from "./constants";

export const CANON_TZ = "Asia/Kolkata";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * `"2027-02-14"` → `"14 Feb 2027"`. Works on the ISO string directly so a
 * date-only value never shifts a day through a timezone conversion.
 */
export function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-");
  const month = MONTHS[Number(m) - 1];
  if (!y || !month || !d) return iso;
  return `${d.padStart(2, "0")} ${month} ${y}`;
}

const stampFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: CANON_TZ,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

/** `Date` → `"13 Nov 2026; 04:12 PM"` in IST. */
export function formatStamp(at: Date): string {
  const parts = Object.fromEntries(
    stampFormatter.formatToParts(at).map((p) => [p.type, p.value]),
  );
  const period = String(parts.dayPeriod ?? "").toUpperCase();
  return `${parts.day} ${parts.month} ${parts.year}; ${parts.hour}:${parts.minute} ${period}`;
}

/** `"2 hours ago"`. Callers compute it once at render (when the page opens). */
export function ago(at: Date, now: Date): string {
  if (now.getTime() - at.getTime() < 60_000) return "just now";
  return formatDistanceStrict(at, now, { addSuffix: true });
}

/** Today's date in IST as `YYYY-MM-DD`. */
export function todayIST(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CANON_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** `"14 Feb 2027"` or `"14 Feb 2027 – 16 Feb 2027"`. */
export function formatRange(start: string, end: string | null): string {
  return end && end !== start
    ? `${formatDay(start)} – ${formatDay(end)}`
    : formatDay(start);
}

export function feeLabel(isPaid: boolean, fee: number | null): string {
  if (!isPaid) return "Free";
  return fee != null ? `Paid · ₹${fee.toLocaleString("en-IN")}` : "Paid";
}

/**
 * `Individual` · `Team · 2–4` (`Team · 4` when min = max) ·
 * `Team or solo · teams of 2–4`.
 */
export function participationLabel(
  p: Participation,
  min: number | null,
  max: number | null,
): string {
  if (p === "individual") return "Individual";
  const size =
    min != null && max != null
      ? min === max
        ? `${min}`
        : `${min}–${max}`
      : "";
  if (p === "team") return size ? `Team · ${size}` : "Team";
  return size ? `Team or solo · teams of ${size}` : "Team or solo";
}

export type Grouped<T> = { ongoing: T[]; upcoming: T[]; past: T[] };

/**
 * Splits events by their EVENT date range against `today` (IST, `YYYY-MM-DD`).
 * No event date yet → upcoming (it hasn't happened). Ongoing/upcoming sort
 * soonest first; past sorts most recent first.
 */
export function groupEvents<
  T extends { eventDate: { startDate: string; endDate: string | null } | null },
>(events: readonly T[], today: string): Grouped<T> {
  const out: Grouped<T> = { ongoing: [], upcoming: [], past: [] };
  for (const e of events) {
    const d = e.eventDate;
    if (!d || d.startDate > today) out.upcoming.push(e);
    else if ((d.endDate ?? d.startDate) < today) out.past.push(e);
    else out.ongoing.push(e);
  }
  const start = (e: T) => e.eventDate?.startDate ?? "9999-99-99";
  out.ongoing.sort((a, b) => start(a).localeCompare(start(b)));
  out.upcoming.sort((a, b) => start(a).localeCompare(start(b)));
  out.past.sort((a, b) => start(b).localeCompare(start(a)));
  return out;
}
