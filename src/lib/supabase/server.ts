import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * SSR-scoped Supabase client for Server Components, Route Handlers, and
 * Server Actions. Reads/writes auth cookies via `next/headers`. When called
 * from a Server Component (no mutable cookie jar), `setAll` best-effort
 * no-ops — `src/middleware.ts` is what actually refreshes the session cookie
 * on every request, per the standard `@supabase/ssr` pattern.
 */
export async function getServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — cookies are read-only there.
          }
        },
      },
    },
  );
}
