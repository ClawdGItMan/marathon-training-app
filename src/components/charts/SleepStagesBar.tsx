import { formatHM } from "@/lib/format";

export function SleepStagesBar({
  deepMin,
  remMin,
  lightMin,
  needMin,
}: {
  deepMin: number;
  remMin: number;
  lightMin: number;
  needMin: number;
}) {
  const denom = needMin || 1;
  const deepPct = Math.max((deepMin / denom) * 100, 0);
  const remPct = Math.max((remMin / denom) * 100, 0);
  const lightPct = Math.max((lightMin / denom) * 100, 0);

  return (
    <div>
      <div
        style={{
          display: "flex",
          height: 10,
          borderRadius: 2,
          overflow: "hidden",
          background: "rgba(255,255,255,.08)",
          gap: 2,
        }}
      >
        <div style={{ width: `${deepPct}%`, background: "#2c5b86" }} />
        <div style={{ width: `${remPct}%`, background: "#34B3E6" }} />
        <div style={{ width: `${lightPct}%`, background: "#7CB3D9" }} />
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, font: "600 10px var(--font-ui)", color: "#8a919c" }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: "#2c5b86" }} />
          Deep {formatHM(deepMin)}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, font: "600 10px var(--font-ui)", color: "#8a919c" }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: "#34B3E6" }} />
          REM {formatHM(remMin)}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, font: "600 10px var(--font-ui)", color: "#8a919c" }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: "#7CB3D9" }} />
          Light {formatHM(lightMin)}
        </span>
      </div>
    </div>
  );
}
