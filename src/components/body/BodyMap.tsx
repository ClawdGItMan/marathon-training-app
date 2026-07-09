"use client";

export type BodyMapArea = {
  id: string;
  name: string;
  cx: number;
  cy: number;
};

// Hotspot layout mirrors the prototype's body-figure SVG (viewBox 0 0 120 188):
// shoulders L/R, hip, knees L/R, and the two seeded pain areas (left ankle for
// achilles-l, right calf for calf-r).
export const BODY_MAP_AREAS: BodyMapArea[] = [
  { id: "shoulder-l", name: "Shoulder · Left", cx: 48, cy: 50 },
  { id: "shoulder-r", name: "Shoulder · Right", cx: 72, cy: 50 },
  { id: "hip", name: "Hip", cx: 60, cy: 86 },
  { id: "knee-l", name: "Knee · Left", cx: 51, cy: 130 },
  { id: "knee-r", name: "Knee · Right", cx: 69, cy: 130 },
  { id: "achilles-l", name: "Achilles · Left", cx: 50, cy: 160 },
  { id: "calf-r", name: "Calf · Right", cx: 70, cy: 160 },
];

export function BodyMap({
  areas,
  activeId,
  activeAreaIds,
  onSelect,
}: {
  areas: BodyMapArea[];
  activeId: string | null;
  activeAreaIds: string[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex justify-center pb-[2px] pt-2">
      <div className="relative" style={{ width: 118, height: 184 }}>
        <svg width="118" height="184" viewBox="0 0 120 188" style={{ display: "block" }}>
          <circle cx="60" cy="22" r="12" fill="#39424e" />
          <rect x="45" y="36" width="30" height="56" rx="12" fill="#39424e" />
          <path d="M47 42 L35 92" stroke="#39424e" strokeWidth="11" strokeLinecap="round" />
          <path d="M73 42 L85 92" stroke="#39424e" strokeWidth="11" strokeLinecap="round" />
          <path d="M53 90 L50 166" stroke="#39424e" strokeWidth="13" strokeLinecap="round" />
          <path d="M67 90 L70 166" stroke="#39424e" strokeWidth="13" strokeLinecap="round" />
          {areas.map((area) => {
            const isActiveArea = activeAreaIds.includes(area.id);
            if (isActiveArea) {
              return (
                <g key={area.id}>
                  <circle cx={area.cx} cy={area.cy} r={8} fill="rgba(201,245,63,.22)" />
                  <circle cx={area.cx} cy={area.cy} r={4} fill="#C9F53F" />
                </g>
              );
            }
            return (
              <circle
                key={area.id}
                cx={area.cx}
                cy={area.cy}
                r={4.5}
                fill="none"
                stroke="rgba(255,255,255,.35)"
                strokeWidth={1.6}
              />
            );
          })}
        </svg>
        {areas.map((area) => {
          const left = (area.cx / 120) * 100;
          const top = (area.cy / 188) * 100;
          const pressed = area.id === activeId;
          return (
            <button
              key={area.id}
              type="button"
              aria-label={area.name}
              aria-pressed={pressed}
              onClick={() => onSelect(area.id)}
              className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${left}%`, top: `${top}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}
