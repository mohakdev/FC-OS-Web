import { describe, expect, test } from "bun:test";
import { linkMeta } from "../profile/links";
import {
  formatPhone,
  linkLimit,
  normalizeIndianPhone,
  normalizeLink,
  profileDetailsSchema,
} from "./profile";

describe("normalizeIndianPhone", () => {
  test.each([
    ["9876543210", "+919876543210"],
    ["98765 43210", "+919876543210"],
    ["+91-98765-43210", "+919876543210"],
    ["+91 98765 43210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["09876543210", "+919876543210"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeIndianPhone(raw)).toBe(expected);
  });

  test.each(["12345", "5876543210", "98765432101", "+1 415 555 0100", ""])(
    "rejects %s",
    (raw) => {
      expect(normalizeIndianPhone(raw)).toBeNull();
    },
  );
});

test("formatPhone", () => {
  expect(formatPhone("+919876543210")).toBe("+91 98765 43210");
  expect(formatPhone("93011 61940")).toBe("93011 61940"); // legacy, untouched
});

describe("normalizeLink", () => {
  test("adds https when the scheme is missing", () => {
    expect(normalizeLink("linkedin.com/in/x")).toBe(
      "https://linkedin.com/in/x",
    );
  });
  test("keeps http(s)", () => {
    expect(normalizeLink("http://mysite.dev")).toBe("http://mysite.dev/");
  });
  test.each(["javascript:alert(1)", "ftp://x.com", "mysite", "   "])(
    "rejects %s",
    (raw) => {
      expect(normalizeLink(raw)).toBeNull();
    },
  );
});

describe("linkMeta", () => {
  test("known platforms get their label", () => {
    expect(linkMeta("https://www.linkedin.com/in/x")?.label).toBe("LinkedIn");
    expect(linkMeta("https://in.linkedin.com/in/x")?.label).toBe("LinkedIn");
    expect(linkMeta("https://github.com/x")?.label).toBe("GitHub");
    expect(linkMeta("https://twitter.com/x")?.label).toBe("X");
  });
  test("personal sites fall back to the bare hostname", () => {
    expect(linkMeta("https://www.myportfolio.dev/")?.label).toBe(
      "myportfolio.dev",
    );
  });
  test("lookalike domains are not matched", () => {
    expect(linkMeta("https://notgithub.com/x")?.label).toBe("notgithub.com");
  });
});

describe("profileDetailsSchema", () => {
  const base = {
    phone: "98765 43210",
    dateOfBirth: "2005-06-01",
    quote: "",
    links: [],
  };
  test("normalizes a valid payload", () => {
    const r = profileDetailsSchema.parse({
      ...base,
      links: ["github.com/a", "", "github.com/a"],
    });
    expect(r.phone).toBe("+919876543210");
    expect(r.quote).toBeNull();
    expect(r.links).toEqual(["https://github.com/a"]);
  });
  test("schema allows up to 6 links (the extended ceiling)", () => {
    const six = ["a.com", "b.com", "c.com", "d.com", "e.com", "f.com"];
    expect(
      profileDetailsSchema.safeParse({ ...base, links: six }).success,
    ).toBe(true);
    expect(
      profileDetailsSchema.safeParse({ ...base, links: [...six, "g.com"] })
        .success,
    ).toBe(false);
  });
  test("rejects a 151-char quote", () => {
    expect(
      profileDetailsSchema.safeParse({ ...base, quote: "x".repeat(151) })
        .success,
    ).toBe(false);
  });
  test("rejects a future date of birth", () => {
    expect(
      profileDetailsSchema.safeParse({ ...base, dateOfBirth: "2999-01-01" })
        .success,
    ).toBe(false);
  });
});

test("linkLimit: 3 by default, 6 with profile.links.extended", () => {
  expect(linkLimit(false)).toBe(3);
  expect(linkLimit(true)).toBe(6);
});
