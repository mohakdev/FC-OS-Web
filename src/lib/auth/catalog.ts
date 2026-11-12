// The permission catalog — the single source of truth for what capabilities
// exist. Seeded into the `permissions` table by `src/database/seed.ts`; the
// role→permission grid in `role_permissions` decides who holds them.
//
// Only add a permission here when the feature it gates actually exists. An admin
// ticking a checkbox that does nothing destroys trust in the grid faster than a
// missing feature does — so MoM / Attendance / FC-TV / Performance (still stubs)
// get their permissions when they get their features.

export const PERMISSIONS = [
  {
    id: "member.approve",
    label: "Approve members",
    description:
      "Decide pending membership requests. Held via a domain-scoped role, this only covers applicants in that domain.",
  },
  {
    id: "member.manage",
    label: "Manage members",
    description: "Edit a member's roles and domains in the Member Directory.",
  },
  {
    id: "member.remove",
    label: "Remove members",
    description: "Remove an approved member from the club.",
  },
  {
    id: "settings.manage",
    label: "Manage app settings",
    description: "Change app-wide settings.",
  },
  {
    id: "role.manage",
    label: "Manage roles & permissions",
    description:
      "Edit the role→permission grid itself. The keys to the kingdom — grant sparingly.",
  },
  {
    id: "opus.task.manage",
    label: "Manage Opus tasks",
    description:
      "Create, edit, move and delete tasks and subtasks in a domain's board.",
  },
  {
    id: "opus.config.manage",
    label: "Manage Opus board config",
    description: "Edit a domain's statuses, priorities and labels.",
  },
  {
    id: "opus.task.status.own",
    label: "Set status on own tasks",
    description:
      "Change the status of a task you are assigned to. Status is the only field a non-manager assignee may change.",
  },
  {
    id: "bug.manage",
    label: "Manage bug reports",
    description:
      "Mark bug reports fixed, reopen them, and delete them. Filing a report needs no permission — every approved member can.",
  },
  {
    id: "platform.view_as",
    label: "Switch role (view as)",
    description:
      "Temporarily see and act as another role (+ domain) via the dev toolbar. Switched grants are always intersected with your real ones, so it can only narrow, never escalate.",
  },
] as const;

export type PermissionId = (typeof PERMISSIONS)[number]["id"];

export const PERMISSION_IDS: readonly PermissionId[] = PERMISSIONS.map(
  (p) => p.id,
);

/**
 * Grants that may never be revoked — the break-glass floor. As long as one
 * approved president exists, the org can always get back into the permission
 * grid. Deliberately a code constant, not a DB row: a DB-backed "protected"
 * flag would itself be editable through the very UI it is meant to protect.
 */
/**
 * The platform maintainer role. Holds every permission (all protected below)
 * and is assigned in the DB only: no role-writing action accepts it, and
 * `setMemberRoles` / `setMemberDecision` refuse to strip it.
 */
export const SUPERADMIN_ROLE = "superadmin";

export const PROTECTED_GRANTS: ReadonlyArray<{
  roleId: string;
  permissionId: PermissionId;
}> = [
  { roleId: "president", permissionId: "role.manage" },
  { roleId: "president", permissionId: "member.manage" },
  // Superadmin's whole row is locked: every permission, irrevocable.
  ...PERMISSIONS.map((p) => ({ roleId: SUPERADMIN_ROLE, permissionId: p.id })),
];

export const isProtectedGrant = (roleId: string, permissionId: string) =>
  PROTECTED_GRANTS.some(
    (g) => g.roleId === roleId && g.permissionId === permissionId,
  );
