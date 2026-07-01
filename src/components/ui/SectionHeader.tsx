export function SectionHeader({
  label,
  accent,
  action,
  actionHref,
}: {
  label: string;
  accent: string;
  action?: string;
  actionHref?: string;
}) {
  return (
    <div className="mt-[22px] mb-[10px] flex items-center justify-between">
      <span className="inline-flex items-center gap-[9px]">
        <span
          className="block h-[14px] w-[3px] rounded-[1px]"
          style={{ backgroundColor: accent }}
        />
        <span className="font-ui text-[13px] font-bold tracking-[.04em] text-white">
          {label}
        </span>
      </span>
      {action ? (
        <a
          href={actionHref}
          className="font-ui text-[11px] font-semibold text-ink-faint"
        >
          {action}
        </a>
      ) : null}
    </div>
  );
}
