// Parity harness: proves the DB-backed permission model reproduces the hardcoded
// role Sets it replaces, for every role/domain combination a user could hold.
//
//   bun test
//
// Both models are derived from the SAME `user_roles` rows, so the comparison is
// honest — deriving the old context from a role list and the new grants from
// something else would prove nothing.
//
// Two divergence classes are EXPECTED, and are the whole point of the exercise:
//
//   1. domain-union over-grant — the old `ctx.domainIds` unions domains across
//      ALL of a user's roles, so a manager in one domain could manage a domain
//      where they are only a plain member. The new model resolves per
//      (role, domain) and does not. 4 real users are affected on prod.
//
//   2. read-only + write role — old `isReadOnly` is a deny-override that beats
//      every other role; additive grants have no such thing. Prod had exactly one
//      such user; his extra role was removed, and `assertExclusiveReadOnlyRole`
//      now prevents the combination. Asserted here as unreachable-by-construction.
//
// Any OTHER divergence is a bug in the seed truth table and fails the suite.

import { describe, expect, test } from "bun:test";
import {
  can,
  canIn as canInGrants,
  domainsWith,
  type GrantRow,
  resolveGrants,
} from "./permissions";

const DOMAINS = ["technical", "creatives", "operations", "outreach"] as const;
type Domain = (typeof DOMAINS)[number];

// --- the model being replaced (copied verbatim from the pre-refactor source) ---
const APPROVER_ROLES = new Set([
  "human resource manager",
  "vice president",
  "president",
]);
const DOMAIN_LEAD_ROLES = new Set(["lead", "co-lead"]);
const READ_ONLY_ROLES = new Set(["advisor", "alumni"]);
const DOMAIN_MANAGER_ROLES = new Set(["lead", "co-lead", "associate lead"]);

// --- the model replacing it (must mirror BASE_GRANTS in src/database/seed.ts) ---
const SCOPE: Record<string, "domain" | "global"> = {
  member: "domain",
  "associate lead": "domain",
  "co-lead": "domain",
  lead: "domain",
  "human resource manager": "global",
  "vice president": "global",
  president: "global",
  advisor: "global",
  alumni: "global",
};

const OPUS_MANAGER = [
  "opus.task.manage",
  "opus.config.manage",
  "opus.task.status.own",
];
const APPROVER = [
  "member.approve",
  "member.manage",
  "member.remove",
  ...OPUS_MANAGER,
];

// Production grants `member.approve` to lead/co-lead via the permission grid.
const DOMAIN_LEADS_CAN_APPROVE = true;
const leadGrants = DOMAIN_LEADS_CAN_APPROVE
  ? [...OPUS_MANAGER, "member.approve"]
  : OPUS_MANAGER;

const GRANTS: Record<string, string[]> = {
  member: ["opus.task.status.own"],
  "associate lead": OPUS_MANAGER,
  "co-lead": leadGrants,
  lead: leadGrants,
  "human resource manager": APPROVER,
  "vice president": [...APPROVER, "role.manage"],
  president: [...APPROVER, "role.manage"],
  advisor: [],
  alumni: [],
};

/** A row of `user_roles`. `domain` is null for global-scoped roles. */
type Row = { role: string; domain: Domain | null };

// --- old model, derived from rows ---
function oldCtx(rows: Row[]) {
  const roleIds = [...new Set(rows.map((r) => r.role))];
  // The union bug lives here: domains are collected across ALL roles.
  const domainIds = [
    ...new Set(
      rows.map((r) => r.domain).filter((d): d is Domain => d !== null),
    ),
  ];
  const isApprover = roleIds.some((r) => APPROVER_ROLES.has(r));
  const hasManagerRole = roleIds.some((r) => DOMAIN_MANAGER_ROLES.has(r));
  return {
    roleIds,
    domainIds,
    isApprover,
    isDomainLead: roleIds.some((r) => DOMAIN_LEAD_ROLES.has(r)),
    isReadOnly: roleIds.some((r) => READ_ONLY_ROLES.has(r)),
    hasManagerRole,
    canManageDomain: (d: Domain) =>
      isApprover || (hasManagerRole && domainIds.includes(d)),
    manageableDomains: () =>
      isApprover ? [...DOMAINS] : hasManagerRole ? domainIds : [],
  };
}

// --- new model, derived from the same rows ---
function newGrants(rows: Row[]) {
  const grantRows: GrantRow[] = rows.flatMap((r) =>
    (GRANTS[r.role] ?? []).map((permissionId) => ({
      permissionId,
      scope: SCOPE[r.role],
      domain: r.domain,
    })),
  );
  return resolveGrants(grantRows);
}

// Every row a user could hold: domain-scoped roles × 4 domains, global roles × null.
const ALL_ROWS: Row[] = [
  ...Object.keys(SCOPE)
    .filter((r) => SCOPE[r] === "domain")
    .flatMap((role) => DOMAINS.map((domain) => ({ role, domain }))),
  ...Object.keys(SCOPE)
    .filter((r) => SCOPE[r] === "global")
    .map((role) => ({ role, domain: null })),
];

/** All subsets of `xs` up to `maxSize`. */
function subsets<T>(xs: T[], maxSize: number): T[][] {
  const out: T[][] = [[]];
  const build = (start: number, cur: T[]) => {
    if (cur.length >= maxSize) return;
    for (let i = start; i < xs.length; i++) {
      const next = [...cur, xs[i]];
      out.push(next);
      build(i + 1, next);
    }
  };
  build(0, []);
  return out;
}

const isReadOnlyCombo = (rows: Row[]) =>
  rows.some((r) => READ_ONLY_ROLES.has(r.role)) &&
  rows.some((r) => !READ_ONLY_ROLES.has(r.role));

/** Does this row-set trigger the old domain-union over-grant in domain `d`? */
const isUnionOverGrant = (rows: Row[], d: Domain) => {
  const managerDomains = rows
    .filter((r) => DOMAIN_MANAGER_ROLES.has(r.role))
    .map((r) => r.domain);
  const anyDomains = rows.map((r) => r.domain);
  // old grants manage in d via the union; new grants it only if a MANAGER role
  // is actually held in d.
  return anyDomains.includes(d) && !managerDomains.includes(d);
};

describe("permission model parity vs the hardcoded role Sets", () => {
  const cases = subsets(ALL_ROWS, 4);

  test("enumerates a meaningful search space", () => {
    expect(cases.length).toBeGreaterThan(5000);
  });

  test("canManageDomain ≡ canIn('opus.task.manage', d), except the known union over-grant", () => {
    const divergences: string[] = [];

    for (const rows of cases) {
      if (isReadOnlyCombo(rows)) continue; // class 2 — see below
      const o = oldCtx(rows);
      const g = newGrants(rows);

      for (const d of DOMAINS) {
        const oldAllows = o.canManageDomain(d);
        const newAllows = canInGrants(g, "opus.task.manage", d);
        if (oldAllows === newAllows) continue;

        // The ONLY tolerated divergence: old over-grants via the domain union.
        const tolerated =
          oldAllows &&
          !newAllows &&
          o.hasManagerRole &&
          isUnionOverGrant(rows, d);
        if (!tolerated) {
          divergences.push(
            `${JSON.stringify(rows)} in ${d}: old=${oldAllows} new=${newAllows}`,
          );
        }
      }
    }

    expect(divergences).toEqual([]);
  });

  test("the union over-grant is real and the new model is strictly tighter (never looser)", () => {
    let overGrants = 0;
    for (const rows of cases) {
      if (isReadOnlyCombo(rows)) continue;
      const o = oldCtx(rows);
      const g = newGrants(rows);
      for (const d of DOMAINS) {
        const oldAllows = o.canManageDomain(d);
        const newAllows = canInGrants(g, "opus.task.manage", d);
        // new must NEVER allow something old denied — that would be an escalation.
        expect(!(newAllows && !oldAllows)).toBe(true);
        if (oldAllows && !newAllows) overGrants++;
      }
    }
    expect(overGrants).toBeGreaterThan(0); // the bug exists, and we fix it
  });

  test("isApprover ≡ can('member.manage')", () => {
    for (const rows of cases) {
      if (isReadOnlyCombo(rows)) continue;
      expect(can(newGrants(rows), "member.manage")).toBe(
        oldCtx(rows).isApprover,
      );
    }
  });

  test("manageableDomains ≡ domainsWith('opus.config.manage')", () => {
    for (const rows of cases) {
      if (isReadOnlyCombo(rows)) continue;
      const o = oldCtx(rows);
      const nu = domainsWith(newGrants(rows), "opus.config.manage", DOMAINS);
      // Same tolerance: old may list extra domains via the union over-grant.
      expect(nu.every((d) => o.manageableDomains().includes(d))).toBe(true);
      for (const d of o.manageableDomains()) {
        if (!nu.includes(d))
          expect(isUnionOverGrant(rows, d as Domain)).toBe(true);
      }
    }
  });

  test("read-only roles hold zero grants, so exclusivity makes them read-only", () => {
    for (const role of ["advisor", "alumni"]) {
      const g = newGrants([{ role, domain: null }]);
      expect(g.global).toEqual([]);
      expect(g.byDomain).toEqual({});
    }
  });

  test("read-only + write role WOULD escalate — which is why exclusivity is enforced", () => {
    // Documents the counterexample. `assertExclusiveReadOnlyRole` makes this
    // combination unrepresentable; if that guard is ever removed, this is the bug.
    const g = newGrants([
      { role: "alumni", domain: null },
      { role: "lead", domain: "technical" },
    ]);
    expect(
      oldCtx([
        { role: "alumni", domain: null },
        { role: "lead", domain: "technical" },
      ]).isReadOnly,
    ).toBe(true); // old: denied everything
    expect(canInGrants(g, "opus.task.manage", "technical")).toBe(true); // new: would allow
  });
});

describe("resolveGrants branches on roles.scope, never on domain nullability", () => {
  test("a global role with a stray domain still grants org-wide", () => {
    const g = resolveGrants([
      { permissionId: "member.manage", scope: "global", domain: "technical" },
    ]);
    expect(can(g, "member.manage")).toBe(true);
    expect(canInGrants(g, "member.manage", "creatives")).toBe(true);
  });

  test("a domain role with no domain grants nothing (no org-wide escalation)", () => {
    const g = resolveGrants([
      { permissionId: "opus.task.manage", scope: "domain", domain: null },
    ]);
    expect(can(g, "opus.task.manage")).toBe(false);
    for (const d of DOMAINS) {
      expect(canInGrants(g, "opus.task.manage", d)).toBe(false);
    }
  });

  test("a domain grant does not leak into other domains", () => {
    const g = resolveGrants([
      {
        permissionId: "opus.task.manage",
        scope: "domain",
        domain: "technical",
      },
    ]);
    expect(canInGrants(g, "opus.task.manage", "technical")).toBe(true);
    expect(canInGrants(g, "opus.task.manage", "creatives")).toBe(false);
    expect(can(g, "opus.task.manage")).toBe(false);
  });
});
