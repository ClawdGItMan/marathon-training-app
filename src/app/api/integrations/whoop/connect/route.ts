import type { NextRequest } from "next/server";
import { handleConnectGet, handleDisconnect } from "@/lib/integrations/oauth";
import { buildWhoopAuthorizeUrl } from "@/lib/integrations/whoop/client";

/**
 * GET initiates the Whoop OAuth flow; DELETE disconnects. Both bodies are
 * shared with Strava's connect route (Task 10) via oauth.ts's
 * handleConnectGet/handleDisconnect — see that module for the auth-guard
 * and CSRF-state details. This file supplies only what's Whoop-specific:
 * the authorize-URL builder and the provider name.
 */
export async function GET(request: NextRequest) {
  return handleConnectGet(request, buildWhoopAuthorizeUrl);
}

export async function DELETE() {
  return handleDisconnect("whoop");
}
