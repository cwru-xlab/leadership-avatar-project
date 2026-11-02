"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Spinner } from "@heroui/spinner";
import LegacyCasePage from "@/components/practice/routes/LegacyCasePage";
import PracticeInstancePage from "@/components/practice/routes/PracticeInstancePage";

/**
 * Cases and student scenarios share an id space. Resolve ownership at runtime:
 * scenarios use the shared student session engine; staff cases retain their
 * established case-play runtime and APIs.
 */
export default function CanonicalCaseStudyPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const [kind, setKind] = useState<"scenario" | "legacy" | "error" | null>(null);

  useEffect(() => {
    let current = true;
    fetch(`/api/case/get?id=${encodeURIComponent(caseId)}`, { credentials: "include" })
      .then(async (response) => ({ response, data: await response.json().catch(() => ({})) }))
      .then(({ response, data }) => {
        if (current) setKind(!response.ok || !data.caseStudy ? "error" : data.caseStudy.ownerId ? "scenario" : "legacy");
      })
      .catch(() => current && setKind("error"));
    return () => {
      current = false;
    };
  }, [caseId]);

  if (!kind) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Spinner size="lg" /></div>;
  }
  if (kind === "error") {
    return <div className="flex min-h-[50vh] items-center justify-center p-6 text-danger">Unable to load this case study. Please try again.</div>;
  }
  return kind === "scenario"
    ? <PracticeInstancePage typeSlug="case-study" instanceId={caseId} />
    : <LegacyCasePage caseId={caseId} />;
}
