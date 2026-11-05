import { notFound } from "next/navigation";

import PracticeTypePage from "@/components/practice/routes/PracticeTypePage";

export default async function Page({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  // `technical-coding` is an internal report discriminator, not a public URL.
  if (type === "technical-coding") notFound();
  return <PracticeTypePage />;
}
