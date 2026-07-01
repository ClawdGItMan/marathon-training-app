import Link from "next/link";

export function RaceCountdown({
  raceName,
  daysOut,
}: {
  raceName: string;
  daysOut: number;
}) {
  return (
    <div className="relative mt-[13px] text-center">
      <Link
        href="/settings"
        aria-label="Settings"
        className="absolute left-4 top-0 h-[30px] w-[30px] rounded-full border border-white/[.12]"
        style={{
          background: "linear-gradient(135deg,#3a4350,#222831)",
        }}
      />
      <div className="font-ui text-[10px] font-bold tracking-[.26em] text-[#697079]">
        {raceName.toUpperCase()}
      </div>
      <div className="mt-[3px] font-ui text-[12px] font-bold tracking-[.05em] text-[#aab0b9]">
        {daysOut} DAYS OUT
      </div>
      <Link
        href="/log"
        className="absolute right-4 top-0 inline-flex items-center gap-1 rounded-ctl border border-white/[.12] bg-white/[.05] px-[9px] py-[5px] font-ui text-[10px] font-bold tracking-[.05em] text-accent"
      >
        ＋ Log
      </Link>
    </div>
  );
}
