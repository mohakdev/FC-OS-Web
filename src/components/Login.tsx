"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { REGEXP_ONLY_DIGITS } from "input-otp";
import { toast } from "sonner";

import { authClient } from "@/lib/auth/client";
import { SRMIST_EMAIL_SUFFIX, srmistEmail } from "@/lib/validation/onboarding";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "./ui/input-otp";
import { Label } from "./ui/label";

const Login = () => {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Tick the resend cooldown down to 0, one second at a time.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const sendCode = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    // `.data` is normalized (trimmed + lowercased) — use it everywhere so the
    // send and the later verify agree on the exact same address.
    const parsed = srmistEmail.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid email.");
      return;
    }
    const normalizedEmail = parsed.data;

    setLoading(true);
    try {
      const { error: otpError } = await authClient.emailOtp.sendVerificationOtp(
        {
          email: normalizedEmail,
          type: "sign-in",
        },
      );
      if (otpError) {
        setError(otpError.message ?? "Could not send the login code.");
        return;
      }
      setEmail(normalizedEmail);
      setOtp("");
      setStep("otp");
      setResendCooldown(30);
    } catch {
      setError("Could not reach the server. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  };

  // Re-send a fresh code. Each send invalidates the previous one (Better Auth),
  // so the newest email is the only one that works.
  const resend = async () => {
    if (resending || resendCooldown > 0) return;
    setResending(true);
    try {
      const { error: otpError } = await authClient.emailOtp.sendVerificationOtp(
        {
          email,
          type: "sign-in",
        },
      );
      if (otpError) {
        toast.error(otpError.message ?? "Could not send a new code.");
        return;
      }
      setOtp("");
      setError(null);
      setResendCooldown(30);
      toast.success("New code sent — check your inbox for the latest one.");
    } catch {
      toast.error(
        "Could not reach the server. Check your connection and retry.",
      );
    } finally {
      setResending(false);
    }
  };

  // Core verify — shared by the "Log in" button and the auto-submit that fires
  // once all six digits are entered/pasted.
  const submitOtp = async (code: string) => {
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { error: signInError } = await authClient.signIn.emailOtp({
        email,
        otp: code,
      });
      if (signInError) {
        setError(
          signInError.code === "INVALID_OTP"
            ? "That code expired or was replaced by a newer one — tap Resend code."
            : (signInError.message ?? "Invalid or expired code."),
        );
        return;
      }
      // The dashboard layout routes by profile state (onboarding / pending / ok).
      router.push("/dashboard");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = (event: FormEvent) => {
    event.preventDefault();
    void submitOtp(otp);
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-center font-serif text-3xl text-primary">
          Log In
        </CardTitle>
        <CardDescription className="text-center font-sans break-words">
          {step === "email"
            ? "We'll email you a one-time code."
            : `Enter the code sent to ${email}.`}
        </CardDescription>
      </CardHeader>

      {step === "email" ? (
        <form onSubmit={sendCode}>
          <CardContent className="my-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="name@srmist.edu.in"
                required
                disabled={loading}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "email-error" : undefined}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (error) setError(null);
                }}
                className="font-sans"
              />
            </div>
            {error ? (
              <p
                id="email-error"
                className="mt-4 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="flex-col gap-2">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending…" : "Send code"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              New here? Enter your {SRMIST_EMAIL_SUFFIX} email above and we'll
              email you a code — no separate sign-up needed.
            </p>
          </CardFooter>
        </form>
      ) : (
        <form onSubmit={verifyCode}>
          <CardContent className="my-4">
            <div className="grid gap-2">
              <Label htmlFor="otp">One-time code</Label>
              <InputOTP
                id="otp"
                maxLength={6}
                pattern={REGEXP_ONLY_DIGITS}
                autoComplete="one-time-code"
                autoFocus
                disabled={loading}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "otp-error" : undefined}
                containerClassName="justify-center"
                value={otp}
                onChange={(value) => {
                  setOtp(value);
                  if (error) setError(null);
                }}
                // Auto-submit as soon as all six digits are present (typed or
                // pasted) — the manual button below stays as a fallback.
                onComplete={(value) => void submitOtp(value)}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                </InputOTPGroup>
                <InputOTPSeparator />
                <InputOTPGroup>
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            {error ? (
              <p
                id="otp-error"
                className="mt-4 text-center text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="flex-col gap-2">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Verifying…" : "Log in"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={loading || resending || resendCooldown > 0}
              onClick={resend}
            >
              {resending
                ? "Sending…"
                : resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : "Resend code"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Use the most recent code — older codes stop working.
            </p>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={loading}
              onClick={() => {
                setStep("email");
                setOtp("");
                setError(null);
                setResendCooldown(0);
              }}
            >
              Use a different email
            </Button>
          </CardFooter>
        </form>
      )}
    </Card>
  );
};

export default Login;
