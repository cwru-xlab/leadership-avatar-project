import PracticeTypePage from "@/components/practice/routes/PracticeTypePage";
export default async function InterviewPage({ params }: { params: Promise<{ type: string }> }) { const { type } = await params; return <PracticeTypePage typeSlug={type} />; }
