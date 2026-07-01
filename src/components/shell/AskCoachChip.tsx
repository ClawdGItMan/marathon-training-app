import Link from "next/link";

export function AskCoachChip({ from }: { from: string }) {
  return (
    <Link
      href={`/coach?from=${from}`}
      aria-label="ASK COACH"
      className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-[2px] bg-sig px-[13px] py-2 shadow-[0_4px_18px_-6px_rgba(201,245,63,.45)]"
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="#0B0C0E" aria-hidden="true">
        <path d="M12 2.5l1.9 7.6 7.6 1.9-7.6 1.9L12 21.5l-1.9-7.6L2.5 12l7.6-1.9z" />
      </svg>
      <span className="font-mono text-[9.5px] font-semibold tracking-[.12em] text-[#0B0C0E]">
        ASK COACH
      </span>
    </Link>
  );
}
