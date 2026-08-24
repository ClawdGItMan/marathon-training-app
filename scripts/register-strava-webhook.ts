/**
 * Registers this app's Strava webhook subscription (Task 11 ⚑ controller
 * checkpoint — run manually once, never in tests/CI, no live network call
 * happens anywhere else in this codebase).
 *
 * Run: npx tsx scripts/register-strava-webhook.ts
 *
 * POSTs to Strava's push_subscriptions endpoint
 * (https://developers.strava.com/docs/webhooks — verified at
 * implementation time): `client_id`, `client_secret`, `callback_url`
 * (`${NEXT_PUBLIC_APP_URL}/api/webhooks/strava`), `verify_token`
 * (`STRAVA_WEBHOOK_VERIFY_TOKEN`). Strava immediately GETs `callback_url`
 * to validate it (the `hub.challenge` echo the route's GET handler
 * implements) before this POST resolves.
 *
 * On success, Strava returns `{ "id": <subscription id> }` — printed here
 * so the operator can set it as `STRAVA_SUBSCRIPTION_ID` in Vercel env
 * (the webhook route's POST handler validates every incoming event's
 * `subscription_id` against that value).
 */

const PUSH_SUBSCRIPTIONS_URL = "https://www.strava.com/api/v3/push_subscriptions";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — export it before running this script.`);
  return value;
}

async function main(): Promise<void> {
  const clientId = requireEnv("STRAVA_CLIENT_ID");
  const clientSecret = requireEnv("STRAVA_CLIENT_SECRET");
  const appUrl = requireEnv("NEXT_PUBLIC_APP_URL");
  const verifyToken = requireEnv("STRAVA_WEBHOOK_VERIFY_TOKEN");
  const callbackUrl = `${appUrl}/api/webhooks/strava`;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    callback_url: callbackUrl,
    verify_token: verifyToken,
  });

  console.log(`Registering Strava webhook subscription for callback_url=${callbackUrl} ...`);

  const res = await fetch(PUSH_SUBSCRIPTIONS_URL, { method: "POST", body });
  const payload: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    console.error(`Strava rejected the subscription request: ${res.status} ${res.statusText}`);
    console.error(payload);
    process.exit(1);
  }

  const id = (payload as { id?: number } | null)?.id;
  if (id === undefined) {
    console.error("Strava responded 200 but the payload had no `id` field:", payload);
    process.exit(1);
  }

  console.log(`Subscription created. Set this in Vercel env:\n  STRAVA_SUBSCRIPTION_ID=${id}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
