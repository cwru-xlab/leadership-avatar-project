import PracticeInstancePage from "@/components/practice/routes/PracticeInstancePage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PracticeInstancePage typeSlug="clinical-communication" instanceId={id} />;
}
