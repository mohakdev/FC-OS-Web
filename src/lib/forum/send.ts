// Forum email delivery: invites, updates and cancellations for an event's
// audience. Server-only (SMTP + DB). Server Actions start it detached (see
// `mailLater` in app/dashboard/forum/actions.ts), so the action responds
// immediately and mail goes out behind it.
//
// Idempotent by construction: each member's `forum_invites` row for this
// (kind, revision) is CLAIMED (atomic insert) before their mail is sent and
// released again if SMTP rejects it. Overlapping runs (a double-click, "Send
// invites" during the first run) therefore never double-mail, and the "Send
// invites" button simply finishes the job. Trade-off: a crash between claim and
// send loses that one member's mail (logged as sent) — rare, and far better
// than mailing the whole audience twice.

import { APP_URL, MAIL_FROM, MAIL_FROM_ADDRESS, mailer } from "@/lib/mail";
import { notifyRealtime } from "@/lib/realtime/notify";
import {
  type AudienceMember,
  claimInvite,
  type EventRow,
  getEvent,
  getEventAudience,
  type InviteKind,
  releaseInvite,
  sentProfileIds,
} from "@/utils/forumDbActions";
import { formatWhen, kindLabel } from "./format";
import { buildIcs } from "./ics";

// Pacing lives in the pooled transport (`src/lib/mail.ts`, SMTP_RATE_PER_SEC):
// one app-wide rate limit, so overlapping runs can't add up past it.

/** Waits before each retry of a temporarily rejected message. */
const RETRY_DELAYS_MS = [2_000, 4_000, 8_000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TRANSIENT_CODES = new Set([
  "ECONNECTION",
  "ETIMEDOUT",
  "ESOCKET",
  "EDNS",
]);

/**
 * Worth retrying? SMTP 4xx (e.g. 421/450/451/452 — busy, throttled), a dropped
 * connection, or a rate-limit message. 5xx and anything else are permanent.
 */
function isTransient(err: unknown): boolean {
  const e = err as { responseCode?: number; code?: string; message?: string };
  if (typeof e?.responseCode === "number") {
    return e.responseCode >= 400 && e.responseCode < 500;
  }
  if (e?.code && TRANSIENT_CODES.has(e.code)) return true;
  return /rate|too many/i.test(e?.message ?? "");
}

type MailOptions = Parameters<typeof mailer.sendMail>[0];

/**
 * `mailer.sendMail` with backoff on transient failures (2s, 4s, 8s). Forum
 * only — a login code isn't retried, the user can just request a new one.
 */
async function sendWithRetry(msg: MailOptions) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await mailer.sendMail(msg);
    } catch (err) {
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !isTransient(err)) throw err;
      console.warn(
        `[forum] transient SMTP error, retry ${attempt + 1}/${RETRY_DELAYS_MS.length} in ${delay}ms`,
      );
      await sleep(delay);
    }
  }
}

export type SendSummary = { sent: number; failed: number; skipped: number };

const eventUrl = (id: string) => `${APP_URL}/dashboard/forum/${id}`;

function compose(event: EventRow, kind: InviteKind, to: AudienceMember) {
  const when = formatWhen(event.startsAt, event.endsAt);
  const what = kindLabel(event.kind, event.domain);
  const verb =
    kind === "invite"
      ? "You're invited"
      : kind === "update"
        ? "Updated"
        : "Cancelled";
  const subject = `${verb}: ${event.title} — ${when}`;
  const lines = [
    `Hi ${to.firstName},`,
    "",
    kind === "invite"
      ? `You're invited to a ${what.toLowerCase()}.`
      : kind === "update"
        ? `The details of this ${what.toLowerCase()} changed.`
        : `This ${what.toLowerCase()} has been cancelled.`,
    "",
    event.title,
    `When:  ${when} (IST)`,
    event.venue ? `Where: ${event.venue}` : null,
    event.description ? `\n${event.description}` : null,
    "",
    `Details: ${eventUrl(event.id)}`,
    "",
    "— FC OS",
  ].filter((l): l is string => l !== null);
  return { subject, text: lines.join("\n") };
}

/** The calendar attachment for `event` (REQUEST = new/updated, CANCEL = gone). */
function icsFor(event: EventRow & { startsAt: Date }, kind: InviteKind) {
  return buildIcs(
    {
      id: event.id,
      title: event.title,
      description: event.description,
      venue: event.venue,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      revision: event.revision,
      url: eventUrl(event.id),
    },
    kind === "cancel" ? "CANCEL" : "REQUEST",
    MAIL_FROM_ADDRESS,
  );
}

/**
 * Why a run should stop before mailing the next member, or null to go on.
 * `revision` is the one this run is keyed on (0 for invites).
 */
function stopReason(
  event: EventRow | null,
  kind: InviteKind,
  revision: number,
): string | null {
  if (!event?.startsAt) return "gone";
  if (event.startsAt.getTime() <= Date.now()) return "started";
  const wantStatus = kind === "cancel" ? "cancelled" : "scheduled";
  if (event.status !== wantStatus) return event.status;
  // A newer edit makes an update/cancel run obsolete; the next run covers it.
  // Invites are keyed on revision 0 and just pick up the fresh details.
  if (kind !== "invite" && event.revision !== revision) return "superseded";
  return null;
}

/**
 * Mails `kind` for `eventId` to everyone who should get it and hasn't yet.
 *
 *   invite → the current audience, not yet invited. Only for a scheduled event
 *            that hasn't started. Logged at revision 0.
 *   update → already-invited members, at the event's current revision.
 *   cancel → already-invited members, at the event's current revision.
 *
 * The event is re-read before every message, so a run never mails stale
 * details: an edit mid-invite-run switches the remaining invites to the new
 * time/venue, and a cancel (or a newer edit, for update/cancel runs) stops it.
 */
export async function sendEventMail(
  eventId: string,
  kind: InviteKind,
): Promise<SendSummary> {
  const summary: SendSummary = { sent: 0, failed: 0, skipped: 0 };
  let event = await getEvent(eventId);
  const revision = kind === "invite" ? 0 : (event?.revision ?? 0);
  let stopped = stopReason(event, kind, revision);
  if (stopped || !event?.startsAt) return summary;

  const [audience, alreadySent, invited] = await Promise.all([
    getEventAudience(event),
    sentProfileIds(eventId, kind, revision),
    kind === "invite"
      ? Promise.resolve(null)
      : sentProfileIds(eventId, "invite", 0),
  ]);

  const recipients = audience.filter(
    (m) => !alreadySent.has(m.id) && (invited === null || invited.has(m.id)),
  );
  summary.skipped = audience.length - recipients.length;

  let current: EventRow & { startsAt: Date } = {
    ...event,
    startsAt: event.startsAt,
  };
  let ics = icsFor(current, kind);

  for (const member of recipients) {
    // Re-read right before sending: stop on cancel/start/supersede, refresh on edit.
    event = await getEvent(eventId);
    stopped = stopReason(event, kind, revision);
    if (stopped || !event?.startsAt) break;
    if (event.revision !== current.revision) {
      current = { ...event, startsAt: event.startsAt };
      ics = icsFor(current, kind);
    }

    const key = { eventId, profileId: member.id, kind, revision };
    // Claim first: an overlapping run that already took this member skips it.
    if (!(await claimInvite(key))) {
      summary.skipped++;
      continue;
    }
    const { subject, text } = compose(current, kind, member);
    try {
      await sendWithRetry({
        from: MAIL_FROM,
        to: member.email,
        subject,
        text,
        icalEvent: {
          method: kind === "cancel" ? "CANCEL" : "REQUEST",
          filename: "invite.ics",
          content: ics,
        },
      });
      summary.sent++;
    } catch (cause) {
      summary.failed++;
      await releaseInvite(key).catch(() => {});
      console.error(
        `[forum] ${kind} mail to profile ${member.id} for event ${eventId} failed:`,
        cause,
      );
    }
  }

  if (summary.sent > 0) await notifyRealtime({ scope: "forum" });
  console.log(
    JSON.stringify({
      evt: "forum_mail",
      eventId,
      kind,
      revision,
      ...summary,
      ...(stopped ? { stopped } : {}),
    }),
  );
  return summary;
}
