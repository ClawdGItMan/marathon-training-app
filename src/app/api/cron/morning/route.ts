import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { NextResponse, type NextRequest } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { syncWhoop } from "@/lib/integrations/whoop/sync";
import { syncStrava } from "@/lib/integrations/strava/sync";
import { localHourOf } from "@/lib/sync/timezone";

/**
 * Morning sync cron (Task 9; Strava catch-up sweep added Task 11). Scheduled hourly (`vercel.json`: `0 * * * *`)
 * rather than once at a fixed UTC hour — a UTC-fixed daily schedule would
 * drift against every home timezone across DST transitions. Instead, this
 * handler runs every hour and no-ops unless the profile's LOCAL hour
 * (`localHourOf`, tz-aware) is exactly 6 — that's what survives DST: the
 * wall-clock trigger stays pinned to 6am local, the UTC instant that means
 * shifts underneath it twice a year, and the schedule never needs to
 * change. There is exactly one profile today, but every profile is
 * iterated (not just the first) per the brief's wording — this scales to
 * multiple users without route changes.
 *
 * Auth: requires `authorization: Bearer ${CRON_SECRET}` or 401s. Compared
 * with `timingSafeEqual` (the same defense-in-depth pattern
 * src/lib/integrations/oauth.ts's `assertState` uses for CSRF state) rather
 * than a plain `!==`, even though a bearer secret compared over HTTPS by a
 * scheduler (not a browser) has a much smaller timing-attack surface than
 * `assertState`'s case — it costs nothing here and keeps the two
 * server-held-secret comparisons in this codebase consistent.
 */

const profileRowSchema = z.object({ id: z.string(), home_timezone: z.string() });

const CRON_HOUR_TARGET = 6;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const headerBuf = Buffer.from(header, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");

  return headerBuf.length === expectedBuf.length && timingSafeEqual(headerBuf, expectedBuf);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getAdminClient();
  const now = new Date();

  const { data, error } = await admin.from("profiles").select("id, home_timezone");
  if (error) throw error;

  const profiles = z.array(profileRowSchema).parse(data ?? []);

  const results: Array<{ userId: string; synced: boolean }> = [];
  for (const profile of profiles) {
    if (localHourOf(now, profile.home_timezone) !== CRON_HOUR_TARGET) {
      results.push({ userId: profile.id, synced: false });
      continue;
    }

    // Whoop first, Strava second: syncStrava's dedupe (via
    // importStravaActivity -> dedupeWhoop) only merges a Strava activity
    // into an ALREADY-STORED Whoop row, never the reverse — running Whoop
    // first means the common catch-up-sweep case dedupes correctly in one
    // cron pass. See src/lib/integrations/strava/sync.ts's module comment
    // for the known one-directional-dedupe edge case this doesn't cover.
    await syncWhoop(admin, profile.id);
    await syncStrava(admin, profile.id);
    results.push({ userId: profile.id, synced: true });
  }

  return NextResponse.json({ ok: true, results });
}
