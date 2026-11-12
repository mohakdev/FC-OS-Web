import { describe, expect, test } from "bun:test";
import { can, canIn, type Grants, intersectGrants } from "./permissions";
import { parseViewAs } from "./view-as";

const ALL = [
  "member.approve",
  "member.manage",
  "role.manage",
  "opus.task.manage",
  "platform.view_as",
];

describe("intersectGrants (view-as safety)", () => {
  test("superadmin switching to a domain role gets exactly that role", () => {
    const real: Grants = { global: ALL, byDomain: {} };
    const lead: Grants = {
      global: [],
      byDomain: { technical: ["opus.task.manage"] },
    };
    const g = intersectGrants(lead, real);
    expect(g.global).toEqual([]);
    expect(canIn(g, "opus.task.manage", "technical")).toBe(true);
    expect(canIn(g, "opus.task.manage", "creatives")).toBe(false);
  });

  test("switching can never add a permission the real user lacks", () => {
    // e.g. HRM ticked with view_as, switching into president.
    const hrm: Grants = {
      global: ["member.approve", "platform.view_as"],
      byDomain: {},
    };
    const president: Grants = {
      global: ["member.approve", "role.manage"],
      byDomain: {},
    };
    const g = intersectGrants(president, hrm);
    expect(can(g, "member.approve")).toBe(true);
    expect(can(g, "role.manage")).toBe(false);
  });

  test("a global switched grant narrows to the real user's domains", () => {
    const realLead: Grants = {
      global: ["platform.view_as"],
      byDomain: { technical: ["opus.task.manage"] },
    };
    const vp: Grants = { global: ["opus.task.manage"], byDomain: {} };
    const g = intersectGrants(vp, realLead);
    expect(can(g, "opus.task.manage")).toBe(false);
    expect(canIn(g, "opus.task.manage", "technical")).toBe(true);
    expect(canIn(g, "opus.task.manage", "outreach")).toBe(false);
  });

  test("a domain grant the real user lacks in that domain is dropped", () => {
    const real: Grants = {
      global: [],
      byDomain: { creatives: ["opus.task.manage"] },
    };
    const lead: Grants = {
      global: [],
      byDomain: { technical: ["opus.task.manage"] },
    };
    expect(intersectGrants(lead, real)).toEqual({ global: [], byDomain: {} });
  });
});

describe("parseViewAs (cookie validation)", () => {
  const scopes = new Map<string, "domain" | "global">([
    ["lead", "domain"],
    ["president", "global"],
    ["superadmin", "global"],
  ]);
  const now = 1_000_000;
  const raw = (v: object) => JSON.stringify(v);

  test("accepts a live domain-role switch", () => {
    expect(
      parseViewAs(
        raw({ role: "lead", domain: "technical", expiresAt: now + 1 }),
        scopes,
        now,
      ),
    ).toEqual({ role: "lead", domain: "technical", expiresAt: now + 1 });
  });

  test("global role drops any domain", () => {
    expect(
      parseViewAs(
        raw({ role: "president", domain: "technical", expiresAt: now + 1 }),
        scopes,
        now,
      )?.domain,
    ).toBeNull();
  });

  test("rejects expired, superadmin, unknown, missing domain, garbage", () => {
    for (const v of [
      raw({ role: "lead", domain: "technical", expiresAt: now }),
      raw({ role: "superadmin", expiresAt: now + 1 }),
      raw({ role: "nope", expiresAt: now + 1 }),
      raw({ role: "lead", expiresAt: now + 1 }),
      raw({ role: "lead", domain: "mars", expiresAt: now + 1 }),
      "not json",
      undefined,
    ]) {
      expect(parseViewAs(v, scopes, now)).toBeNull();
    }
  });
});
