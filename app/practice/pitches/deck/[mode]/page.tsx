import PracticeTypePage from "@/components/practice/routes/PracticeTypePage";
export default async function DeckPitchPage({ params }: { params: Promise<{ mode: string }> }) { const { mode } = await params; return <PracticeTypePage typeSlug={mode} />; }
