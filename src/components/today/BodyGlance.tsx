import { SectionHeader } from "@/components/ui/SectionHeader";
import { SegmentMeter } from "@/components/ui/SegmentMeter";
import type { PainArea } from "@/lib/domain/types";

const DAYS = ["T", "W", "T", "F", "S", "S", "M"] as const;

export function BodyGlance({ pain }: { pain: PainArea }) {
  return (
    <>
      <SectionHeader label="HOW'S THE BODY?" accent="#FF9A3D" action="LOG ›" actionHref="/log" />
      <div className="mx-4 rounded-card border border-white/[.05] bg-[#171c23] p-[16px_14px] shadow-[0_1px_0_rgba(255,255,255,.03)_inset,0_10px_26px_-16px_rgba(0,0,0,.55)]">
        <div className="grid grid-cols-7 gap-[6px]">
          {DAYS.map((day, i) => {
            const isToday = i === DAYS.length - 1;
            const hasFlag = i === DAYS.length - 2;
            return (
              <div key={i} className="flex flex-col items-center gap-[7px]">
                <span
                  className="font-ui text-[9px] font-bold"
                  style={{ color: isToday ? "#c9ced5" : "#697079" }}
                >
                  {day}
                </span>
                <div
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-full"
                  style={{
                    background: isToday
                      ? "#fff"
                      : hasFlag
                        ? "rgba(255,154,61,.16)"
                        : "rgba(255,255,255,.07)",
                  }}
                >
                  {isToday ? (
                    <span className="h-[5px] w-[5px] rounded-full bg-[#12161c]" />
                  ) : hasFlag ? (
                    <span className="h-[8px] w-[8px] rounded-full bg-[#FF9A3D]" />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="my-[14px] h-px bg-white/[.06]" />

        <div className="flex items-center justify-between">
          <div>
            <div className="font-ui text-[10px] font-bold tracking-[.1em] text-[#8a919c]">
              {pain.name.toUpperCase()} · {pain.side?.toUpperCase()}
            </div>
            <div className="mt-1 font-num text-[22px] tracking-[-.01em] text-white">
              {pain.severity}{" "}
              <span className="text-[12px] font-medium text-[#7b828c]">/ 10</span>{" "}
              <span className="font-ui text-[12px] font-bold text-[#E8A33A]">
                {pain.label}
              </span>
            </div>
          </div>
          <SegmentMeter value={pain.severity} color="#FF9A3D" />
        </div>
      </div>
    </>
  );
}
