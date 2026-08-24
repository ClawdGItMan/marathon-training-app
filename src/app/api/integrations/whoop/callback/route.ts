import type { NextRequest } from "next/server";
import { handleCallback } from "@/lib/integrations/oauth";
import { exchangeWhoopCode } from "@/lib/integrations/whoop/client";

/**
 * Whoop redirects the browser back here with `?code=...&state=...`. The
 * full state-verification / token-exchange / token-persistence flow is
 * shared with Strava's callback route (Task 10) via oauth.ts's
 * handleCallback — see that module for the security notes (state is
 * single-use, cleared unconditionally before the exchange is attempted).
 * This file supplies only what's Whoop-specific: the code-exchange
 * function and the provider name.
 */
export async function GET(request: NextRequest) {
  return handleCallback(request, { provider: "whoop", exchangeCode: exchangeWhoopCode });
}
