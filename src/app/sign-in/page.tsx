import { isAllowedEmail } from "@/lib/auth/allowlist";
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

export default function SignInPage() {
  return <SignInScreen checkAllowedEmail={checkAllowedEmail} />;
}
