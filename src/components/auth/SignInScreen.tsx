"use client";

import { useState } from "react";
import { z } from "zod";
import { getBrowserClient } from "@/lib/supabase/browser";

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");
const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code.");

const labelClass = "font-mono text-[9px] uppercase tracking-[.14em] text-ink-7";
const inputClass =
  "hairline mt-[6px] w-full bg-transparent px-0 py-[10px] font-num text-[14px] text-white outline-none";
const ctaClass =
  "h-[50px] w-full rounded-[2px] bg-sig font-display text-[13px] font-semibold uppercase tracking-[.06em] text-[#0B0C0E] disabled:opacity-50";

/**
 * Sign-in screen — no Instrument mock exists for this, composed only from
 * existing idioms: PageHeader's Space Grotesk display title, SectionHeader's
 * mono 10px/.18em/#9aa0a7 label, and ModifySheet's lime 50px CTA. Lime is
 * strictly the CTA — nothing else on the screen is lime.
 */
export function SignInScreen({
  checkAllowedEmail,
  demoEnabled = false,
  signInAsDemo,
}: {
  checkAllowedEmail: (email: string) => Promise<boolean>;
  demoEnabled?: boolean;
  signInAsDemo?: () => Promise<{ error: string } | void>;
}) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSendCode() {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid email.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const allowed = await checkAllowedEmail(parsed.data);
      if (!allowed) {
        setError("NOT AUTHORIZED FOR THIS APP");
        return;
      }
      const { error: otpError } = await getBrowserClient().auth.signInWithOtp({
        email: parsed.data,
        options: { shouldCreateUser: true },
      });
      if (otpError) {
        setError(otpError.message);
        return;
      }
      setEmail(parsed.data);
      setStep("code");
    } finally {
      setPending(false);
    }
  }

  async function handleVerify() {
    const parsed = codeSchema.safeParse(code);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid code.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const { error: verifyError } = await getBrowserClient().auth.verifyOtp({
        email,
        token: parsed.data,
        type: "email",
      });
      if (verifyError) {
        setError(verifyError.message);
        return;
      }
      window.location.href = "/today";
    } finally {
      setPending(false);
    }
  }

  async function handleDemo() {
    if (!signInAsDemo) return;
    setError(null);
    setPending(true);
    try {
      const result = await signInAsDemo();
      if (result?.error) setError(result.error);
    } catch (err) {
      // next/navigation redirect() throws a control-flow error with a
      // NEXT_REDIRECT digest — that's success (navigation), not failure.
      if (err instanceof Error && "digest" in err && String((err as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")) {
        return;
      }
      setError("DEMO SIGN-IN FAILED — TRY AGAIN");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[414px] flex-col justify-center px-[22px]">
      <span className={labelClass}>SIGN IN</span>
      <h1 className="mt-[6px] font-display text-[30px] leading-none tracking-[-.02em] text-white">
        Marathon
      </h1>

      {step === "email" ? (
        <div className="mt-[28px]">
          <label htmlFor="sign-in-email" className={labelClass}>
            EMAIL
          </label>
          <input
            id="sign-in-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            autoComplete="email"
          />
          {error ? <div className="mt-[10px] font-mono text-[11px] text-ink-2">{error}</div> : null}
          <button
            onClick={handleSendCode}
            disabled={pending}
            className={`mt-[18px] ${ctaClass}`}
          >
            SEND CODE
          </button>
          {demoEnabled ? (
            <button
              onClick={handleDemo}
              disabled={pending}
              className="mt-[10px] h-[50px] w-full rounded-[2px] border border-[#2a2d31] font-display text-[13px] font-semibold uppercase tracking-[.06em] text-ink-2 disabled:opacity-50"
            >
              VIEW DEMO
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-[28px]">
          <label htmlFor="sign-in-code" className={labelClass}>
            CODE
          </label>
          <input
            id="sign-in-code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={inputClass}
            autoComplete="one-time-code"
          />
          {error ? <div className="mt-[10px] font-mono text-[11px] text-ink-2">{error}</div> : null}
          <button
            onClick={handleVerify}
            disabled={pending}
            className={`mt-[18px] ${ctaClass}`}
          >
            VERIFY
          </button>
        </div>
      )}
    </div>
  );
}
