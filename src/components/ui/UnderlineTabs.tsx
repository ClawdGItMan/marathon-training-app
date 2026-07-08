"use client";

/**
 * Instrument underline-tab row: lime border-bottom on the active tab, grey
 * inactive text, hairline closing the row. Generalized from Progress's
 * RangeTabs (design-v2 #7b) so Plan's RUN/STRENGTH tabs (#7a/#7e) can reuse
 * the same pattern instead of re-implementing it.
 */
export function UnderlineTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (option: T) => void;
}) {
  return (
    <div className="hairline flex gap-[22px] px-[22px] pt-[18px]">
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`pb-[9px] font-mono text-[10px] tracking-[.16em] ${
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
