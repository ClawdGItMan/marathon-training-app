import { WorkoutDetailScreen } from "@/components/workout/WorkoutDetailScreen";

export default async function WorkoutDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;

  return <WorkoutDetailScreen sessionId={id} from={from} />;
}
