import { redirect } from "next/navigation";
import { isAllowedEmail } from "@/lib/auth/allowlist";
import { getServerClient } from "@/lib/supabase/server";
import { SignInScreen } from "@/components/auth/SignInScreen";

/**
 * Server Action wrapping `isAllowedEmail`. `ALLOWED_EMAIL` is a server-only
 * env var (not `NEXT_PUBLIC_*`), so the client-side pre-check in
 * `SignInScreen` calls through this action rather than importing the
 * allowlist module directly — the allowed address itself never ships to
 * the client bundle, only the boolean result.
 */
async function checkAllowedEmail(email: string): Promise<boolean> {
  "use server";
  return isAllowedEmail(email);
}

/**
 * One-click demo sign-in (public portfolio path — see
 * docs/superpowers/specs/2026-08-24-public-demo-access-design.md).
 * Credentials are fixed server-side env values; no client input reaches
 * this grant, so the action can only ever sign into the demo account.
 * Success redirects (never returns); failure returns the calm inline
 * error shape SignInScreen already renders.
 */
async function signInAsDemo(): Promise<{ error: string } | void> {
  "use server";
  const email = process.env.DEMO_USER_EMAIL;
  const password = process.env.DEMO_USER_PASSWORD;
  if (!email || !password) {
    return { error: "DEMO SIGN-IN FAILED — TRY AGAIN" };
  }
  try {
    const supabase = await getServerClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: "DEMO SIGN-IN FAILED — TRY AGAIN" };
  } catch {
    return { error: "DEMO SIGN-IN FAILED — TRY AGAIN" };
  }
  redirect("/today");
}

export default function SignInPage() {
  const demoEnabled = Boolean(process.env.DEMO_USER_EMAIL && process.env.DEMO_USER_PASSWORD);
  return (
    <SignInScreen
      checkAllowedEmail={checkAllowedEmail}
      demoEnabled={demoEnabled}
      signInAsDemo={demoEnabled ? signInAsDemo : undefined}
    />
  );
}
