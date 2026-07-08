import Link from "next/link";

const FROM_TARGETS: Record<string, string> = {
  today: "TODAY",
  plan: "PLAN",
};

/** Resolves the `?from=` query param to a back label + href, defaulting to Plan. */
export function resolveBackTarget(from?: string): { label: string; href: string } {
  const key = from && FROM_TARGETS[from] ? from : "plan";
  return { label: FROM_TARGETS[key], href: `/${key}` };
}

/**
 * Workout Detail's own header (design #6a, ~lines 574-577) — a back chevron
 * + origin label on the left, day/week context on the right. Deliberately
 * not PageHeader: this screen has no title, sub, or ASK COACH chip.
 */
export function WorkoutHeader({
  from,
  context,
}: {
  from?: string;
  context: string;
}) {
  const { label, href } = resolveBackTarget(from);

  return (
    <div className="flex items-center justify-between px-[22px] pt-[10px]">
      <Link href={href} className="flex items-center gap-2" aria-label={`Back to ${label}`}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#9aa0a7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 6l-6 6 6 6" />
        </svg>
        <span className="font-mono text-[10px] tracking-[.14em] text-[#9aa0a7]">{label}</span>
      </Link>
      <span className="whitespace-nowrap font-mono text-[10px] tracking-[.14em] text-[#5c6168]">
        {context}
      </span>
    </div>
  );
}
