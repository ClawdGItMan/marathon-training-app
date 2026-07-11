import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { assertState, OAUTH_STATE_COOKIE, saveTokens } from "@/lib/integrations/oauth";
import { exchangeWhoopCode } from "@/lib/integrations/whoop/client";
import { getServerClient } from "@/lib/supabase/server";

/**
 * Whoop redirects the browser back here with `?code=...&state=...`. `/api`
 * is excluded from src/middleware.ts's matcher, so auth is resolved here;
 * unlike the browser-navigated connect route, an unauthenticated callback
 * is a hard error (401) rather than a redirect — by the time Whoop calls
 * back, the session that started the flow should still be present.
 *
 * Security (Task 6 review): the state cookie is read AND cleared in the
 * same request, unconditionally, right after the assertState check —
 * before the token exchange is even attempted — so a state value is
 * single-use regardless of whether assertState passed/failed or the
 * exchange later succeeds/fails. This is what makes a replayed callback
 * with the same state fail on its second attempt.
 */
export async function GET(request: NextRequest) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const store = await cookies();
  const cookieVal = store.get(OAUTH_STATE_COOKIE)?.value;
  const stateParam = request.nextUrl.searchParams.get("state");

  try {
    assertState(cookieVal, stateParam);
  } catch {
    return NextResponse.json({ error: "Invalid state" }, { status: 403 });
  } finally {
    store.delete(OAUTH_STATE_COOKIE);
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  try {
    const tokens = await exchangeWhoopCode(code);
    await saveTokens(user.id, "whoop", tokens);
  } catch {
    return NextResponse.json({ error: "Failed to connect Whoop" }, { status: 502 });
  }

  return NextResponse.redirect(new URL("/settings?connected=whoop", request.url));
}
