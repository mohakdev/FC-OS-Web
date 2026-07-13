// Role metadata read from the DB rather than re-hardcoded per call site.
//
// Replaces the copies of the role lists that had accumulated in
// `utils/dbActions.ts` and `member-directory/actions.ts` — `roles.scope` and the
// `role_permissions` grid already hold this, and duplicating them in TypeScript
// is how they drift.

import { inArray } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/database/db";
import { rolePermissions } from "@/database/schemas/role_permissions";
import { roles } from "@/database/schemas/roles";

/** `roleId -> scope`, straight from the `roles` table. Per-request cached. */
export const getRoleScopes = cache(
  async (): Promise<Map<string, "domain" | "global">> => {
    const rows = await db
      .select({ id: roles.id, scope: roles.scope })
      .from(roles);
    return new Map(rows.map((r) => [r.id as string, r.scope]));
  },
);

/** Roles not tied to a domain — their `user_roles.domain` is null and ignored. */
export async function isGlobalRole(roleId: string): Promise<boolean> {
  return (await getRoleScopes()).get(roleId) === "global";
}

/** Every permission the given roles grant, ignoring scope. */
export async function grantsForRoles(roleIds: string[]): Promise<Set<string>> {
  if (roleIds.length === 0) return new Set();
  const rows = await db
    .select({ permissionId: rolePermissions.permissionId })
    .from(rolePermissions)
    // biome-ignore lint/suspicious/noExplicitAny: enum-typed column, ids validated by caller
    .where(inArray(rolePermissions.roleId, roleIds as any));
  return new Set(rows.map((r) => r.permissionId));
}

/**
 * Read-only roles (advisor/alumni) must be EXCLUSIVE — they may not be combined
 * with any role that grants something.
 *
 * The permission model is purely additive: it has no deny rules. Under the old
 * model `isReadOnly` was a deny-override, so an `alumni` who also held `lead`
 * was denied everything. Union the grants instead and they'd silently gain write
 * access. Rather than reintroduce deny rules — which make the grid unreadable
 * and "what can this person do?" unanswerable — we forbid the combination.
 *
 * "Read-only" is derived, not hardcoded: a role is read-only iff it grants
 * nothing. Returns an error string, or null when the set is valid.
 */
export async function checkExclusiveReadOnlyRole(
  roleIds: string[],
): Promise<string | null> {
  const unique = [...new Set(roleIds)];
  if (unique.length < 2) return null;

  const grantCounts = await Promise.all(
    unique.map(async (r) => ({ role: r, grants: await grantsForRoles([r]) })),
  );
  const readOnly = grantCounts.filter((g) => g.grants.size === 0);
  const writing = grantCounts.filter((g) => g.grants.size > 0);

  if (readOnly.length > 0 && writing.length > 0) {
    return `A read-only role (${readOnly
      .map((r) => r.role)
      .join(", ")}) can't be combined with another role.`;
  }
  return null;
}
