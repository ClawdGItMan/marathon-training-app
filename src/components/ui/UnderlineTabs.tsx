"use client";

type PaddingTopVariant = "18px" | "20px";
type TrackingVariant = ".14em" | ".16em";

const paddingTopClass: Record<PaddingTopVariant, string> = {
  "18px": "pt-[18px]",
  "20px": "pt-[20px]",
};

const trackingClass: Record<TrackingVariant, string> = {
  ".14em": "tracking-[.14em]",
  ".16em": "tracking-[.16em]",
};

/**
 * Instrument underline-tab row: lime border-bottom on the active tab, grey
 * inactive text, hairline closing the row. Generalized from Progress's
 * RangeTabs (design-v2 #7b) so Plan's RUN/STRENGTH tabs (#7a/#7e) can reuse
 * the same pattern instead of re-implementing it.
 *
 * @param paddingTop - Top padding (design-v2 #7b: 18px, #7a/#7e: 20px)
 * @param tracking - Letter spacing (design-v2 #7b: .14em, #7a/#7e: .16em)
 */
export function UnderlineTabs<T extends string>({
  options,
  value,
  onChange,
  paddingTop = "20px",
  tracking = ".16em",
}: {
  options: readonly T[];
  value: T;
  onChange: (option: T) => void;
  paddingTop?: PaddingTopVariant;
  tracking?: TrackingVariant;
}) {
  const ptClass = paddingTopClass[paddingTop];
  const tkClass = trackingClass[tracking];

  return (
    <div className={`hairline flex gap-[22px] px-[22px] ${ptClass}`}>
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`pb-[9px] font-mono text-[10px] ${tkClass} ${
              active ? "border-b-2 border-sig text-white" : "text-[#5c6168]"
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
