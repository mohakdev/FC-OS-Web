import { z } from "zod";

// Self-service profile edits (the Customize dialog on /dashboard/profile).

export const QUOTE_MAX = 150;
export const LINKS_MAX = 3;

// Avatar upload limits. The client crops to a square and sends a webp; the
// server re-encodes with sharp regardless, so these bound the raw upload.
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_INPUT_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const AVATAR_SIZE_PX = 512;

/**
 * Indian mobile number → canonical `+91XXXXXXXXXX`. Accepts spaces, dashes,
 * brackets and an optional `+91` / `91` / `0` prefix, so "98765 43210",
 * "+91-98765-43210" and "098765 43210" all land on the same stored value
 * (the `phone` column is UNIQUE, so the canonical form is what dedupes).
 */
export function normalizeIndianPhone(raw: string): string | null {
  let digits = raw.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+91")) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith("91"))
    digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0"))
    digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

export const phoneSchema = z.string().transform((value, ctx) => {
  const phone = normalizeIndianPhone(value);
  if (!phone) {
    ctx.addIssue({
      code: "custom",
      message: "Enter a 10-digit Indian mobile number",
    });
    return z.NEVER;
  }
  return phone;
});

/** Adds `https://` when the scheme is missing, then requires http(s). */
export function normalizeLink(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    // Needs a real host with a dot ("mysite" alone is a typo, not a website).
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const linkSchema = z.string().transform((value, ctx) => {
  const url = normalizeLink(value);
  if (!url) {
    ctx.addIssue({ code: "custom", message: `"${value}" is not a valid link` });
    return z.NEVER;
  }
  return url;
});

export const profileDetailsSchema = z.object({
  phone: phoneSchema,
  dateOfBirth: z.iso
    .date({ message: "Enter a valid date of birth" })
    .refine((d) => new Date(d) < new Date(), {
      message: "Date of birth must be in the past",
    }),
  quote: z
    .string()
    .trim()
    .max(QUOTE_MAX, `Quote must be ${QUOTE_MAX} characters or fewer`)
    .transform((q) => (q === "" ? null : q)),
  links: z
    .array(z.string())
    // Blank rows in the form are just unused slots.
    .transform((links) => links.filter((l) => l.trim() !== ""))
    .pipe(
      z
        .array(linkSchema)
        .max(LINKS_MAX, `You can add up to ${LINKS_MAX} links`),
    )
    .transform((links) => [...new Set(links)]),
});

export type ProfileDetailsInput = z.input<typeof profileDetailsSchema>;

/** "+919876543210" → "+91 98765 43210"; anything not canonical is shown as-is. */
export function formatPhone(phone: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
}
