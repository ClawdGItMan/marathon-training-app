import { CoachScreen } from "@/components/coach/CoachScreen";

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;

  return <CoachScreen from={from} />;
}
