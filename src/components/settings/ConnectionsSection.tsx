import { WhoopConnectionRow } from "@/components/settings/WhoopConnectionRow";

const PROVIDERS = ["Whoop", "Strava"] as const;

/**
 * CONNECTIONS rows (Settings, R12 — no v2 mock). Local mode (default/unset
 * NEXT_PUBLIC_REPO_MODE) always renders the Phase-1 static row for both
 * providers, unchanged — the 42-test e2e suite runs in local mode and
 * asserts this exact markup (tests/e2e/settings.spec.ts). In supabase mode,
 * Whoop's row goes live (WhoopConnectionRow — real CONNECTED/NOT CONNECTED
 * + CONNECT/DISCONNECT, see that component). Strava has no connect route
 * yet (Task 10), so it keeps the static "PHASE 2" placeholder in both
 * modes — disabled/ghost tier per design-v2 README's grey scale
 * (`#3f444b`), no lime (lime is reserved for "now/act").
 */
export function ConnectionsSection() {
  const isSupabaseMode = process.env.NEXT_PUBLIC_REPO_MODE === "supabase";

  return (
    <div>
      {PROVIDERS.map((provider, i) => (
        <div
          key={provider}
          className={`flex items-center justify-between py-[13px] ${
            i === 0 ? "" : "border-t border-white/[.09]"
          }`}
        >
          {provider === "Whoop" && isSupabaseMode ? (
            <WhoopConnectionRow />
          ) : (
            <>
              <div>
                <div className="font-display text-[13.5px] text-white">{provider}</div>
                <div className="mt-[3px] font-mono text-[9px] tracking-[.14em] text-[#5c6168]">
                  NOT CONNECTED
                </div>
              </div>
              <div className="flex flex-col items-end gap-[5px]">
                <span className="whitespace-nowrap font-mono text-[8px] tracking-[.12em] text-[#3f444b]">
                  PHASE 2
                </span>
                <button
                  type="button"
                  disabled
                  aria-label={`Connect ${provider} — available in Phase 2`}
                  className="cursor-not-allowed whitespace-nowrap rounded-[2px] border border-[var(--hair)] px-[13px] py-[7px] font-mono text-[9px] tracking-[.1em] text-[#3f444b]"
                >
                  CONNECT
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
