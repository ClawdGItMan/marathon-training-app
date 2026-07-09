"use client";

const QUICK_PROMPTS = ["WHY THIS WORKOUT?", "I'M SORE", "MOVE MY LONG RUN"];

/**
 * Coach's quick-prompt chips + ASK ANYTHING input row (design #7f, lines
 * 512-521). Chips send their own label as a user message (same Phase-1
 * send flow as the free-text input) rather than just prefilling the
 * input — there's no v1 behavior to preserve here (no prior Coach screen
 * existed), so this is a judgment call to make them actually do something
 * instead of being decorative. No mic button: the mock shows only a ghost
 * placeholder input and a lime "→" glyph (not an SVG icon).
 */
export function Composer({
  value,
  onChange,
  onSend,
  onPrompt,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onPrompt: (label: string) => void;
}) {
  return (
    <div className="px-[22px] pt-[18px] pb-4">
      <div className="flex flex-wrap gap-2">
        {QUICK_PROMPTS.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => onPrompt(label)}
            className="whitespace-nowrap rounded-[2px] border border-[var(--hair)] px-3 py-2 font-mono text-[9px] tracking-[.1em] text-[#8a919c]"
          >
            {label}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
        className="hairline-top mt-[14px] flex items-center gap-3 py-[14px]"
      >
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ASK ANYTHING…"
          className="flex-1 min-w-0 bg-transparent font-mono text-[10px] tracking-[.14em] text-white placeholder:text-[#3f444b] focus:outline-none"
        />
        <button type="submit" aria-label="Send" className="font-mono text-[14px] text-sig">
          →
        </button>
      </form>
    </div>
  );
}
