import type { NextRequest } from "next/server";
import { handleConnectGet, handleDisconnect } from "@/lib/integrations/oauth";
import { buildStravaAuthorizeUrl } from "@/lib/integrations/strava/client";

/**
 * GET initiates the Strava OAuth flow; DELETE disconnects. Both bodies are
 * shared with Whoop's connect route (Task 7) via oauth.ts's
 * handleConnectGet/handleDisconnect — see that module for the auth-guard
 * and CSRF-state details. This file supplies only what's Strava-specific:
 * the authorize-URL builder and the provider name.
 */
export async function GET(request: NextRequest) {
  return handleConnectGet(request, buildStravaAuthorizeUrl);
}

export async function DELETE() {
  return handleDisconnect("strava");
}
