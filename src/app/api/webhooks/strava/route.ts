import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAdminClient } from "@/lib/supabase/admin";
import { findUserByAthleteRef, loadTokens } from "@/lib/integrations/oauth";
import { getActivity, type StravaAuthContext } from "@/lib/integrations/strava/client";
import { importStravaActivity } from "@/lib/integrations/strava/sync";

/**
 * Strava webhook (Task 11): GET handles the one-time subscription-validation
 * echo (developers.strava.com/docs/webhooks — verified at implementation
 * time, see task-11-report.md); POST receives activity create/update
 * events, verifies `subscription_id`, fetches the full activity, and
 * imports it via the shared strava/sync.ts orchestrator.
 *
 * ACK STRATEGY (binding design constraint, p2-globals.md): process BEFORE
 * responding, but ALWAYS return 200 — even when processing throws. Chosen
 * over `waitUntil`/`after()` deferred-execution because (a) it's fully
 * synchronous and deterministic to test (no reliance on a runtime's
 * post-response execution guarantee, which varies across hosting
 * configurations), (b) one webhook event does at most a handful of fast
 * operations (one Strava GET, a handful of small DB round trips) — nowhere
 * near Strava's docs' "respond within a reasonable time" expectation — and
 * (c) any processing failure is still captured in `sync_runs` for the
 * on-call/staleness story, exactly as if it had failed in the background.
 * A non-2xx response here would make Strava retry-then-eventually-disable
 * the whole subscription, which is worse than a slightly slower ack.
 */

const webhookEventSchema = z.object({
  object_type: z.string(),
  object_id: z.number(),
  aspect_type: z.string(),
  owner_id: z.number(),
  subscription_id: z.number(),
});

const PROCESSED_ASPECTS = new Set(["create", "update"]);

function ackOk(): NextResponse {
  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const verifyToken = request.nextUrl.searchParams.get("hub.verify_token");

  const expected = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;
  if (!expected || !challenge || verifyToken !== expected) {
    return NextResponse.json({ error: "Invalid verify token" }, { status: 403 });
  }

  return NextResponse.json({ "hub.challenge": challenge });
}

async function logSyncRun(
  admin: ReturnType<typeof getAdminClient>,
  userId: string,
  result: { ok: boolean; items: number; detail?: string }
): Promise<void> {
  await admin.from("sync_runs").insert({
    user_id: userId,
    source: "strava",
    ok: result.ok,
    items: result.items,
    detail: result.detail ?? null,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const admin = getAdminClient();

  let event: z.infer<typeof webhookEventSchema>;
  try {
    event = webhookEventSchema.parse(await request.json());
  } catch {
    // Malformed payload — nothing we can safely attribute or process; ack
    // so Strava doesn't retry a request it will never send correctly.
    return ackOk();
  }

  const expectedSubscriptionId = process.env.STRAVA_SUBSCRIPTION_ID;
  const subscriptionMatches = !!expectedSubscriptionId && String(event.subscription_id) === expectedSubscriptionId;

  const userId = await findUserByAthleteRef(String(event.owner_id), "strava").catch(() => null);

  if (!subscriptionMatches) {
    // Per brief: 200-ack, NO fetch to Strava, but still log to sync_runs
    // when we can attribute the event to a known user.
    if (userId) {
      await logSyncRun(admin, userId, {
        ok: false,
        items: 0,
        detail: `Webhook event ignored: subscription_id ${event.subscription_id} does not match the registered subscription.`,
      });
    }
    return ackOk();
  }

  if (event.object_type !== "activity" || !PROCESSED_ASPECTS.has(event.aspect_type)) {
    return ackOk(); // athlete-deauth / delete / other event types — nothing to import
  }

  if (!userId) return ackOk(); // unresolvable athlete — no user to attribute a sync_runs row to

  try {
    const tokens = await loadTokens(userId, "strava");
    if (!tokens) throw new Error("Strava is not connected for this user.");

    const ctx: StravaAuthContext = {
      userId,
      tokens: { access: tokens.access, refresh: tokens.refresh },
      athleteRef: tokens.athleteRef ?? null,
    };
    const activity = await getActivity(ctx, event.object_id);
    await importStravaActivity(admin, userId, activity);

    await logSyncRun(admin, userId, { ok: true, items: 1 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await logSyncRun(admin, userId, { ok: false, items: 0, detail });
  }

  return ackOk();
}
