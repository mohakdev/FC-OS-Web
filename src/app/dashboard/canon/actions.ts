"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  type AccessContext,
  getAccessContext,
  requireGlobalWriteAccess,
} from "@/lib/auth/context";
import { EVENT_STATUSES, type EventStatus } from "@/lib/canon/constants";
import { canEditEvent, canManageCanon } from "@/lib/canon/permissions";
import { eventSaveSchema } from "@/lib/canon/schema";
import { isUniqueViolation } from "@/lib/db/errors";
import { notifyRealtime } from "@/lib/realtime/notify";
import {
  approvedProfileIds,
  categoryExists,
  countEventsInCategory,
  createCanonCategory,
  createCanonEvent,
  deleteCanonCategory,
  deleteCanonEvent,
  getCanonEventAuthInfo,
  renameCanonCategory,
  saveCanonEvent,
  setCanonEventStatus,
} from "@/utils/canonDbActions";

export type ActionResult = { ok: true } | { error: string };
export type CreateResult = { ok: true; id: string } | { error: string };

const idSchema = z.uuid();

async function broadcast(eventId?: string) {
  revalidatePath("/dashboard/canon");
  if (eventId) revalidatePath(`/dashboard/canon/${eventId}`);
  await notifyRealtime({ scope: "canon" });
}

/**
 * Guard for editing one event: signed in + approved, and either a global
 * `canon.event.manage` holder or a SPOC holding `canon.event.edit.own`
 * (`canEditEvent`). The relationship alone is never enough.
 */
async function requireEventEditor(eventId: string): Promise<
  | { error: string }
  | {
      ctx: AccessContext;
      info: { status: EventStatus; spocIds: string[] };
    }
> {
  const ctx = await getAccessContext();
  if (!ctx) return { error: "You are not signed in." };
  if (ctx.status !== "approved") {
    return { error: "Your account is not approved." };
  }
  const info = await getCanonEventAuthInfo(eventId);
  if (!info) return { error: "Event not found." };
  if (!canEditEvent(ctx, info.spocIds)) {
    return { error: "You are not allowed to edit this event." };
  }
  return { ctx, info };
}

// --- events ----------------------------------------------------------------

export async function createEvent(): Promise<CreateResult> {
  const ctx = await requireGlobalWriteAccess("canon.event.manage");
  if ("error" in ctx) return ctx;
  const id = await createCanonEvent(ctx.userId);
  await broadcast();
  return { ok: true, id };
}

export async function saveEvent(
  eventId: string,
  raw: unknown,
  expectedUpdatedAt: string,
): Promise<ActionResult> {
  if (!idSchema.safeParse(eventId).success) return { error: "Bad event id." };
  if (Number.isNaN(Date.parse(expectedUpdatedAt))) {
    return { error: "Bad version." };
  }
  const guard = await requireEventEditor(eventId);
  if ("error" in guard) return guard;
  const { ctx, info } = guard;

  const parsed = eventSaveSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  // Only managers assign SPOCs; a SPOC's save keeps the list as stored.
  if (!canManageCanon(ctx)) {
    data.spocIds = info.spocIds;
  } else {
    const valid = await approvedProfileIds(data.spocIds);
    if (valid.length !== data.spocIds.length) {
      return { error: "SPOCs must be approved members." };
    }
  }
  if (!(await categoryExists(data.categoryId))) {
    return { error: "Unknown category." };
  }

  const result = await saveCanonEvent({
    id: eventId,
    data,
    actorId: ctx.userId,
    expectedUpdatedAt,
  });
  if (result === "missing") return { error: "Event not found." };
  if (result === "stale") {
    return {
      error:
        "Someone else updated this event while you were editing. Reload to see their changes.",
    };
  }
  if (result === "ok") await broadcast(eventId);
  return { ok: true };
}

export async function setEventStatus(
  eventId: string,
  status: string,
): Promise<ActionResult> {
  if (!idSchema.safeParse(eventId).success) return { error: "Bad event id." };
  const parsed = z.enum(EVENT_STATUSES).safeParse(status);
  if (!parsed.success) return { error: "Bad status." };
  const guard = await requireEventEditor(eventId);
  if ("error" in guard) return guard;
  await setCanonEventStatus(eventId, parsed.data, guard.ctx.userId);
  await broadcast(eventId);
  return { ok: true };
}

export async function deleteEvent(eventId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(eventId).success) return { error: "Bad event id." };
  const ctx = await requireGlobalWriteAccess("canon.event.manage");
  if ("error" in ctx) return ctx;
  await deleteCanonEvent(eventId);
  await broadcast(eventId);
  return { ok: true };
}

// --- categories --------------------------------------------------------------

const categoryName = z
  .string()
  .trim()
  .min(1, "Name is required.")
  .max(40, "Keep it under 40 characters.");

export async function addCategory(name: string): Promise<ActionResult> {
  const ctx = await requireGlobalWriteAccess("canon.event.manage");
  if ("error" in ctx) return ctx;
  const parsed = categoryName.safeParse(name);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Invalid." };
  try {
    await createCanonCategory(parsed.data);
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "That category already exists." };
    throw e;
  }
  await broadcast();
  return { ok: true };
}

export async function renameCategory(
  id: string,
  name: string,
): Promise<ActionResult> {
  const ctx = await requireGlobalWriteAccess("canon.event.manage");
  if ("error" in ctx) return ctx;
  if (!idSchema.safeParse(id).success) return { error: "Bad category id." };
  const parsed = categoryName.safeParse(name);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Invalid." };
  try {
    await renameCanonCategory(id, parsed.data);
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "That category already exists." };
    throw e;
  }
  await broadcast();
  return { ok: true };
}

export async function removeCategory(id: string): Promise<ActionResult> {
  const ctx = await requireGlobalWriteAccess("canon.event.manage");
  if ("error" in ctx) return ctx;
  if (!idSchema.safeParse(id).success) return { error: "Bad category id." };
  const inUse = await countEventsInCategory(id);
  if (inUse > 0) {
    return {
      error: `${inUse} event${inUse === 1 ? " uses" : "s use"} this category. Move them first.`,
    };
  }
  await deleteCanonCategory(id);
  await broadcast();
  return { ok: true };
}
