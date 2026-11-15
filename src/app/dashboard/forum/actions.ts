"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  type AccessContext,
  requireGlobalWriteAccess,
  requireWriteAccess,
} from "@/lib/auth/context";
import type { EventKind } from "@/lib/forum/constants";
import {
  canManageEvent,
  FORUM_CLUB_MANAGE,
  FORUM_DOMAIN_MANAGE,
} from "@/lib/forum/permissions";
import { meetingInputSchema } from "@/lib/forum/schema";
import { sendEventMail } from "@/lib/forum/send";
import { notifyRealtime } from "@/lib/realtime/notify";
import {
  cancelEvent,
  createEvent,
  deleteEvent,
  getEvent,
  updateEvent,
} from "@/utils/forumDbActions";

export type ActionResult = { ok: true } | { error: string };
export type CreateResult = { ok: true; id: string } | { error: string };

const idSchema = z.uuid();

async function broadcast(eventId?: string) {
  revalidatePath("/dashboard/forum");
  if (eventId) revalidatePath(`/dashboard/forum/${eventId}`);
  await notifyRealtime({ scope: "forum" });
}

/**
 * Mail in the background without holding up the action's response.
 *
 * Deliberately NOT `after()`: its callbacks wait for Next's `onClose` of the
 * response, and for these Server Actions (revalidate + RSC payload back) that
 * never fired in practice — invites silently never went out. FC OS runs as one
 * long-lived Node server (Coolify / Docker standalone, not serverless), so a
 * detached promise keeps running after the response. The send is idempotent
 * (`forum_invites` log), so a process restart mid-batch only means "Send N
 * invites" on the detail page finishes the job.
 */
function mailLater(eventId: string, kind: "invite" | "update" | "cancel") {
  void sendEventMail(eventId, kind).catch((cause) => {
    console.error(`[forum] ${kind} mail run for ${eventId} failed:`, cause);
  });
}

/**
 * Signed in + approved + allowed to manage events of this kind/domain, via the
 * standard guards (so view-as writes are logged like everywhere else):
 *   club_meeting   → `requireGlobalWriteAccess` — org-wide, no domain to narrow to
 *   domain_meeting → `requireWriteAccess` precheck, then `canIn` for THAT domain
 *   external       → not manageable until Forum P2
 */
async function requireEventManager(event: {
  kind: EventKind;
  domain: string | null;
}): Promise<AccessContext | { error: string }> {
  if (event.kind === "club_meeting") {
    return requireGlobalWriteAccess(FORUM_CLUB_MANAGE);
  }
  if (event.kind !== "domain_meeting") {
    return { error: "You are not allowed to manage this event." };
  }
  const ctx = await requireWriteAccess(FORUM_DOMAIN_MANAGE);
  if ("error" in ctx) return ctx;
  if (!canManageEvent(ctx, event)) {
    return { error: "You can only manage meetings of your own domain." };
  }
  return ctx;
}

// --- create / edit ---------------------------------------------------------

export async function createMeetingAction(raw: unknown): Promise<CreateResult> {
  const parsed = meetingInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { notify, ...values } = parsed.data;

  const ctx = await requireEventManager(values);
  if ("error" in ctx) return ctx;

  if (values.startsAt.getTime() <= Date.now()) {
    return { error: "The meeting must start in the future." };
  }

  const id = await createEvent(values, ctx.userId);
  await broadcast(id);
  if (notify) mailLater(id, "invite");
  return { ok: true, id };
}

export async function updateMeetingAction(
  eventId: string,
  raw: unknown,
): Promise<ActionResult> {
  if (!idSchema.safeParse(eventId).success) return { error: "Bad event id." };
  const current = await getEvent(eventId);
  if (!current) return { error: "Event not found." };
  if (current.status === "cancelled") {
    return { error: "This meeting is cancelled." };
  }

  const parsed = meetingInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { notify, ...values } = parsed.data;
  // Kind + domain decide the audience; they're fixed after creation.
  if (values.kind !== current.kind || values.domain !== current.domain) {
    return {
      error:
        "A meeting's type and domain can't change. Cancel it and create a new one.",
    };
  }

  const ctx = await requireEventManager(current);
  if ("error" in ctx) return ctx;

  const result = await updateEvent(eventId, values, ctx.userId);
  if (!result) return { error: "Event not found." };
  await broadcast(eventId);
  if (notify && result.material) mailLater(eventId, "update");
  return { ok: true };
}

// --- lifecycle -------------------------------------------------------------

export async function cancelMeetingAction(
  eventId: string,
  notify: boolean,
): Promise<ActionResult> {
  if (!idSchema.safeParse(eventId).success) return { error: "Bad event id." };
  const current = await getEvent(eventId);
  if (!current) return { error: "Event not found." };
  const ctx = await requireEventManager(current);
  if ("error" in ctx) return ctx;

  const revision = await cancelEvent(eventId, ctx.userId);
  if (revision === null) return { error: "This meeting is already cancelled." };
  await broadcast(eventId);
  if (notify) mailLater(eventId, "cancel");
  return { ok: true };
}

export async function deleteMeetingAction(
  eventId: string,
): Promise<ActionResult> {
  if (!idSchema.safeParse(eventId).success) return { error: "Bad event id." };
  const current = await getEvent(eventId);
  if (!current) return { error: "Event not found." };
  const ctx = await requireEventManager(current);
  if ("error" in ctx) return ctx;

  await deleteEvent(eventId);
  await broadcast(eventId);
  return { ok: true };
}

/**
 * Mails the invite to every audience member who hasn't had it yet — e.g. people
 * who joined the domain after creation, or a run that SMTP partly rejected.
 */
export async function sendInvitesAction(
  eventId: string,
): Promise<ActionResult> {
  if (!idSchema.safeParse(eventId).success) return { error: "Bad event id." };
  const current = await getEvent(eventId);
  if (!current) return { error: "Event not found." };
  const ctx = await requireEventManager(current);
  if ("error" in ctx) return ctx;
  if (current.status !== "scheduled") {
    return { error: "This meeting is cancelled." };
  }
  if (!current.startsAt || current.startsAt.getTime() <= Date.now()) {
    return { error: "This meeting has already started." };
  }
  mailLater(eventId, "invite");
  return { ok: true };
}
