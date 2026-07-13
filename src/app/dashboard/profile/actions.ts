"use server";

import { revalidatePath } from "next/cache";

import { requireWriteAccess } from "@/lib/auth/context";
import { notifyRealtime } from "@/lib/realtime/notify";
import { setDomainLeadsCanApprove } from "@/utils/dbActions";

export type SettingsResult = { ok: true } | { error: string };

/** Toggle whether domain leads can approve members. Requires `settings.manage`. */
export async function setDomainLeadApproval(
  enabled: boolean,
): Promise<SettingsResult> {
  const ctx = await requireWriteAccess("settings.manage");
  if ("error" in ctx) return ctx;

  await setDomainLeadsCanApprove(enabled);
  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard/member-requests");
  // Changes what leads may do — push it to open sessions.
  await notifyRealtime({ scope: "member" });
  return { ok: true };
}
