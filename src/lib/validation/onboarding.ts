import { z } from "zod";

// Official org email domain. Sign-up and onboarding both require it.
export const SRMIST_EMAIL_SUFFIX = "@srmist.edu.in";

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

export const onboardingSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  phone: z.string().trim().min(5, "Enter a valid phone number"),
  gender: z.enum(["male", "female"]),
  dateOfBirth: z.coerce.date({ message: "Enter a valid date of birth" }),
  domains: z.array(z.enum(DOMAIN_IDS)).min(1, "Select at least one domain"),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
