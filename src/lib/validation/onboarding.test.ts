import { describe, expect, test } from "bun:test";
import { onboardingSchema, raNumberSchema } from "./onboarding";

// Synthetic IDs only — never a real member's RA.
const VALID = "RA0000000000001";

describe("raNumberSchema", () => {
  test.each([
    [VALID, VALID],
    ["ra0000000000001", VALID],
    ["  RA0000000000001  ", VALID],
    ["RA 0000 0000 00001", VALID],
  ])("%s → %s", (raw, expected) => {
    expect(raNumberSchema.parse(raw)).toBe(expected);
  });

  test.each([
    "",
    "RA000000000001", // 12 digits
    "RA00000000000012", // 14 digits
    "0000000000001", // no prefix
    "RB0000000000001",
    "RA000000000000X",
  ])("rejects %s", (raw) => {
    const result = raNumberSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  test("error message states the format, never the input", () => {
    const result = raNumberSchema.safeParse("RA123");
    expect(result.success).toBe(false);
    const message = result.error?.issues[0]?.message ?? "";
    expect(message).toBe("RA number must be RA followed by 13 digits.");
    expect(message).not.toContain("RA123");
  });
});

describe("onboardingSchema", () => {
  const base = {
    firstName: "Test",
    lastName: "Member",
    phone: "98765 43210",
    raNumber: "ra0000000000001",
    gender: "male",
    dateOfBirth: "2005-01-01",
    domains: ["technical"],
  };

  test("normalizes phone + RA", () => {
    const parsed = onboardingSchema.parse(base);
    expect(parsed.phone).toBe("+919876543210");
    expect(parsed.raNumber).toBe(VALID);
  });

  test("rejects a non-Indian phone", () => {
    expect(
      onboardingSchema.safeParse({ ...base, phone: "12345" }).success,
    ).toBe(false);
  });

  test("requires an RA number", () => {
    const { raNumber: _ra, ...rest } = base;
    expect(onboardingSchema.safeParse(rest).success).toBe(false);
  });
});
