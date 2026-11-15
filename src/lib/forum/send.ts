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

/**
 * Pause between messages. Resend's SMTP relay rate-limits bursts (a few per
 * second); staying under it keeps a full-team invite from failing midway.
 */
const SEND_GAP_MS = 600;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

/**
 * Mails `kind` for `eventId` to everyone who should get it and hasn't yet.
 *
 *   invite → the current audience, not yet invited. Only for a scheduled event
 *            that hasn't started. Logged at revision 0.
 *   update → already-invited members, at the event's current revision.
 *   cancel → already-invited members, at the event's current revision.
 */
export async function sendEventMail(
  eventId: string,
  kind: InviteKind,
): Promise<SendSummary> {
  const summary: SendSummary = { sent: 0, failed: 0, skipped: 0 };
  const event = await getEvent(eventId);
  if (!event?.startsAt) return summary;

  // Nothing is mailed about a meeting that has already started.
  if (event.startsAt.getTime() <= Date.now()) return summary;
  const wantStatus = kind === "cancel" ? "cancelled" : "scheduled";
  if (event.status !== wantStatus) return summary;

  const revision = kind === "invite" ? 0 : event.revision;
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

  const ics = buildIcs(
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

  let attempted = 0;
  for (const member of recipients) {
    const key = { eventId, profileId: member.id, kind, revision };
    // Claim first: an overlapping run that already took this member skips it.
    if (!(await claimInvite(key))) {
      summary.skipped++;
      continue;
    }
    if (attempted++ > 0) await sleep(SEND_GAP_MS);
    const { subject, text } = compose(event, kind, member);
    try {
      await mailer.sendMail({
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
    JSON.stringify({ evt: "forum_mail", eventId, kind, revision, ...summary }),
  );
  return summary;
}
