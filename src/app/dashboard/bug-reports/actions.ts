"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAccessContext, requireGlobalWriteAccess } from "@/lib/auth/context";
import { notifyRealtime } from "@/lib/realtime/notify";
import {
  type BugStatus,
  createBugReport,
  deleteBugReport,
  setBugReportStatus,
} from "@/utils/bugDbActions";

export type BugResult = { ok: true } | { error: string };

const titleSchema = z
  .string()
  .trim()
  .min(4, "Give the bug a title of at least 4 characters.")
  .max(120, "Keep the title under 120 characters.");

const descriptionSchema = z
  .string()
  .trim()
  .max(2000, "Keep the details under 2000 characters.");

const statusSchema = z.enum(["open", "fixed"]);

async function revalidateBugs() {
  revalidatePath("/dashboard/bug-reports");
  await notifyRealtime({ scope: "bug-report" });
}

/**
 * Files a bug report. Deliberately gated on approval only, not on a permission:
 * every approved member should be able to report a bug. The guard still has to
 * be here — `proxy.ts` waves any request carrying a `next-action` header
 * through, and the dashboard layout never renders on a Server Action POST.
 */
export async function submitBugAction(
  title: string,
  description: string,
): Promise<BugResult> {
  const ctx = await getAccessContext();
  if (!ctx) return { error: "You are not signed in." };
  if (ctx.status !== "approved")
    return { error: "Your account is not approved." };

  const t = titleSchema.safeParse(title);
  if (!t.success) return { error: t.error.issues[0].message };
  const d = descriptionSchema.safeParse(description);
  if (!d.success) return { error: d.error.issues[0].message };

  await createBugReport({
    title: t.data,
    description: d.data.length ? d.data : null,
    reportedBy: ctx.userId,
  });

  await revalidateBugs();
  return { ok: true };
}

/**
 * Marks a report fixed or reopens it. Bug reports are org-wide with no domain
 * to narrow to, so `bug.manage` must be held GLOBALLY — same reasoning as
 * `updateMember` in the member directory.
 */
export async function setBugStatusAction(
  id: string,
  status: BugStatus,
): Promise<BugResult> {
  const ctx = await requireGlobalWriteAccess("bug.manage");
  if ("error" in ctx) return ctx;

  const s = statusSchema.safeParse(status);
  if (!s.success) return { error: "Invalid status." };

  await setBugReportStatus(id, s.data, ctx.userId);
  await revalidateBugs();
  return { ok: true };
}

export async function deleteBugAction(id: string): Promise<BugResult> {
  const ctx = await requireGlobalWriteAccess("bug.manage");
  if ("error" in ctx) return ctx;

  await deleteBugReport(id);
  await revalidateBugs();
  return { ok: true };
}
