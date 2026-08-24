import { createClient } from "@supabase/supabase-js";
import type { BrowserContext } from "@playwright/test";
import { TEST_USER_EMAIL, TEST_USER_PASSWORD } from "../../parity/constants";

const MAX_CHUNK_SIZE = 3180;
const BASE64_PREFIX = "base64-";
// Matches @supabase/ssr's DEFAULT_COOKIE_OPTIONS.maxAge (400 days — the
// Chrome-imposed cookie lifetime cap).
const COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/**
 * Ports @supabase/ssr's cookie chunking algorithm
 * (node_modules/@supabase/ssr/dist/module/utils/chunker.js `createChunks`)
 * closely enough to round-trip with its `combineChunks` reader: split the
 * URI-encoded value into <=MAX_CHUNK_SIZE segments without cutting a
 * percent-escape sequence in half. Our seeded session is small enough to
 * never need this in practice, but the app's own client would chunk a
 * larger session the same way, so the injected cookie must match whatever
 * shape a real sign-in would have produced.
 */
function chunkCookieValue(name: string, value: string): { name: string; value: string }[] {
  let encodedValue = encodeURIComponent(value);
  if (encodedValue.length <= MAX_CHUNK_SIZE) return [{ name, value }];

  const chunks: string[] = [];
  while (encodedValue.length > 0) {
    let encodedChunkHead = encodedValue.slice(0, MAX_CHUNK_SIZE);
    const lastEscapePos = encodedChunkHead.lastIndexOf("%");
    if (lastEscapePos > MAX_CHUNK_SIZE - 3) {
      encodedChunkHead = encodedChunkHead.slice(0, lastEscapePos);
    }
    let valueHead = "";
    while (encodedChunkHead.length > 0) {
      try {
        valueHead = decodeURIComponent(encodedChunkHead);
        break;
      } catch {
        encodedChunkHead = encodedChunkHead.slice(0, encodedChunkHead.length - 3);
      }
    }
    chunks.push(valueHead);
    encodedValue = encodedValue.slice(encodedChunkHead.length);
  }
  return chunks.map((chunkValue, i) => ({ name: `${name}.${i}`, value: chunkValue }));
}

/**
 * Signs in as the seeded password user (tests/parity/constants.ts) directly
 * against the local Supabase auth server via plain supabase-js, then injects
 * the resulting session into `context` as the exact cookie
 * src/lib/supabase/browser.ts's `getBrowserClient()` (createBrowserClient
 * from @supabase/ssr) would have written itself on a real sign-in — so
 * `src/middleware.ts` and the browser client both read it back correctly
 * with zero app-code changes.
 *
 * Format (see @supabase/ssr's createBrowserClient.js + cookies.js, and
 * @supabase/supabase-js's SupabaseClient computing the default storage
 * key): cookie name `sb-<url-hostname-first-label>-auth-token`; cookie
 * value is the auth-js Session object, `JSON.stringify`-ed, then
 * base64url-encoded with a `base64-` prefix (the default `cookieEncoding:
 * "base64url"`), chunked with `.0`/`.1`/... suffixes if it doesn't fit one
 * cookie.
 *
 * Must be called with `context` freshly created and BEFORE any page in it
 * navigates to the app, so the cookie is present on the very first request
 * (middleware runs on every request in supabase mode).
 */
export async function injectSupabaseSession(context: BrowserContext, appUrl: string): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "injectSupabaseSession: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY must be set " +
        "(playwright.config.ts's supabase-mode webServer sets these from `supabase status`)."
    );
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });
  if (error || !data.session) {
    throw new Error(`injectSupabaseSession: seeded sign-in failed: ${error?.message ?? "no session returned"}`);
  }

  const cookieName = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
  const cookieValue = BASE64_PREFIX + Buffer.from(JSON.stringify(data.session), "utf8").toString("base64url");
  const target = new URL(appUrl);
  const expires = Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE_SECONDS;

  await context.addCookies(
    chunkCookieValue(cookieName, cookieValue).map(({ name, value }) => ({
      name,
      value,
      domain: target.hostname,
      path: "/",
      httpOnly: false,
      secure: target.protocol === "https:",
      sameSite: "Lax" as const,
      expires,
    }))
  );
}
