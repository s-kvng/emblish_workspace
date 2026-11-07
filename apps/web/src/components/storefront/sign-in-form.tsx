"use client";

import { toGhanaPhone } from "@emblish_workspace/backend/convex/model/customers";
import { Button } from "@emblish_workspace/ui/components/button";
import { Input } from "@emblish_workspace/ui/components/input";
import { Label } from "@emblish_workspace/ui/components/label";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

type Step = { kind: "phone" } | { kind: "code"; phone: string };

/** Phone number, then the 6-digit code we text to it. No password, no sign-up. */
export default function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "phone" });
  const [phoneInput, setPhoneInput] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sendCode = async (phone: string) => {
    setBusy(true);
    setError(null);
    const { error } = await authClient.phoneNumber.sendOtp({
      phoneNumber: phone,
    });
    setBusy(false);
    if (error) {
      setError(error.message ?? "We couldn't text a code. Try again.");
      return false;
    }
    return true;
  };

  const submitPhone = async (event: React.FormEvent) => {
    event.preventDefault();
    const phone = toGhanaPhone(phoneInput);
    if (!phone) {
      setError("Enter a Ghana mobile number, such as 024 123 4567.");
      return;
    }
    if (await sendCode(phone)) {
      setCode("");
      setStep({ kind: "code", phone });
    }
  };

  const submitCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (step.kind !== "code") return;
    setBusy(true);
    setError(null);
    const { error } = await authClient.phoneNumber.verify({
      phoneNumber: step.phone,
      code,
    });
    if (error) {
      setBusy(false);
      setError(
        error.code === "OTP_EXPIRED"
          ? "That code has expired. Ask for a new one."
          : error.code === "TOO_MANY_ATTEMPTS"
            ? "Too many tries. Ask for a new code."
            : "That code isn't right. Check the SMS and try again.",
      );
      return;
    }
    router.replace(next as Route);
    router.refresh();
  };

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-10">
      <h1 className="text-2xl">Sign in</h1>
      {step.kind === "phone" ? (
        <form onSubmit={submitPhone} className="mt-6 space-y-4">
          <p className="text-muted-foreground text-sm">
            We'll text a 6-digit code to your phone. No password needed.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="phone" className="text-sm">
              Phone number
            </Label>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="024 123 4567"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              aria-invalid={error !== null}
              className="h-11 text-base md:text-base"
              required
            />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button type="submit" size="lg" disabled={busy} className="h-11 w-full text-sm">
            {busy ? "Sending…" : "Text me a code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={submitCode} className="mt-6 space-y-4">
          <p className="text-muted-foreground text-sm">
            Enter the code we sent to {step.phone}. It expires in 5 minutes.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="code" className="text-sm">
              Code
            </Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              aria-invalid={error !== null}
              className="h-11 text-center text-lg tracking-[0.5em] md:text-lg"
              autoFocus
              required
            />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button
            type="submit"
            size="lg"
            disabled={busy || code.length !== 6}
            className="h-11 w-full text-sm"
          >
            {busy ? "Signing in…" : "Sign in"}
          </Button>
          <div className="flex justify-between text-sm">
            <button
              type="button"
              className="text-muted-foreground"
              onClick={() => {
                setError(null);
                setStep({ kind: "phone" });
              }}
            >
              Change number
            </button>
            <button
              type="button"
              className="font-semibold text-brand-purple"
              disabled={busy}
              onClick={() => sendCode(step.phone)}
            >
              Send a new code
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
