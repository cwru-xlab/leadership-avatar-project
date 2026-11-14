import IndustryInterviewsPage from "@/components/interview/IndustryInterviewsPage";
import { parseInterviewLayout } from "@/components/interview/interviewPicker";

/**
 * Second page of the interview picker: every specialized interview.
 * `?layout=` previews the layout options under review; anything else gets the default.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ layout?: string | string[] }> }) {
  const { layout } = await searchParams;
  return <IndustryInterviewsPage layout={parseInterviewLayout(layout)} />;
}
