// Lockout arithmetic: "would this write leave someone — or everyone — unable to
// get back in?".
//
// Deliberately pure and DB-free. The guards it feeds sit on four different write
// paths (the permission grid, `user_roles`, and `profiles.status`), each with its
// own query shape; keeping the *decision* in one testable place is what stops the
// three copies from drifting apart the way the hardcoded role lists once did.

import type { PermissionId } from "./catalog";

/**
 * Capabilities that must never end up with nobody holding them. Losing
 * `role.manage` means nobody can open the permission grid again; losing
 * `member.manage` means nobody can fix a member's roles.
 *
 * Both are checked at GLOBAL scope, because both pages gate on `can()` and not
 * `canAny()` — a domain-scoped holder cannot open either one, so counting them
 * as a holder would let the org lock itself out while the invariant reported a
 * green light.
 */
export const MUST_HAVE_A_HOLDER: readonly PermissionId[] = [
  "role.manage",
  "member.manage",
];

/**
 * Would the actor still hold `permission` after this edit to one role's grants?
 *
 * The question is capability loss, NOT role membership. Holding the edited role
 * is not by itself a problem: the actor may hold the same permission through
 * another role (a president editing `associate lead` keeps `role.manage` via the
 * protected president grant), and a role that never granted the permission in
 * the first place must stay freely editable.
 *
 * Only `global`-scoped roles count, for the same reason `MUST_HAVE_A_HOLDER`
 * does: the pages these guards protect are gated on global `can()`.
 */
export function keepsPermission({
  heldRoles,
  editedRoleId,
  nextPermissions,
  grantsByRole,
  scopes,
  permission,
}: {
  /** Roles the actor holds — `AccessContext.roleIds`. */
  heldRoles: string[];
  /** The role whose grants are being rewritten. */
  editedRoleId: string;
  /** The role's permissions AFTER the edit. */
  nextPermissions: ReadonlySet<string>;
  /** Current grants of every other role the actor holds. */
  grantsByRole: ReadonlyMap<string, ReadonlySet<string>>;
  scopes: ReadonlyMap<string, "domain" | "global">;
  permission: PermissionId;
}): boolean {
  return heldRoles.some((role) => {
    if (scopes.get(role) !== "global") return false;
    const granted =
      role === editedRoleId ? nextPermissions : grantsByRole.get(role);
    return granted?.has(permission) ?? false;
  });
}

/**
 * Which must-have permissions this write would take from the org — held before
 * it, held by nobody after.
 *
 * "Don't make it worse", rather than "must always be non-empty". A hard
 * post-condition would deadlock any database that is already short a holder:
 * a freshly seeded club has no approved users at all, so approving its very
 * first president — the write that FIXES the invariant — would be the one thing
 * the guard rejected.
 */
export function missingAfter(
  before: readonly PermissionId[],
  after: readonly PermissionId[],
): PermissionId[] {
  const held = new Set(after);
  return before.filter((p) => !held.has(p));
}

/** Message for a write that would strip the org's last holder of `permission`. */
export function lockoutMessage(permissions: readonly PermissionId[]): string {
  const what = permissions
    .map((p) =>
      p === "role.manage" ? "manage roles and permissions" : "manage members",
    )
    .join(" or ");
  return `That would leave nobody able to ${what}.`;
}
