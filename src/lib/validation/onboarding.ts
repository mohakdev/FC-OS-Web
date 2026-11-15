import { z } from "zod";

import { phoneSchema } from "./profile";

// Official org email domain. Sign-up and onboarding both require it.
export const SRMIST_EMAIL_SUFFIX = "@srmist.edu.in";

// Official netID: 2 letters + 4 digits. The email is netID + suffix.
export const NETID_REGEX = /^[a-z]{2}\d{4}$/;

// Progressive pattern for the slot input: accepts any valid *prefix* while
// typing (input-otp tests the partial value on every keystroke and paste).
export const NETID_PARTIAL_PATTERN = "^(?:[a-zA-Z]{1,2}|[a-zA-Z]{2}\\d{1,4})$";

export const netIdSchema = z.string().trim().toLowerCase().regex(NETID_REGEX, {
  message: "Invalid NetID. It should be 2 letters followed by 4 digits.",
});

// Normalize (trim + lowercase) BEFORE validating, so a trailing space or
// capitals don't reject an otherwise-valid address and send/verify always agree
// on the same string. `safeParse(...).data` is the normalized email to use.
export const srmistEmail = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email({ message: "Enter a valid email address" })
      .refine((value) => value.endsWith(SRMIST_EMAIL_SUFFIX), {
        message: `Email must be a ${SRMIST_EMAIL_SUFFIX} address`,
      }),
  );

// Domains a member can join (mirrors the `domain` enum / `domains` table).
export const DOMAIN_IDS = [
  "technical",
  "creatives",
  "operations",
  "outreach",
] as const;

export const DOMAIN_LABELS: Record<(typeof DOMAIN_IDS)[number], string> = {
  technical: "Technical",
  creatives: "Creatives",
  operations: "Operations & Marketing",
  outreach: "Outreach",
};

// SRM registration number: "RA" + 13 digits. Normalized (trim, no inner
// spaces, uppercase) BEFORE validating so "ra 2511…" lands on the stored form.
// The error states the format only — never an example ID.
export const RA_REGEX = /^RA\d{13}$/;

export const raNumberSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, "").toUpperCase())
  .pipe(
    z.string().regex(RA_REGEX, {
      message: "RA number must be RA followed by 13 digits.",
    }),
  );

export const onboardingSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  phone: phoneSchema,
  raNumber: raNumberSchema,
  gender: z.enum(["male", "female"]),
  dateOfBirth: z.coerce.date({ message: "Enter a valid date of birth" }),
  domains: z.array(z.enum(DOMAIN_IDS)).min(1, "Select at least one domain"),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
