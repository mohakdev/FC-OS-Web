import { describe, expect, test } from "bun:test";
import type { Grants } from "@/lib/auth/permissions";
import {
  ago,
  feeLabel,
  formatDay,
  formatRange,
  formatStamp,
  groupEvents,
  participationLabel,
  todayIST,
} from "./format";
import { canEditEvent, canManageCanon, canSeeEvent } from "./permissions";
import { eventSaveSchema } from "./schema";

describe("format", () => {
  test("formatDay keeps the calendar day", () => {
    expect(formatDay("2027-02-14")).toBe("14 Feb 2027");
    expect(formatDay("2026-01-01")).toBe("01 Jan 2026");
  });

  test("formatRange collapses single days", () => {
    expect(formatRange("2027-02-14", null)).toBe("14 Feb 2027");
    expect(formatRange("2027-02-14", "2027-02-14")).toBe("14 Feb 2027");
    expect(formatRange("2027-02-14", "2027-02-16")).toBe(
      "14 Feb 2027 – 16 Feb 2027",
    );
  });

  test("formatStamp renders IST 12h", () => {
    // 10:42 UTC = 16:12 IST
    expect(formatStamp(new Date("2026-11-13T10:42:00Z"))).toBe(
      "13 Nov 2026; 04:12 PM",
    );
    // 20:00 UTC = 01:30 IST next day
    expect(formatStamp(new Date("2026-11-13T20:00:00Z"))).toBe(
      "14 Nov 2026; 01:30 AM",
    );
  });

  test("todayIST rolls over at IST midnight", () => {
    expect(todayIST(new Date("2026-11-13T18:29:00Z"))).toBe("2026-11-13");
    expect(todayIST(new Date("2026-11-13T18:31:00Z"))).toBe("2026-11-14");
  });

  test("ago", () => {
    const now = new Date("2026-11-13T12:00:00Z");
    expect(ago(new Date("2026-11-13T11:59:30Z"), now)).toBe("just now");
    expect(ago(new Date("2026-11-13T10:00:00Z"), now)).toBe("2 hours ago");
    expect(ago(new Date("2025-11-13T12:00:00Z"), now)).toBe("1 year ago");
  });

  test("feeLabel", () => {
    expect(feeLabel(false, null)).toBe("Free");
    expect(feeLabel(true, null)).toBe("Paid");
    expect(feeLabel(true, 1999)).toBe("Paid · ₹1,999");
  });
});

describe("participationLabel", () => {
  test("all types", () => {
    expect(participationLabel("individual", null, null)).toBe("Individual");
    expect(participationLabel("team", 2, 4)).toBe("Team · 2–4");
    expect(participationLabel("team", 4, 4)).toBe("Team · 4");
    expect(participationLabel("both", 2, 4)).toBe(
      "Team or solo · teams of 2–4",
    );
  });
});

describe("groupEvents", () => {
  const ev = (
    id: string,
    startDate?: string,
    endDate: string | null = null,
  ) => ({
    id,
    eventDate: startDate ? { startDate, endDate } : null,
  });
  const today = "2026-11-13";

  test("buckets by event range, inclusive of both ends", () => {
    const g = groupEvents(
      [
        ev("starts-today", "2026-11-13", "2026-11-15"),
        ev("ends-today", "2026-11-10", "2026-11-13"),
        ev("single-today", "2026-11-13"),
        ev("tomorrow", "2026-11-14"),
        ev("undated"),
        ev("yesterday", "2026-11-12"),
        ev("last-month", "2026-10-01", "2026-10-03"),
      ],
      today,
    );
    expect(g.ongoing.map((e) => e.id)).toEqual([
      "ends-today",
      "starts-today",
      "single-today",
    ]);
    expect(g.upcoming.map((e) => e.id)).toEqual(["tomorrow", "undated"]);
    expect(g.past.map((e) => e.id)).toEqual(["yesterday", "last-month"]);
  });
});

describe("permissions", () => {
  const g = (global: string[], byDomain: Grants["byDomain"] = {}): Grants => ({
    global,
    byDomain,
  });
  const me = "u1";

  test("manage only counts globally", () => {
    expect(
      canManageCanon({ userId: me, grants: g(["canon.event.manage"]) }),
    ).toBe(true);
    expect(
      canManageCanon({
        userId: me,
        grants: g([], { technical: ["canon.event.manage"] }),
      }),
    ).toBe(false);
  });

  test("SPOC edit needs the capability", () => {
    const member = {
      userId: me,
      grants: g([], { technical: ["canon.event.edit.own"] }),
    };
    const advisor = { userId: me, grants: g([]) };
    expect(canEditEvent(member, [me])).toBe(true);
    expect(canEditEvent(member, ["someone-else"])).toBe(false);
    expect(canEditEvent(advisor, [me])).toBe(false);
  });

  test("drafts hidden from non-editors", () => {
    const member = { userId: me, grants: g([]) };
    expect(canSeeEvent(member, { status: "draft", spocIds: [] })).toBe(false);
    expect(canSeeEvent(member, { status: "draft", spocIds: [me] })).toBe(true);
    expect(canSeeEvent(member, { status: "published", spocIds: [] })).toBe(
      true,
    );
  });
});

describe("eventSaveSchema", () => {
  const base = {
    name: "  Entrepreneurship Bootcamp XII ",
    categoryId: "6f1c2a9e-3b6d-4c1e-9a8f-2d4b5c6e7f80",
    isPaid: false,
    fee: 199,
    participation: "individual",
    teamMin: 3,
    teamMax: 5,
    shortDesc: "",
    spocIds: [],
    dates: [],
    venues: [],
    phases: [],
  };

  test("trims and drops fee for unpaid events", () => {
    const out = eventSaveSchema.parse(base);
    expect(out.name).toBe("Entrepreneurship Bootcamp XII");
    expect(out.fee).toBeNull();
  });

  test("rejects end before start and duplicate kinds", () => {
    expect(
      eventSaveSchema.safeParse({
        ...base,
        dates: [
          {
            kind: "event",
            startDate: "2027-02-16",
            endDate: "2027-02-14",
            status: "tentative",
          },
        ],
      }).success,
    ).toBe(false);
    const d = {
      kind: "event",
      startDate: "2027-02-14",
      endDate: null,
      status: "confirmed",
    };
    expect(eventSaveSchema.safeParse({ ...base, dates: [d, d] }).success).toBe(
      false,
    );
  });

  test("team sizes: individual nulls them, team/both enforce 2..10", () => {
    const ind = eventSaveSchema.parse(base);
    expect([ind.teamMin, ind.teamMax]).toEqual([null, null]);

    const ok = (p: string, min: number | null, max: number | null) =>
      eventSaveSchema.safeParse({
        ...base,
        participation: p,
        teamMin: min,
        teamMax: max,
      }).success;
    expect(ok("team", 2, 4)).toBe(true);
    expect(ok("both", 3, 3)).toBe(true);
    expect(ok("team", 2, 10)).toBe(true);
    expect(ok("team", null, 4)).toBe(false);
    expect(ok("both", 2, null)).toBe(false);
    expect(ok("team", 1, 4)).toBe(false);
    expect(ok("team", 2, 11)).toBe(false);
    expect(ok("team", 5, 4)).toBe(false);
  });
});
