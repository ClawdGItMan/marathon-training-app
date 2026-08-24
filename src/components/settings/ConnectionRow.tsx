"use client";

import { useEffect, useState } from "react";
import { getIntegrationStatus, type IntegrationStatus } from "@/lib/integrations/status";
import { getSyncStatus } from "@/lib/sync/staleness";

type Provider = keyof IntegrationStatus;

const actionClass =
  "whitespace-nowrap rounded-[2px] border border-[var(--hair)] px-[13px] py-[7px] font-mono text-[9px] tracking-[.1em] text-[#9aa0a7] disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Live CONNECTIONS row content (supabase mode only — see ConnectionsSection,
 * which renders this in place of the static Phase-1 row markup and owns
 * the shared bordered-row wrapper so styling stays identical). Generic
 * over `provider` so Whoop (Task 7) and Strava (Task 10) share one
 * component instead of near-duplicate WhoopConnectionRow/
 * StravaConnectionRow files — both providers' connect/callback routes
 * follow the identical `/api/integrations/{provider}/connect` shape (GET
 * to connect, DELETE to disconnect), so the only per-provider input is the
 * status key + display label.
 *
 * Status comes from the getIntegrationStatus server action (token presence
 * only, never contents). Defaults to "not connected" while the check is in
 * flight rather than adding a third loading state — status settles within
 * one round trip and there's no Instrument idiom for a loading row to match.
 *
 * Task 12: `authBroken` (from getSyncStatus, same per-provider-bundle fetch
 * shape as getIntegrationStatus above — each row picks its own key out of
 * a bundle covering both providers) drives a RECONNECT state: when a
 * connected row's last sync failed with an auth-classified error, the
 * DISCONNECT button is replaced by a RECONNECT link — same
 * `/api/integrations/{provider}/connect` navigation as the "not connected"
 * CONNECT link, only the label text differs, per the brief's "RECONNECT is
 * the same navigation with different label text" instruction.
 */
export function ConnectionRow({ provider, label }: { provider: Provider; label: string }) {
  const [connected, setConnected] = useState(false);
  const [authBroken, setAuthBroken] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Both status fetches fail open ON PURPOSE (fix loop 1): a transient
    // query failure must not fake a state change (RECONNECT on a blip, or
    // a connected row flashing NOT CONNECTED), so state stays at its
    // initial value. Handled explicitly rather than left as unhandled
    // rejections; there's no error-UI idiom to render into.
    getIntegrationStatus()
      .then((status) => {
        if (!cancelled) setConnected(status[provider]);
      })
      .catch((err) => {
        console.warn("ConnectionRow: getIntegrationStatus failed; keeping NOT CONNECTED (fail-open)", err);
      });
    getSyncStatus()
      .then((status) => {
        if (!cancelled) setAuthBroken(status[provider].authBroken);
      })
      .catch((err) => {
        console.warn("ConnectionRow: getSyncStatus failed; not showing RECONNECT (fail-open)", err);
      });
    return () => {
      cancelled = true;
    };
  }, [provider]);

  async function handleDisconnect() {
    setPending(true);
    try {
      const res = await fetch(`/api/integrations/${provider}/connect`, { method: "DELETE" });
      if (res.ok) setConnected(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div>
        <div className="font-display text-[13.5px] text-white">{label}</div>
        <div className="mt-[3px] font-mono text-[9px] tracking-[.14em] text-[#5c6168]">
          {connected ? "CONNECTED" : "NOT CONNECTED"}
        </div>
      </div>
      <div className="flex flex-col items-end gap-[5px]">
        {connected && authBroken ? (
          <a href={`/api/integrations/${provider}/connect`} className={actionClass}>
            RECONNECT
          </a>
        ) : connected ? (
          <button type="button" onClick={handleDisconnect} disabled={pending} className={actionClass}>
            DISCONNECT
          </button>
        ) : (
          <a href={`/api/integrations/${provider}/connect`} className={actionClass}>
            CONNECT
          </a>
        )}
      </div>
    </>
  );
}
