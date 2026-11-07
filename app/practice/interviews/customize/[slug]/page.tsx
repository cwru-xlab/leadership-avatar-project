import { notFound } from "next/navigation";

import InterviewCustomizePage from "@/components/interview/InterviewCustomizePage";
import { getInterviewType } from "@/lib/interview/types";

/**
 * Customization page for one interview preset, keyed by ENGINE slug (the same
 * key the sessionStorage handoff uses). Unlisted presets still resolve so old
 * links keep working.
 */
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const preset = getInterviewType(slug);
  if (!preset) notFound();
  return <InterviewCustomizePage slug={preset.slug} />;
}
