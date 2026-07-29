"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/database/db";
import { rolePermissions } from "@/database/schemas/role_permissions";
import { rolesEnum } from "@/database/schemas/roles";
import { isProtectedGrant, PERMISSION_IDS } from "@/lib/auth/catalog";
import { requireGlobalWriteAccess } from "@/lib/auth/context";
import {
  keepsPermission,
  lockoutMessage,
  missingAfter,
} from "@/lib/auth/lockout";
import {
  getRoleScopes,
  grantsForRoles,
  heldMustHavePermissions,
} from "@/lib/auth/roles";
import { notifyRealtime } from "@/lib/realtime/notify";

export type GridResult = { ok: true } | { error: string };

type RoleId = (typeof rolesEnum.enumValues)[number];

const VALID_ROLES = new Set<string>(rolesEnum.enumValues);
const VALID_PERMISSIONS = new Set<string>(PERMISSION_IDS);

/**
 * Replaces one role's entire permission set.
 *
 * The unit of write is a whole role, not a single checkbox: it is naturally
 * idempotent, gives one coherent place to run the lockout invariants, and can't
 * produce duplicate rows on a double-click.
 *
 * Three guards, all enforced HERE rather than only in the UI — a disabled
 * checkbox stops nobody who can call a Server Action directly:
 *
 *  1. Protected grants (`PROTECTED_GRANTS`) can never be revoked. As long as one
 *     approved president exists, the org can always get back into this page.
 *  2. You may not revoke `role.manage` from YOURSELF. The test is capability
 *     loss, not membership of the edited role: this rewrites the whole club's
 *     authority model, so holding the role being edited is normal and must not
 *     block the save while another global role of yours still grants it.
 *  3. No change may take the org's last approved holder of a must-have
 *     permission. Checked inside the transaction, so two admins revoking
 *     concurrently can't each see a count of 1 and both commit.
 *
 * The grid is org-wide with no domain to narrow to, hence
 * `requireGlobalWriteAccess` — see its docblock.
 */
export async function setRolePermissions(
  roleId: string,
  permissionIds: string[],
): Promise<GridResult> {
  const ctx = await requireGlobalWriteAccess("role.manage");
  if ("error" in ctx) return ctx;

  if (!VALID_ROLES.has(roleId)) return { error: "Unknown role." };
  for (const p of permissionIds) {
    if (!VALID_PERMISSIONS.has(p)) return { error: `Unknown permission: ${p}` };
  }

  const next = new Set(permissionIds);

  // (1) Protected grants may not be revoked.
  for (const p of PERMISSION_IDS) {
    if (isProtectedGrant(roleId, p) && !next.has(p)) {
      return {
        error: `“${p}” can't be removed from ${roleId} — it's the break-glass grant that keeps the club from locking itself out.`,
      };
    }
  }

  // (2) Don't let an admin revoke role management from themselves. Only worth
  // simulating when they hold the role at all — editing a role you don't hold
  // cannot touch your own grants.
  if (ctx.roleIds.includes(roleId)) {
    const scopes = await getRoleScopes();
    const otherGrants = await Promise.all(
      ctx.roleIds
        .filter((r) => r !== roleId)
        .map(async (r) => [r, await grantsForRoles([r])] as const),
    );

    const keeps = keepsPermission({
      heldRoles: ctx.roleIds,
      editedRoleId: roleId,
      nextPermissions: next,
      grantsByRole: new Map(otherGrants),
      scopes,
      permission: "role.manage",
    });

    if (!keeps) {
      return {
        error:
          "That would remove your own ability to manage roles. Grant it to another role you hold first.",
      };
    }
  }

  try {
    await db.transaction(async (tx) => {
      const before = await heldMustHavePermissions(tx);

      await tx
        .delete(rolePermissions)
        .where(eq(rolePermissions.roleId, roleId as RoleId));

      if (next.size > 0) {
        await tx.insert(rolePermissions).values(
          [...next].map((permissionId) => ({
            roleId: roleId as RoleId,
            permissionId,
          })),
        );
      }

      // (3) The change may not take the last holder of a must-have permission.
      const lost = missingAfter(before, await heldMustHavePermissions(tx));
      if (lost.length > 0) throw new Error(lockoutMessage(lost));
    });
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Could not save the permissions.",
    };
  }

  revalidatePath("/dashboard/settings/roles");
  // Changes what people may do — push it so open sessions re-render their nav
  // and lose/gain buttons. This is a UX affordance, NOT the security boundary:
  // a revoked user with a stale tab is denied by the next Server Action anyway,
  // because `getAuthState()` re-reads grants every request.
  await notifyRealtime({ scope: "member" });
  return { ok: true };
}

/** Every role with its currently-granted permissions, for the grid. */
export async function getPermissionGrid(): Promise<
  Record<string, string[]> | { error: string }
> {
  const ctx = await requireGlobalWriteAccess("role.manage");
  if ("error" in ctx) return ctx;

  const rows = await db
    .select({
      roleId: rolePermissions.roleId,
      permissionId: rolePermissions.permissionId,
    })
    .from(rolePermissions)
    .where(inArray(rolePermissions.permissionId, [...PERMISSION_IDS]));

  const grid: Record<string, string[]> = {};
  for (const r of rows) (grid[r.roleId] ??= []).push(r.permissionId);
  return grid;
}
