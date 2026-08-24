import { execSync } from "node:child_process";

/**
 * `npx supabase db reset` + a Kong bounce. Every *.supabase.test.ts file
 * that resets the stack in its own beforeAll should call this instead of
 * running `supabase db reset` directly.
 *
 * Why the Kong bounce is required: `db reset`'s "Restarting containers..."
 * step recreates the auth/rest/etc. containers, which get FRESH internal
 * Docker-network IPs. Kong (the API gateway everything goes through on
 * :55321) resolves each upstream's IP once and caches it — it is not
 * restarted by `db reset` — so after a reset Kong keeps proxying to the
 * now-dead old IP and every auth/REST call 502s
 * ("connect() failed (111: Connection refused) ... upstream:
 * http://<stale-ip>:9999", visible via `docker logs supabase_kong_*`) until
 * Kong itself is restarted and re-resolves DNS. This is a Supabase
 * CLI/Kong DNS-caching quirk, not an application bug, and it does not
 * self-heal by waiting/retrying the auth call — only bouncing Kong fixes
 * it (verified manually: repeated sign-in attempts 502 indefinitely without
 * this, and succeed immediately after `docker restart <kong container>`).
 */
export function resetSupabaseStack(): void {
  execSync("npx supabase db reset", { stdio: "inherit" });

  const kongContainer = execSync("docker ps --filter name=_kong_ --format {{.Names}}", {
    encoding: "utf8",
  })
    .trim()
    .split("\n")[0];

  if (kongContainer) {
    execSync(`docker restart ${kongContainer}`, { stdio: "inherit" });
  }
}
