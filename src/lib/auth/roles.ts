// Role metadata read from the DB rather than re-hardcoded per call site.
//
// Replaces the copies of the role lists that had accumulated in
// `utils/dbActions.ts` and `member-directory/actions.ts` — `roles.scope` and the
// `role_permissions` grid already hold this, and duplicating them in TypeScript
// is how they drift.

import { and, eq, inArray } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/database/db";
import { profiles } from "@/database/schemas/profiles";
import { rolePermissions } from "@/database/schemas/role_permissions";
import { roles, rolesEnum } from "@/database/schemas/roles";
import { userRoles } from "@/database/schemas/user_roles";
import { type PermissionId, SUPERADMIN_ROLE } from "./catalog";
import { MUST_HAVE_A_HOLDER } from "./lockout";

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
 * Every permission the given roles grant ORG-WIDE — the `global`-scoped ones
 * only.
 *
 * The scope-blind `grantsForRoles` is the wrong tool for any "will this person
 * still be able to open that page?" question: the pages behind `role.manage` and
 * `member.manage` gate on `can()` (global), so a permission held through a
 * domain-scoped role does not keep their access.
 */
export async function globalGrantsForRoles(
  roleIds: string[],
): Promise<Set<string>> {
  const scopes = await getRoleScopes();
  return grantsForRoles(roleIds.filter((r) => scopes.get(r) === "global"));
}

/** `db`, or the handle passed into a `db.transaction` callback. */
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Roles the app may assign. Superadmin is DB-only, so every role-writing
 * Server Action validates against this, not `rolesEnum.enumValues` — hiding it
 * from the dropdowns alone would still accept a crafted POST.
 */
export const ASSIGNABLE_ROLES: ReadonlySet<string> = new Set(
  rolesEnum.enumValues.filter((r) => r !== SUPERADMIN_ROLE),
);

/** Does this profile hold the (DB-only) superadmin role? */
export async function holdsSuperadmin(
  profileId: string,
  exec: Executor = db,
): Promise<boolean> {
  const rows = await exec
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(
      and(eq(userRoles.id, profileId), eq(userRoles.role, SUPERADMIN_ROLE)),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Which of `MUST_HAVE_A_HOLDER` currently have at least one approved holder via
 * a `global`-scoped role.
 *
 * Take this before and after a write and diff it with `missingAfter` — that is
 * the org-lockout invariant, and it is the same one on all three write paths
 * that can break it: the permission grid (`role_permissions`), role assignment
 * (`user_roles`) and approval decisions (`profiles.status`).
 *
 * Pass the transaction handle so the reading and the write are one atomic unit;
 * two admins each revoking concurrently would otherwise both see a count of 1
 * and both commit.
 */
export async function heldMustHavePermissions(
  exec: Executor = db,
): Promise<PermissionId[]> {
  const held: PermissionId[] = [];

  for (const permission of MUST_HAVE_A_HOLDER) {
    const holders = await exec
      .select({ userId: userRoles.id })
      .from(rolePermissions)
      .innerJoin(roles, eq(roles.id, rolePermissions.roleId))
      .innerJoin(userRoles, eq(userRoles.role, rolePermissions.roleId))
      .innerJoin(profiles, eq(profiles.id, userRoles.id))
      .where(
        and(
          eq(rolePermissions.permissionId, permission),
          eq(roles.scope, "global"),
          eq(profiles.status, "approved"),
        ),
      )
      .limit(1);

    if (holders.length > 0) held.push(permission);
  }

  return held;
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
