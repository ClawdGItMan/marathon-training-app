import Link from "next/link";
import type { PlannedSession } from "@/lib/domain/types";

function RunIcon({ fill }: { fill: string }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill={fill}>
      <path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6.7 6.85V11.6h2V8.2l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z" />
    </svg>
  );
}

function sessionMeta(session: PlannedSession, label: string): string {
  const parts = [label];
  if (session.paceTarget) parts.push(`${session.paceTarget}`);
  if (session.zone) parts.push(session.zone);
  return parts.join(" · ");
}

function PlannedRow({ session }: { session: PlannedSession }) {
  return (
    <div className="flex items-center gap-[13px] p-[15px_15px]">
      <div
        className="flex h-[46px] w-[46px] items-center justify-center rounded-ctl opacity-70"
        style={{ background: "linear-gradient(135deg,#465260,#2c333d)" }}
      >
        <RunIcon fill="#fff" />
      </div>
      <div className="flex-1">
        <div className="font-ui text-[14px] font-bold text-[#9aa1ab] line-through decoration-white/30">
          {session.title.toUpperCase()} · {session.distanceMi} MI
        </div>
        <div className="mt-[2px] font-ui text-[12px] font-semibold text-[#8a919c]">
          {sessionMeta(session, "Planned")}
        </div>
      </div>
      <div className="font-ui text-[9px] font-bold tracking-[.11em] text-[#7b828c]">
        PLANNED
      </div>
    </div>
  );
}

function ActiveRow({
  session,
  href,
  tag,
}: {
  session: PlannedSession;
  href: string;
  tag?: "PROPOSED" | "PLANNED";
}) {
  const proposed = tag === "PROPOSED";
  return (
    <Link
      href={href}
      className="flex items-center gap-[13px] p-[15px]"
      style={proposed ? { background: "rgba(22,224,106,.06)" } : undefined}
    >
      <div
        className="flex h-[46px] w-[46px] items-center justify-center rounded-ctl"
        style={{
          background: proposed
            ? "linear-gradient(135deg,#16e06a,#0fb957)"
            : "linear-gradient(135deg,#465260,#2c333d)",
        }}
      >
        <RunIcon fill={proposed ? "#0c1116" : "#fff"} />
      </div>
      <div className="flex-1">
        <div className="font-ui text-[14px] font-bold text-white">
          {session.title.toUpperCase()} · {session.distanceMi} MI
        </div>
        <div className="mt-[2px] font-ui text-[12px] font-semibold text-[#9aa1ab]">
          {sessionMeta(session, proposed ? "Proposed" : "Planned")}
        </div>
      </div>
      {tag ? (
        <div
          className="font-ui text-[9px] font-bold tracking-[.11em]"
          style={{ color: proposed ? "#16e06a" : "#7b828c" }}
        >
          {tag}
        </div>
      ) : null}
    </Link>
  );
}

export function SessionCard({
  planned,
  proposed,
}: {
  planned: PlannedSession;
  proposed?: PlannedSession;
}) {
  const href = `/workout/${planned.id}`;

  if (proposed) {
    return (
      <div className="mx-4 overflow-hidden rounded-card border border-white/[.05] bg-[#171c23] shadow-[0_1px_0_rgba(255,255,255,.03)_inset,0_10px_26px_-16px_rgba(0,0,0,.55)]">
        <PlannedRow session={planned} />
        <div className="border-t border-white/[.06]">
          <ActiveRow session={proposed} href={href} tag="PROPOSED" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-4 overflow-hidden rounded-card border border-white/[.05] bg-[#171c23] shadow-[0_1px_0_rgba(255,255,255,.03)_inset,0_10px_26px_-16px_rgba(0,0,0,.55)]">
      <ActiveRow session={planned} href={href} tag="PLANNED" />
    </div>
  );
}
