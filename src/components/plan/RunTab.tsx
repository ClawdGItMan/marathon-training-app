import { Section } from "@/components/ui/Section";
import { PeriodizationBars } from "@/components/charts/PeriodizationBars";
import { WeekDayRow } from "@/components/plan/WeekDayRow";
import type { PeriodizationWeek, PlannedSession, TrainingBlock } from "@/lib/domain/types";

/**
 * Plan's RUN tab (design-v2 #7a): 16-WEEK BLOCK periodization chart, then
 * THIS WEEK as 7 ruled day rows (today lime, the rest mono TypeTags).
 */
export function RunTab({
  block,
  periodization,
  week,
  todaySessionId,
}: {
  block: TrainingBlock;
  periodization: PeriodizationWeek[];
  week: PlannedSession[];
  todaySessionId: string;
}) {
  const peakMi = Math.max(...periodization.map((w) => w.mi));

  return (
    <div>
      <div className="px-[22px] pt-[18px]">
        <PeriodizationBars
          weeks={periodization}
          currentWeek={block.week}
          peakLabel={`PEAK ${peakMi} MI/WK`}
        />
      </div>

      <div className="px-[22px] pt-[18px]">
        <Section
          header={{
            label: "THIS WEEK",
            context: `${block.weekMilesDone} / ${block.weekMilesTarget} MI`,
          }}
        >
          {week.map((session, i) => (
            <WeekDayRow
              key={session.id}
              session={session}
              isToday={session.id === todaySessionId}
              hairline={i < week.length - 1}
            />
          ))}
        </Section>
      </div>
    </div>
  );
}
