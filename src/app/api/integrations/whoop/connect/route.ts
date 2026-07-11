import { NextResponse, type NextRequest } from "next/server";
import { deleteTokens, makeState } from "@/lib/integrations/oauth";
import { buildWhoopAuthorizeUrl } from "@/lib/integrations/whoop/client";
import { getServerClient } from "@/lib/supabase/server";

/**
 * GET initiates the Whoop OAuth flow. `/api` is excluded from
 * src/middleware.ts's matcher (see its `config.matcher`), so this route
 * resolves + enforces auth itself: unauthenticated requests redirect to
 * /sign-in (this route is browser-navigated — the Settings CONNECT link —
 * so a redirect matches the middleware's own treatment of app routes,
 * rather than a bare 401).
 *
 * DELETE disconnects: deletes the caller's stored Whoop tokens. It lives on
 * this same route file (rather than a separate one) since it's the natural
 * counterpart action on the same integration resource, and the brief's file
 * list doesn't add a dedicated disconnect route.
 */
export async function GET(request: NextRequest) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const state = await makeState();
  return NextResponse.redirect(buildWhoopAuthorizeUrl(state));
}

export async function DELETE() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await deleteTokens(user.id, "whoop");
  return NextResponse.json({ ok: true });
}
