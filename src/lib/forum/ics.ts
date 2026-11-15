// Minimal iCalendar (RFC 5545) builder for Forum invite emails, so a meeting
// lands in the recipient's calendar. REQUEST = new/updated, CANCEL = cancelled;
// the same UID + a rising SEQUENCE (the event's `revision`) lets calendar apps
// update or remove the entry they already have.

const ICS_HOST = "fc-os.tech";

const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/** Escape TEXT values (RFC 5545 §3.3.11). */
const text = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

/** Fold lines longer than 75 octets (approximated by characters). */
const fold = (line: string) => {
  const out: string[] = [];
  for (let i = 0; i < line.length; i += 73) {
    out.push((i === 0 ? "" : " ") + line.slice(i, i + 73));
  }
  return out.join("\r\n");
};

export type IcsEvent = {
  id: string;
  title: string;
  description: string;
  venue: string | null;
  startsAt: Date;
  endsAt: Date | null;
  revision: number;
  url: string | null;
};

export function buildIcs(
  event: IcsEvent,
  method: "REQUEST" | "CANCEL",
  organizerEmail: string,
  now: Date = new Date(),
): string {
  // No end → a one-hour block, so the entry is visible in day views.
  const end = event.endsAt ?? new Date(event.startsAt.getTime() + 3_600_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FC OS//Forum//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${event.id}@${ICS_HOST}`,
    `SEQUENCE:${event.revision}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(event.startsAt)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${text(event.title)}`,
    event.description ? `DESCRIPTION:${text(event.description)}` : null,
    event.venue ? `LOCATION:${text(event.venue)}` : null,
    event.url ? `URL:${event.url}` : null,
    `ORGANIZER;CN=FC OS:mailto:${organizerEmail}`,
    `STATUS:${method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((l): l is string => l !== null);
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
