"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

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

    const parsed = srmistEmail.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid email.");
      return;
    }

    setLoading(true);
    const { error: otpError } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "sign-in",
    });
    setLoading(false);
    if (otpError) {
      setError(otpError.message ?? "Could not send the login code.");
      return;
    }
    setStep("otp");
    setResendCooldown(30);
  };

  // Re-send a fresh code. Each send invalidates the previous one (Better Auth),
  // so the newest email is the only one that works.
  const resend = async () => {
    if (resending || resendCooldown > 0) return;
    setResending(true);
    const { error: otpError } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "sign-in",
    });
    setResending(false);
    if (otpError) {
      toast.error(otpError.message ?? "Could not send a new code.");
      return;
    }
    setOtp("");
    setResendCooldown(30);
    toast.success("New code sent — check your inbox for the latest one.");
  };

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault();
    // Ignore empty / autofilled-garbage submits (browsers sometimes auto-submit
    // this form). Only a real 6-digit code goes to the server.
    if (!/^\d{6}$/.test(otp)) {
      toast.error("Enter the 6-digit code from your email.");
      return;
    }
    setLoading(true);
    try {
      const { error: signInError } = await authClient.signIn.emailOtp({
        email,
        otp,
      });
      if (signInError) {
        toast.error(
          signInError.code === "INVALID_OTP"
            ? "That code expired or was replaced by a newer one — tap Resend code."
            : (signInError.message ?? "Invalid or expired code."),
        );
        return;
      }
      // The dashboard layout routes by profile state (onboarding / pending / ok).
      router.push("/dashboard");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-center font-serif text-3xl text-primary">
          Log In
        </CardTitle>
        <CardDescription className="text-center font-sans">
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
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="font-sans"
              />
            </div>
            {error ? (
              <p className="mt-4 text-sm text-destructive" role="alert">
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
              <Input
                id="otp"
                name="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="6-digit code"
                required
                value={otp}
                // Digits only — stops the browser autofilling the email into
                // this field and keeps the value a clean OTP.
                onChange={(event) =>
                  setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                className="font-sans tracking-[0.3em]"
              />
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-2">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Verifying…" : "Log in"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={resending || resendCooldown > 0}
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
