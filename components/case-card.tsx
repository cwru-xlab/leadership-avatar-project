"use client";

import LibraryCard from "@/components/practice/LibraryCard";
import type { CaseStudy } from "@/types";

interface CaseCardProps {
  caseStudy: CaseStudy;
  onClick: (caseId: string) => void;
}

/** A staff-written case study in the /case-play library. */
export default function CaseCard({ caseStudy, onClick }: CaseCardProps) {
  const count = caseStudy.avatars.length;
  return (
    <button
      className="group h-full w-full rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-true-blue"
      type="button"
      onClick={() => onClick(caseStudy.id)}
    >
      <LibraryCard
        characters={caseStudy.avatars.map((a) => ({ name: a.name, role: a.role }))}
        coverImage={caseStudy.coverImage}
        footer={`${count} character${count !== 1 ? "s" : ""}`}
        summary={caseStudy.backgroundInfo}
        title={caseStudy.name}
      />
    </button>
  );
}
