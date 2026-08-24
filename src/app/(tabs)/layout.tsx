import { isDemoEmail } from "@/lib/auth/allowlist";
import { getServerClient } from "@/lib/supabase/server";
import { TabsShell } from "@/components/shell/TabsShell";

/**
 * Server Component so the demo badge can be detected from the session
 * server-side (the demo email env var must never reach the client bundle —
 * only this boolean does). Local mode short-circuits before touching
 * Supabase at all: no env, no client, zero behavior change for the Phase-1
 * e2e baseline.
 */
export default async function TabsLayout({ children }: { children: React.ReactNode }) {
  let isDemo = false;
  if (process.env.NEXT_PUBLIC_REPO_MODE === "supabase") {
    try {
      const supabase = await getServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      isDemo = isDemoEmail(user?.email ?? "");
    } catch {
      // Session lookup failing must never take down the shell — a non-demo
      // render is the safe fallback.
      isDemo = false;
    }
  }
  return <TabsShell isDemo={isDemo}>{children}</TabsShell>;
}
