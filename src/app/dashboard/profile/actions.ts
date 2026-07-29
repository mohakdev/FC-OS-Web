"use server";

import { revalidatePath } from "next/cache";

import { requireGlobalWriteAccess } from "@/lib/auth/context";
import { notifyRealtime } from "@/lib/realtime/notify";
import { setDomainLeadsCanApprove } from "@/utils/dbActions";

export type SettingsResult = { ok: true } | { error: string };

/**
 * Toggle whether domain leads can approve members. Requires `settings.manage`
 * held GLOBALLY — the toggle is an app-wide setting that grants `member.approve`
 * to every lead in the club, so a domain-scoped holder must not reach it. The
 * card is already rendered behind global `can()` in `profile/page.tsx`.
 */
export async function setDomainLeadApproval(
  enabled: boolean,
): Promise<SettingsResult> {
  const ctx = await requireGlobalWriteAccess("settings.manage");
  if ("error" in ctx) return ctx;

  await setDomainLeadsCanApprove(enabled);
  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard/member-requests");
  // Changes what leads may do — push it to open sessions.
  await notifyRealtime({ scope: "member" });
  return { ok: true };
}
