import { LogScreen } from "@/components/log/LogScreen";

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  const { focus } = await searchParams;

  return <LogScreen focusPain={focus === "pain"} />;
}
