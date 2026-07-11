import { z } from "zod";

/**
 * Strava API v3 wire schemas (Task 10) — Zod-parsed at the external-API
 * boundary per p2-globals.md. Shapes verified against
 * https://developers.strava.com/docs/authentication/ (token
 * exchange/refresh response shape) and
 * https://developers.strava.com/docs/reference/ (DetailedActivity /
 * SummaryActivity field names+types, and the `athlete/activities` list
 * endpoint's `after`/`before` epoch-seconds query params) at
 * implementation time — the task brief's contract is a starting point to
 * fill, not to trust blindly.
 *
 * Confirmed facts baked into these schemas:
 *  - Token responses carry an ABSOLUTE `expires_at` epoch-SECONDS
 *    timestamp, unlike Whoop's relative `expires_in` duration — client.ts
 *    converts it directly via `new Date(expires_at * 1000)`, no
 *    `Date.now()` offset involved.
 *  - The `athlete` object (summary athlete, `{id, ...}`) is present on the
 *    authorization_code exchange response but ABSENT on refresh_token
 *    responses. `refreshStravaTokens` in client.ts returns a type that
 *    omits athleteRef entirely (rather than typing it optional-and-null)
 *    so a refresh can never accidentally overwrite a previously-stored
 *    athleteRef with null — see client.ts / oauth.ts's
 *    RefreshableAuthContext for how the value is carried through instead.
 *  - Activity ids are 64-bit integers ("Long" per the docs) — well within
 *    JS's safe-integer range for real Strava activity ids, so `z.number()`
 *    is used directly rather than a string.
 *  - `average_heartrate`/`max_heartrate`/`has_heartrate` ARE present on
 *    SummaryActivity (confirmed via the docs' sample list-response, not
 *    just DetailedActivity) — modeled as optional since an activity
 *    recorded without a heart-rate monitor omits them.
 *  - Only fields useful for future activity import/matching (Task 11) are
 *    modeled here; unknown fields are ignored by Zod's default
 *    non-strict object parsing, so additive API fields don't break parsing.
 */

const stravaAthleteRefSchema = z.object({ id: z.number() });

export const stravaTokenResponseSchema = z.object({
  token_type: z.string().optional(),
  access_token: z.string(),
  refresh_token: z.string(),
  expires_at: z.number(),
  expires_in: z.number().optional(),
  athlete: stravaAthleteRefSchema.optional(),
  scope: z.string().optional(),
});
export type StravaTokenResponse = z.infer<typeof stravaTokenResponseSchema>;

// SummaryActivity's common fields — shared by both the single-activity
// (getActivity, a superset "DetailedActivity") and list (listActivities,
// "SummaryActivity") endpoints; only fields present on both are modeled so
// one schema parses either response.
export const stravaActivitySchema = z.object({
  id: z.number(),
  name: z.string(),
  distance: z.number(),
  moving_time: z.number(),
  elapsed_time: z.number(),
  total_elevation_gain: z.number(),
  type: z.string(),
  sport_type: z.string(),
  start_date: z.string(),
  start_date_local: z.string(),
  average_speed: z.number(),
  max_speed: z.number().optional(),
  average_heartrate: z.number().optional(),
  max_heartrate: z.number().optional(),
});
export type StravaActivity = z.infer<typeof stravaActivitySchema>;
