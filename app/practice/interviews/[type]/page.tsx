import { redirect } from "next/navigation";

import PracticeTypePage from "@/components/practice/routes/PracticeTypePage";
import { interviewSegment, interviewSlugFromSegment, routes } from "@/lib/routes";

export default async function InterviewPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  // An engine slug with its own public segment (e.g. `technical-coding`) goes to that URL.
  if (interviewSegment(type) !== type) redirect(routes.interview(type));
  return <PracticeTypePage typeSlug={interviewSlugFromSegment(type)} />;
}
