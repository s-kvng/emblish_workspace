"use client";

import { api } from "@emblish_workspace/backend/convex/_generated/api";
import { toGhanaPhone } from "@emblish_workspace/backend/convex/model/customers";
import { Button } from "@emblish_workspace/ui/components/button";
import { Input } from "@emblish_workspace/ui/components/input";
import { Label } from "@emblish_workspace/ui/components/label";
import { useMutation } from "convex/react";
import { BellRing } from "lucide-react";
import { useState } from "react";

import { messageOf } from "@/lib/convex-errors";

type Step =
  | { kind: "phone" }
  | { kind: "code"; phone: string }
  | { kind: "done"; already: boolean };

/**
 * Window Alert sign-up, for anyone: a phone number, then the 6-digit code we text to it
 * (double opt-in). No sign-in, and no Customer account is made.
 */
export default function WindowAlertsSignup() {
  const signUp = useMutation(api.storefront.alerts.signUp);
  const confirm = useMutation(api.storefront.alerts.confirm);
  const [step, setStep] = useState<Step>({ kind: "phone" });
  const [phoneInput, setPhoneInput] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sendCode = async (phone: string) => {
    setBusy(true);
    setError(null);
    try {
      const { status } = await signUp({ phone });
      if (status === "alreadySubscribed") setStep({ kind: "done", already: true });
      else {
        setCode("");
        setStep({ kind: "code", phone });
      }
    } catch (e) {
      setError(messageOf(e, "We couldn't text a code. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const submitPhone = async (event: React.FormEvent) => {
    event.preventDefault();
    const phone = toGhanaPhone(phoneInput);
    if (!phone) {
      setError("Enter a Ghana mobile number, such as 024 123 4567.");
      return;
    }
    await sendCode(phone);
  };

  const submitCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (step.kind !== "code") return;
    setBusy(true);
    setError(null);
    try {
      const { status } = await confirm({ phone: step.phone, code });
      if (status === "confirmed") setStep({ kind: "done", already: false });
      else if (status === "wrongCode") {
        setError("That code isn't right. Check the SMS and try again.");
      } else setError("That code has expired. Ask for a new one.");
    } catch (e) {
      setError(messageOf(e, "We couldn't check the code. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="window-alerts" className="mx-4 mt-8 scroll-mt-4 rounded-3xl border bg-card p-6">
      <div className="flex items-start gap-3">
        <BellRing className="mt-0.5 size-5 shrink-0 text-brand-gold" strokeWidth={1.6} />
        <div>
          <h2 className="text-xl">Hear when new Pre-orders open</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            We'll text you when a new window opens, at most once a day. Stop any time with the link
            in each text.
          </p>
        </div>
      </div>

      {step.kind === "phone" && (
        <form onSubmit={submitPhone} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="alerts-phone" className="text-sm">
              Phone number
            </Label>
            <Input
              id="alerts-phone"
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
          <Button type="submit" size="lg" disabled={busy} className="h-11 text-sm">
            {busy ? "Sending…" : "Text me a code"}
          </Button>
        </form>
      )}

      {step.kind === "code" && (
        <form onSubmit={submitCode} className="mt-4 space-y-3">
          <p className="text-muted-foreground text-sm">
            Enter the code we sent to {step.phone}. It expires in 5 minutes.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="alerts-code" className="text-sm">
                Code
              </Label>
              <Input
                id="alerts-code"
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
            <Button
              type="submit"
              size="lg"
              disabled={busy || code.length !== 6}
              className="h-11 text-sm"
            >
              {busy ? "Checking…" : "Turn on alerts"}
            </Button>
          </div>
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

      {step.kind === "done" && (
        <p className="mt-4 rounded-2xl bg-brand-purple-mist p-4 text-sm">
          {step.already
            ? "This number already gets Window Alerts."
            : "You're in. We'll text you when new Pre-orders open."}
        </p>
      )}

      {error && <p className="mt-3 text-destructive text-sm">{error}</p>}
    </section>
  );
}
