import { ConnectionRow } from "@/components/settings/ConnectionRow";

const PROVIDERS = [
  { key: "whoop", label: "Whoop" },
  { key: "strava", label: "Strava" },
] as const;

/**
 * CONNECTIONS rows (Settings, R12 — no v2 mock). Local mode (default/unset
 * NEXT_PUBLIC_REPO_MODE) always renders the Phase-1 static row for both
 * providers, unchanged — the 42-test e2e suite runs in local mode and
 * asserts this exact markup (tests/e2e/settings.spec.ts). In supabase
 * mode, both rows go live via the shared ConnectionRow component (real
 * CONNECTED/NOT CONNECTED + CONNECT/DISCONNECT, backed by each provider's
 * `/api/integrations/{provider}/connect` route — Whoop from Task 7, Strava
 * from Task 10). Providers are treated uniformly (no per-provider branch)
 * specifically so a reviewer can see neither provider's row is a
 * copy-paste fork of the other.
 */
export function ConnectionsSection() {
  const isSupabaseMode = process.env.NEXT_PUBLIC_REPO_MODE === "supabase";

  return (
    <div>
      {PROVIDERS.map(({ key, label }, i) => (
        <div
          key={key}
          className={`flex items-center justify-between py-[13px] ${
            i === 0 ? "" : "border-t border-white/[.09]"
          }`}
        >
          {isSupabaseMode ? (
            <ConnectionRow provider={key} label={label} />
          ) : (
            <>
              <div>
                <div className="font-display text-[13.5px] text-white">{label}</div>
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
                  aria-label={`Connect ${label} — available in Phase 2`}
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
