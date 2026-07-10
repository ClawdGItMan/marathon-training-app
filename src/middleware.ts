import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowedEmail } from "@/lib/auth/allowlist";

const PUBLIC_PATHS = ["/sign-in"];

/**
 * Mode-gated route protection.
 *
 * `NEXT_PUBLIC_REPO_MODE` defaults to "local" (Phase-1 localStorage repo) —
 * in local mode this middleware is a hard no-op so the Phase-1 Playwright
 * suite (unauthenticated, 42 tests) keeps passing untouched. The auth gate
 * only activates once the mode is switched to "supabase".
 */
export async function middleware(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_REPO_MODE !== "supabase") {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicPath = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  if (!user) {
    if (isPublicPath) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    const redirectResponse = NextResponse.redirect(url);
    // Propagate any cookies mutated by the Supabase client (token refresh, etc.)
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    return redirectResponse;
  }

  if (!isAllowedEmail(user.email ?? "")) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    url.searchParams.set("e", "denied");
    const redirectResponse = NextResponse.redirect(url);
    // Propagate any cookies mutated by signOut (session deletion cookie, etc.)
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    return redirectResponse;
  }

  if (isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/today";
    url.search = "";
    const redirectResponse = NextResponse.redirect(url);
    // Propagate any cookies mutated by the Supabase client (token refresh, etc.)
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icons|manifest.json).*)"],
};
