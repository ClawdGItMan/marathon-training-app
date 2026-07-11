"use client";

import { useEffect, useState } from "react";
import { getIntegrationStatus } from "@/lib/integrations/status";

const actionClass =
  "whitespace-nowrap rounded-[2px] border border-[var(--hair)] px-[13px] py-[7px] font-mono text-[9px] tracking-[.1em] text-[#9aa0a7] disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Live CONNECTIONS row content for Whoop (supabase mode only — see
 * ConnectionsSection, which renders this in place of the static Phase-1
 * row markup and owns the shared bordered-row wrapper so styling stays
 * identical). Status comes from the getIntegrationStatus server action
 * (token presence only, never contents). Defaults to "not connected" while
 * the check is in flight rather than adding a third loading state — status
 * settles within one round trip and there's no Instrument idiom for a
 * loading row to match.
 */
export function WhoopConnectionRow() {
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getIntegrationStatus().then(({ whoop }) => {
      if (!cancelled) setConnected(whoop);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDisconnect() {
    setPending(true);
    try {
      const res = await fetch("/api/integrations/whoop/connect", { method: "DELETE" });
      if (res.ok) setConnected(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div>
        <div className="font-display text-[13.5px] text-white">Whoop</div>
        <div className="mt-[3px] font-mono text-[9px] tracking-[.14em] text-[#5c6168]">
          {connected ? "CONNECTED" : "NOT CONNECTED"}
        </div>
      </div>
      <div className="flex flex-col items-end gap-[5px]">
        {connected ? (
          <button type="button" onClick={handleDisconnect} disabled={pending} className={actionClass}>
            DISCONNECT
          </button>
        ) : (
          <a href="/api/integrations/whoop/connect" className={actionClass}>
            CONNECT
          </a>
        )}
      </div>
    </>
  );
}
