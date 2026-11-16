import { describe, expect, test } from "bun:test";
import type { Grants } from "@/lib/auth/permissions";
import {
  formatWhen,
  istToDate,
  kindLabel,
  splitByTime,
  toISTDate,
  toISTTime,
} from "./format";
import { buildIcs } from "./ics";
import { canCreateAny, canManageEvent, createOptions } from "./permissions";
import { meetingInputSchema } from "./schema";

const g = (global: string[], byDomain: Grants["byDomain"] = {}): Grants => ({
  global,
  byDomain,
});

// Shapes the seed produces: leads hold forum.domain.manage via a domain role,
// leadership holds both Forum permissions via global roles.
const creativesLead = { grants: g([], { creatives: ["forum.domain.manage"] }) };
const president = {
  grants: g(["forum.domain.manage", "forum.club.manage"]),
};
const member = { grants: g([], { technical: ["opus.task.status.own"] }) };
const readOnly = { grants: g([]) };

describe("permissions", () => {
  test("a domain lead manages only their own domain's meetings", () => {
    expect(
      canManageEvent(creativesLead, {
        kind: "domain_meeting",
        domain: "creatives",
      }),
    ).toBe(true);
    expect(
      canManageEvent(creativesLead, {
        kind: "domain_meeting",
        domain: "technical",
      }),
    ).toBe(false);
  });

  test("full-team meetings need the grant org-wide", () => {
    expect(
      canManageEvent(creativesLead, { kind: "club_meeting", domain: null }),
    ).toBe(false);
    // Ticked on a domain-scoped role, it still must not count.
    const domainClub = {
      grants: g([], { creatives: ["forum.club.manage"] }),
    };
    expect(
      canManageEvent(domainClub, { kind: "club_meeting", domain: null }),
    ).toBe(false);
    expect(
      canManageEvent(president, { kind: "club_meeting", domain: null }),
    ).toBe(true);
  });

  test("leadership manages every domain", () => {
    for (const domain of ["technical", "creatives", "operations", "outreach"]) {
      expect(
        canManageEvent(president, { kind: "domain_meeting", domain }),
      ).toBe(true);
    }
  });

  test("a domain meeting without a domain is never manageable", () => {
    expect(
      canManageEvent(president, { kind: "domain_meeting", domain: null }),
    ).toBe(false);
  });

  test("create options follow the grants", () => {
    expect(createOptions(creativesLead)).toEqual({
      club: false,
      domains: ["creatives"],
    });
    expect(createOptions(president).club).toBe(true);
    expect(createOptions(president).domains).toHaveLength(4);
    expect(canCreateAny(createOptions(member))).toBe(false);
    expect(canCreateAny(createOptions(readOnly))).toBe(false);
  });
});

const valid = {
  kind: "domain_meeting",
  domain: "technical",
  title: "  Weekly sync ",
  description: "",
  venue: "",
  date: "2027-03-10",
  startTime: "17:30",
  endTime: "19:00",
  notify: true,
};

describe("meetingInputSchema", () => {
  test("parses IST times into instants and trims", () => {
    const r = meetingInputSchema.parse(valid);
    expect(r.title).toBe("Weekly sync");
    expect(r.venue).toBeNull();
    expect(r.startsAt.toISOString()).toBe("2027-03-10T12:00:00.000Z");
    expect(r.endsAt?.toISOString()).toBe("2027-03-10T13:30:00.000Z");
  });

  test("domain is required iff it's a domain meeting", () => {
    expect(
      meetingInputSchema.safeParse({ ...valid, domain: null }).success,
    ).toBe(false);
    expect(
      meetingInputSchema.safeParse({ ...valid, kind: "club_meeting" }).success,
    ).toBe(false);
    expect(
      meetingInputSchema.safeParse({
        ...valid,
        kind: "club_meeting",
        domain: null,
      }).success,
    ).toBe(true);
  });

  test("rejects external kind, bad times and end before start", () => {
    expect(
      meetingInputSchema.safeParse({ ...valid, kind: "external" }).success,
    ).toBe(false);
    expect(
      meetingInputSchema.safeParse({ ...valid, startTime: "25:00" }).success,
    ).toBe(false);
    expect(
      meetingInputSchema.safeParse({ ...valid, endTime: "17:00" }).success,
    ).toBe(false);
    expect(
      meetingInputSchema.safeParse({ ...valid, endTime: null }).success,
    ).toBe(true);
  });

  test("rejects an unknown domain and an empty title", () => {
    expect(
      meetingInputSchema.safeParse({ ...valid, domain: "finance" }).success,
    ).toBe(false);
    expect(
      meetingInputSchema.safeParse({ ...valid, title: "  " }).success,
    ).toBe(false);
  });
});

describe("format", () => {
  test("IST round-trips", () => {
    const at = istToDate("2026-11-18", "00:15");
    expect(at?.toISOString()).toBe("2026-11-17T18:45:00.000Z");
    if (!at) throw new Error("unreachable");
    expect(toISTDate(at)).toBe("2026-11-18");
    expect(toISTTime(at)).toBe("00:15");
  });

  test("formatWhen", () => {
    const s = istToDate("2026-11-18", "17:30");
    const e = istToDate("2026-11-18", "19:00");
    if (!s || !e) throw new Error("unreachable");
    expect(formatWhen(s, e)).toBe("Wed, 18 Nov 2026 · 05:30 PM – 07:00 PM");
    expect(formatWhen(s, null)).toBe("Wed, 18 Nov 2026 · 05:30 PM");
    const nextDay = istToDate("2026-11-19", "01:00");
    if (!nextDay) throw new Error("unreachable");
    expect(formatWhen(s, nextDay)).toBe(
      "Wed, 18 Nov 2026 · 05:30 PM – Thu, 19 Nov 2026 · 01:00 AM",
    );
  });

  test("kindLabel", () => {
    expect(kindLabel("domain_meeting", "creatives")).toBe("Creatives meeting");
    expect(kindLabel("club_meeting", null)).toBe("Full-team meeting");
  });

  test("splitByTime uses the end, and sorts each side", () => {
    const now = new Date("2026-11-18T12:00:00Z");
    const mk = (id: string, s: string, e: string | null) => ({
      id,
      startsAt: new Date(s),
      endsAt: e ? new Date(e) : null,
    });
    const { upcoming, past } = splitByTime(
      [
        mk("ongoing", "2026-11-18T11:00:00Z", "2026-11-18T13:00:00Z"),
        mk("old", "2026-11-01T10:00:00Z", null),
        mk("older", "2026-10-01T10:00:00Z", null),
        mk("later", "2026-12-01T10:00:00Z", null),
        mk("soon", "2026-11-19T10:00:00Z", null),
      ],
      now,
    );
    expect(upcoming.map((e) => e.id)).toEqual(["ongoing", "soon", "later"]);
    expect(past.map((e) => e.id)).toEqual(["old", "older"]);
  });
});

describe("ics", () => {
  test("builds a REQUEST with escaped text and a sequence", () => {
    const ics = buildIcs(
      {
        id: "abc",
        title: "Sync; weekly, v2",
        description: "line1\nline2",
        venue: null,
        startsAt: new Date("2027-03-10T12:00:00Z"),
        endsAt: null,
        revision: 3,
        url: null,
      },
      "REQUEST",
      "no-reply@fc-os.tech",
      new Date("2027-03-01T00:00:00Z"),
    );
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("UID:abc@fc-os.tech");
    expect(ics).toContain("SEQUENCE:3");
    expect(ics).toContain("DTSTART:20270310T120000Z");
    // No end → one hour.
    expect(ics).toContain("DTEND:20270310T130000Z");
    expect(ics).toContain("SUMMARY:Sync\\; weekly\\, v2");
    expect(ics).toContain("DESCRIPTION:line1\\nline2");
    expect(ics).not.toContain("LOCATION:");
    expect(ics.endsWith("\r\n")).toBe(true);
  });

  test("CANCEL marks the event cancelled", () => {
    const ics = buildIcs(
      {
        id: "abc",
        title: "x",
        description: "",
        venue: "TP 401",
        startsAt: new Date("2027-03-10T12:00:00Z"),
        endsAt: new Date("2027-03-10T13:00:00Z"),
        revision: 1,
        url: "https://fc-os.tech/dashboard/forum/abc",
      },
      "CANCEL",
      "no-reply@fc-os.tech",
    );
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("LOCATION:TP 401");
  });
});
