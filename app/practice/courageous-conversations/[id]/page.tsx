import PracticeInstancePage from "@/components/practice/routes/PracticeInstancePage";
export default async function ConversationSessionPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <PracticeInstancePage typeSlug="difficult-conversation" instanceId={id} />; }
