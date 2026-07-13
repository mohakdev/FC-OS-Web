"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/database/db";
import { profiles } from "@/database/schemas/profiles";
import { rolePermissions } from "@/database/schemas/role_permissions";
import { rolesEnum } from "@/database/schemas/roles";
import { userRoles } from "@/database/schemas/user_roles";
import {
  isProtectedGrant,
  PERMISSION_IDS,
  type PermissionId,
} from "@/lib/auth/catalog";
import { requireWriteAccess } from "@/lib/auth/context";
import { notifyRealtime } from "@/lib/realtime/notify";

export type GridResult = { ok: true } | { error: string };

type RoleId = (typeof rolesEnum.enumValues)[number];

const VALID_ROLES = new Set<string>(rolesEnum.enumValues);
const VALID_PERMISSIONS = new Set<string>(PERMISSION_IDS);

// Capabilities that must never end up with nobody holding them. Losing
// `role.manage` means nobody can open this page again; losing `member.manage`
// means nobody can fix a member's roles.
const MUST_HAVE_A_HOLDER: PermissionId[] = ["role.manage", "member.manage"];

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
 *  2. You may not revoke `role.manage` from a role you yourself hold.
 *  3. No change may leave zero approved users holding a must-have permission.
 *     Checked inside the transaction, so two admins revoking concurrently can't
 *     each see a count of 1 and both commit.
 */
export async function setRolePermissions(
  roleId: string,
  permissionIds: string[],
): Promise<GridResult> {
  const ctx = await requireWriteAccess("role.manage");
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

  // (2) Don't let an admin revoke role management from their own role.
  if (ctx.roleIds.includes(roleId) && !next.has("role.manage")) {
    return {
      error: "You can't remove role management from a role you hold yourself.",
    };
  }

  try {
    await db.transaction(async (tx) => {
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

      // (3) Someone must still hold each must-have permission.
      for (const permission of MUST_HAVE_A_HOLDER) {
        const holders = await tx
          .select({ userId: userRoles.id })
          .from(rolePermissions)
          .innerJoin(userRoles, eq(userRoles.role, rolePermissions.roleId))
          .innerJoin(profiles, eq(profiles.id, userRoles.id))
          .where(
            and(
              eq(rolePermissions.permissionId, permission),
              eq(profiles.status, "approved"),
            ),
          )
          .limit(1);

        if (holders.length === 0) {
          throw new Error(
            `That would leave nobody able to ${
              permission === "role.manage"
                ? "manage roles and permissions"
                : "manage members"
            }.`,
          );
        }
      }
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
  const ctx = await requireWriteAccess("role.manage");
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
