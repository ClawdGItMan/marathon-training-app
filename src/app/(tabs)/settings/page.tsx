import { SettingsScreen } from "@/components/settings/SettingsScreen";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;

  return <SettingsScreen from={from} />;
}
