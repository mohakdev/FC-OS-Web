// Regression suite for the self-lockout guards on the permission grid.
//
//   bun test
//
// The bug these cover: the guard used to ask "do you hold the role being
// edited?" instead of "would you actually lose the permission?". An associate
// lead who is also president — the president grant being irrevocable — was told
// "You can't remove role management from a role you hold yourself." on every
// save of the `associate lead` row, including saves that only touched the Opus
// checkboxes on a row that never granted `role.manage` at all.

import { describe, expect, test } from "bun:test";
import type { PermissionId } from "./catalog";
import { keepsPermission, lockoutMessage, missingAfter } from "./lockout";

// Mirrors BASE_GRANTS / roles.scope in src/database/seed.ts.
const SCOPES = new Map<string, "domain" | "global">([
  ["member", "domain"],
  ["associate lead", "domain"],
  ["co-lead", "domain"],
  ["lead", "domain"],
  ["human resource manager", "global"],
  ["vice president", "global"],
  ["president", "global"],
]);

const OPUS_MANAGER = [
  "opus.task.manage",
  "opus.config.manage",
  "opus.task.status.own",
];

const grants = (entries: Record<string, string[]>) =>
  new Map(Object.entries(entries).map(([role, ps]) => [role, new Set(ps)]));

const keepsRoleManage = (args: {
  heldRoles: string[];
  editedRoleId: string;
  next: string[];
  others: Record<string, string[]>;
}) =>
  keepsPermission({
    heldRoles: args.heldRoles,
    editedRoleId: args.editedRoleId,
    nextPermissions: new Set(args.next),
    grantsByRole: grants(args.others),
    scopes: SCOPES,
    permission: "role.manage",
  });

describe("keepsPermission", () => {
  test("the reported bug: another role you hold still grants it", () => {
    // Associate lead + president, clearing `role.manage` off `associate lead`.
    expect(
      keepsRoleManage({
        heldRoles: ["associate lead", "president"],
        editedRoleId: "associate lead",
        next: OPUS_MANAGER,
        others: { president: ["role.manage", "member.manage"] },
      }),
    ).toBe(true);
  });

  test("editing a row that never granted it is unaffected", () => {
    // The wider damage: with the seeded grid `associate lead` has no
    // `role.manage`, so the old membership test blocked ALL edits to that row.
    expect(
      keepsRoleManage({
        heldRoles: ["associate lead", "president"],
        editedRoleId: "associate lead",
        next: ["opus.task.manage", "opus.task.status.own"],
        others: { president: ["role.manage", "member.manage"] },
      }),
    ).toBe(true);
  });

  test("revoking it from your only global source is blocked", () => {
    expect(
      keepsRoleManage({
        heldRoles: ["vice president"],
        editedRoleId: "vice president",
        next: ["member.manage"],
        others: {},
      }),
    ).toBe(false);
  });

  test("keeping it on the edited role is enough", () => {
    expect(
      keepsRoleManage({
        heldRoles: ["vice president"],
        editedRoleId: "vice president",
        next: ["role.manage"],
        others: {},
      }),
    ).toBe(true);
  });

  test("a domain-scoped role does not keep you in — the page gates on can()", () => {
    expect(
      keepsRoleManage({
        heldRoles: ["lead", "vice president"],
        editedRoleId: "vice president",
        next: ["member.manage"],
        others: { lead: ["role.manage", ...OPUS_MANAGER] },
      }),
    ).toBe(false);
  });

  test("the edited role's own scope is respected too", () => {
    // Granting `role.manage` to a domain role does not save you.
    expect(
      keepsRoleManage({
        heldRoles: ["lead"],
        editedRoleId: "lead",
        next: ["role.manage"],
        others: {},
      }),
    ).toBe(false);
  });

  test("roles you don't hold are irrelevant", () => {
    expect(
      keepsRoleManage({
        heldRoles: ["president"],
        editedRoleId: "vice president",
        next: [],
        others: { president: ["role.manage"] },
      }),
    ).toBe(true);
  });
});

describe("missingAfter", () => {
  const BOTH: PermissionId[] = ["role.manage", "member.manage"];

  test("reports what the write took away", () => {
    expect(missingAfter(BOTH, ["member.manage"])).toEqual(["role.manage"]);
  });

  test("a permission already unheld before the write is not the write's fault", () => {
    // A freshly seeded club has no approved users, so approving its FIRST
    // president must not be rejected for "leaving nobody able to…".
    expect(missingAfter([], [])).toEqual([]);
    expect(missingAfter(["member.manage"], ["member.manage"])).toEqual([]);
  });

  test("gaining a holder is never a failure", () => {
    expect(missingAfter(["role.manage"], BOTH)).toEqual([]);
  });
});

describe("lockoutMessage", () => {
  test("names every capability that would be lost", () => {
    expect(lockoutMessage(["role.manage"])).toBe(
      "That would leave nobody able to manage roles and permissions.",
    );
    expect(lockoutMessage(["role.manage", "member.manage"])).toBe(
      "That would leave nobody able to manage roles and permissions or manage members.",
    );
  });
});
