"use client";

/** The short brief shown above the practice wizard on a prove-it launch. */
import { Target } from "lucide-react";

import type { ProveItInfo } from "@/lib/study-plan/prove-it";

export default function ProveItBrief({ info }: { info: ProveItInfo }) {
  return (
    <div
      data-testid="prove-it-brief"
      className="mb-6 flex items-start gap-3 rounded-xl border-2 border-true-blue bg-canvas p-4 text-sm leading-6 text-ink"
    >
      <Target size={18} className="mt-0.5 shrink-0 text-true-blue" aria-hidden="true" />
      <p>{info.brief}</p>
    </div>
  );
}
