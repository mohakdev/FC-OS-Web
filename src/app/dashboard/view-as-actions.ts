"use server";

import { revalidatePath } from "next/cache";

import { getAccessContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { getRoleScopes } from "@/lib/auth/roles";
import {
  clearViewAsCookie,
  validateViewAsTarget,
  writeViewAsCookie,
} from "@/lib/auth/view-as";

export type ViewAsResult = { ok: true } | { error: string };

/**
 * Starts (or replaces) a "view as" switch. Gated on the REAL grants — once
 * switched into a role without `platform.view_as`, `grants` no longer holds it,
 * yet the toolbar must still be able to switch to a different role.
 */
export async function startViewAs(
  role: string,
  domain: string | null,
): Promise<ViewAsResult> {
  const ctx = await getAccessContext();
  if (!ctx) return { error: "You are not signed in." };
  if (ctx.status !== "approved") {
    return { error: "Your account is not approved." };
  }
  if (!can(ctx.realGrants, "platform.view_as")) {
    return { error: "You are not allowed to do that." };
  }

  const target = validateViewAsTarget(role, domain, await getRoleScopes());
  if ("error" in target) return target;

  await writeViewAsCookie(target);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Ends the switch. No permission check: getting back out must always work. */
export async function exitViewAs(): Promise<ViewAsResult> {
  await clearViewAsCookie();
  revalidatePath("/", "layout");
  return { ok: true };
}
