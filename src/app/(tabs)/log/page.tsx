import { PageHeader } from "@/components/shell/PageHeader";

// Stub tab target — full Log screen (RPE meter, pain chips, SAVE LOG) lands in R10.
export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  const { focus } = await searchParams;

  return (
    <div className="pb-6">
      <PageHeader title="Log" from="log" />
      <div className="p-4">
        <h1 className="text-[22px] font-bold text-white">LOG</h1>
        {focus === "pain" ? (
          <p className="mt-2 text-[13px] text-[#9aa0a7]">Focused on pain entry.</p>
        ) : null}
      </div>
    </div>
  );
}
