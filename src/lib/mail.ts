import { createTransport } from "nodemailer";

/** App-wide send rate cap (messages/second). Invalid or unset → 2. */
const parsedRate = Number.parseInt(process.env.SMTP_RATE_PER_SEC ?? "", 10);
export const SMTP_RATE_PER_SEC =
  Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : 2;

// The app's one SMTP transport (Resend by default — smtp.resend.com:465), shared
// by the OTP login mail (src/lib/auth/server.ts) and Forum invites. Configured
// via SMTP_* env vars; sender via MAIL_FROM. `auth` is only attached when
// SMTP_USER is set, so an unauthenticated relay still works if ever needed.
//
// Pooled: one reused connection (no TLS handshake + AUTH per message) and one
// rate limit for EVERY send in the process. Overlapping Forum runs and login
// codes all queue here, so together they never exceed SMTP_RATE_PER_SEC — and a
// login code waits behind at most one in-flight message per active run.
export const mailer = createTransport({
  pool: true,
  maxConnections: 1,
  rateDelta: 1000,
  rateLimit: SMTP_RATE_PER_SEC,
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
