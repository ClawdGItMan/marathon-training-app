const PROVIDERS = ["Whoop", "Strava"] as const;

/**
 * CONNECTIONS rows (Settings, R12 — no v2 mock). Neither provider has a
 * live integration in Phase 1 (Whoop/Strava sync is Phase 2 scope), so both
 * rows show "NOT CONNECTED" and a disabled mono CONNECT button rather than
 * a working toggle — disabled/ghost tier per design-v2 README's grey scale
 * (`#3f444b`), no lime (lime is reserved for "now/act", and there is no
 * action available here yet).
 */
export function ConnectionsSection() {
  return (
    <div>
      {PROVIDERS.map((provider, i) => (
        <div
          key={provider}
          className={`flex items-center justify-between py-[13px] ${
            i === 0 ? "" : "border-t border-white/[.09]"
          }`}
        >
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
        </div>
      ))}
    </div>
  );
}
