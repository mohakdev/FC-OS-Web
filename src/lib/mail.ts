import { createTransport } from "nodemailer";

// The app's one SMTP transport (Resend by default — smtp.resend.com:465), shared
// by the OTP login mail (src/lib/auth/server.ts) and Forum invites. Configured
// via SMTP_* env vars; sender via MAIL_FROM. `auth` is only attached when
// SMTP_USER is set, so an unauthenticated relay still works if ever needed.
export const mailer = createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 465),
  secure: process.env.SMTP_SECURE !== "false", // 465 = implicit TLS
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
});

export const MAIL_FROM = process.env.MAIL_FROM ?? "FC OS <no-reply@fc-os.tech>";

/** The bare address inside MAIL_FROM (`"FC OS <a@b>"` → `"a@b"`). */
export const MAIL_FROM_ADDRESS =
  /<([^>]+)>/.exec(MAIL_FROM)?.[1] ?? MAIL_FROM.trim();

/** Public origin for links in emails (falls back to the production domain). */
export const APP_URL = (
  process.env.BETTER_AUTH_URL ?? "https://fc-os.tech"
).replace(/\/$/, "");
