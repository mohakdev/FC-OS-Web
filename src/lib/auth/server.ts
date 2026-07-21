import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { createTransport } from "nodemailer";
import { db } from "@/database/db";
import * as authSchema from "@/database/schemas/auth";
import { SRMIST_EMAIL_SUFFIX } from "@/lib/validation/onboarding";

// Singleton self-hosted Better Auth server instance. Exposes the Better Auth
// server API under `auth.api.*` (e.g. `auth.api.getSession`) plus `auth.handler`
// for the API route. Route gating in proxy.ts uses `getSessionCookie`.
//
// NOTE: any RSC / Server Action / Route Handler that reads the session must set
// `export const dynamic = "force-dynamic"`.
const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
  throw new Error("BETTER_AUTH_SECRET must be set in the environment");
}

// OTP email delivery over real SMTP (Resend by default — smtp.resend.com:465).
// Configured via SMTP_* env vars; sender via MAIL_FROM. `auth` is only attached
// when SMTP_USER is set, so an unauthenticated relay still works if ever needed.
const mailer = createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 465),
  secure: process.env.SMTP_SECURE !== "false", // 465 = implicit TLS
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
});

// Membership is @srmist.edu.in only. The client form validates this, but the
// Better Auth API is public and would otherwise let anyone POST any email,
// receive a code, and auto-create a verified account — so we re-enforce it
// server-side (OTP send + user creation). Normalize before comparing.
const isSrmistEmail = (email: string) =>
  email.trim().toLowerCase().endsWith(SRMIST_EMAIL_SUFFIX);

const NON_SRMIST_MESSAGE = `Sign-in is restricted to ${SRMIST_EMAIL_SUFFIX} accounts.`;

export const auth = betterAuth({
  secret,
  baseURL: process.env.BETTER_AUTH_URL,
  // Apex + www both served at :3005; Better Auth otherwise trusts only baseURL.
  trustedOrigins: ["https://fc-os.tech", "https://www.fc-os.tech"],
  database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
  advanced: {
    // UUID ids so Better Auth's `user.id` matches the uuid `profiles.auth_user_id`.
    database: { generateId: "uuid" },
    // Behind Cloudflare Worker -> Tailscale Funnel, `x-forwarded-for` is
    // client-forgeable and may not carry the real client IP. Trust only
    // `cf-connecting-ip` (Cloudflare overwrites it at the edge, so it can't be
    // spoofed) — this is what the rate limiter keys per-client buckets on. The
    // Worker forwards this header untouched. See `workers/fc-os-proxy.js`.
    ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
  },
  // Enable rate limiting explicitly. The default is `enabled: isProduction`,
  // which silently turns OFF if the app is ever run without NODE_ENV=production.
  // The emailOTP plugin adds its own 3/60s per-path limits on top of this.
  rateLimit: { enabled: true },
  // Authoritative membership gate: no non-@srmist.edu.in `user` row can ever be
  // created, regardless of which auth endpoint is hit.
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!isSrmistEmail(user.email)) {
            throw new APIError("BAD_REQUEST", { message: NON_SRMIST_MESSAGE });
          }
        },
      },
    },
  },
  plugins: [
    // Passwordless OTP — preserves the client `emailOtp` API the login flow uses.
    emailOTP({
      // 10 min (Better Auth default is 300s/5min) — absorbs SMTP + read lag.
      // Note: each new send DELETES the previous code, so only the newest is valid.
      expiresIn: 600,
      // Store only a hash of the code (default is "plain") so a DB/backup leak
      // never exposes live login codes.
      storeOTP: "hashed",
      async sendVerificationOTP({ email, otp }) {
        // Never email a code to a non-member address (relay/spam abuse, wasted
        // SMTP quota) — the account couldn't be created anyway (see databaseHooks).
        if (!isSrmistEmail(email)) {
          throw new APIError("BAD_REQUEST", { message: NON_SRMIST_MESSAGE });
        }
        try {
          await mailer.sendMail({
            from: process.env.MAIL_FROM ?? "FC OS <no-reply@fc-os.tech>",
            to: email,
            subject: "Your FC OS login code",
            text: `Your FC OS login code is ${otp}. It expires in 10 minutes. If you request a new code, older codes stop working.`,
          });
        } catch (cause) {
          // Surface a clean retryable error instead of a bare 500, and log the
          // real SMTP cause for diagnosis.
          console.error("[auth] Failed to send OTP email:", cause);
          throw new APIError("INTERNAL_SERVER_ERROR", {
            message: "Could not send the login code. Please try again.",
          });
        }
      },
    }),
    // Must be last: lets Server Actions set auth cookies.
    nextCookies(),
  ],
});
