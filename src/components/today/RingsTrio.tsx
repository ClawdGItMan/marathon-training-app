import Link from "next/link";
import { RingGauge } from "@/components/charts/RingGauge";

type Ring = {
  label: string;
  value: number;
  display: string;
  color: string;
  sub: string;
  subColor: string;
  fontSize: string;
};

export function RingsTrio({
  readiness,
  readinessDelta,
  sleepPct,
  sleepDuration,
  load,
  loadLabel,
}: {
  readiness: number;
  readinessDelta: number;
  sleepPct: number;
  sleepDuration: string;
  load: number;
  loadLabel: string;
}) {
  const rings: Ring[] = [
    {
      label: "READINESS",
      value: readiness,
      display: String(readiness),
      color: "#FFCE3F",
      sub: `moderate · ${readinessDelta >= 0 ? "↑" : "↓"}${Math.abs(readinessDelta)}`,
      subColor: "#FFCE3F",
      fontSize: "27px",
    },
    {
      label: "SLEEP",
      value: sleepPct,
      display: `${sleepPct}%`,
      color: "#7CB3D9",
      sub: sleepDuration,
      subColor: "#8a919c",
      fontSize: "23px",
    },
    {
      label: "LOAD",
      value: load,
      display: load.toFixed(2),
      color: "#34B3E6",
      sub: loadLabel,
      subColor: "#FF9A3D",
      fontSize: "22px",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-[2px] px-2 pb-1 pt-[14px]">
      {rings.map((ring) => (
        <Link
          key={ring.label}
          href="/body"
          className="flex flex-col items-center gap-[9px]"
        >
          <RingGauge
            value={ring.value}
            max={ring.label === "LOAD" ? 2 : 100}
            color={ring.color}
          >
            <span
              className="font-num font-medium tracking-[-.02em] text-white"
              style={{ fontSize: ring.fontSize }}
            >
              {ring.display}
            </span>
          </RingGauge>
          <div className="text-center">
            <div className="flex items-center justify-center gap-[3px]">
              <span className="font-ui text-[10.5px] font-bold tracking-[.09em] text-white">
                {ring.label}
              </span>
              <span className="text-[11px] font-bold text-[#697079]">›</span>
            </div>
            <div
              className="mt-[3px] font-ui text-[10px] font-semibold"
              style={{ color: ring.subColor }}
            >
              {ring.sub}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
