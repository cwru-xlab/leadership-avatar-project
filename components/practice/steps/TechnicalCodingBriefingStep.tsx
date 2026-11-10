"use client";

/**
 * Learner-facing orientation immediately before the shared camera gate for a
 * technical coding interview. It intentionally contains no assignment,
 * evaluator, or execution-harness data and does not persist any state.
 */

import type { SetupStepNav } from "@/components/practice/SetupWizard";
import { Button } from "@heroui/button";
import {
  ArrowRight,
  Code2,
  Lightbulb,
  MessageSquareText,
  TestTube2,
} from "lucide-react";

const SCORE_WELL = [
  "Clarify the function contract and assumptions before you code.",
  "Explain your approach, including time and space complexity.",
  "Narrate debugging, test boundary cases, and finish with a walkthrough.",
] as const;

export default function TechnicalCodingBriefingStep({
  nav,
}: {
  nav: SetupStepNav;
}) {
  return (
    <section
      className="mx-auto max-w-3xl"
      aria-labelledby="technical-coding-briefing-heading"
      data-testid="technical-coding-briefing"
    >
      <div className="rounded-xl border border-line bg-white p-6 sm:p-9">
        <div className="flex items-start gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-light-blue/32 text-link">
            <Code2 size={21} aria-hidden="true" />
          </div>
          <div>
            <h2
              id="technical-coding-briefing-heading"
              className="mt-1 font-display text-3xl font-medium tracking-[-0.03em]"
            >
              How this coding interview works
            </h2>
            <p className="mt-3 max-w-xl text-[15px] leading-7 text-muted">
              You will solve one coding problem while communicating your
              reasoning to an interviewer. A strong interview is about both
              the result and how you get there.
            </p>
          </div>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <section className="rounded-xl border border-line bg-canvas p-5" aria-labelledby="coding-assessment-heading">
            <h3 id="coding-assessment-heading" className="font-semibold text-ink">
              What is assessed
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              Correctness, code and algorithm quality, and technical
              communication all matter. Consider complexity and edge cases as
              you work.
            </p>
          </section>
          <section className="rounded-xl border border-line bg-canvas p-5" aria-labelledby="coding-communication-heading">
            <div className="flex items-center gap-2">
              <MessageSquareText className="text-link" size={18} aria-hidden="true" />
              <h3 id="coding-communication-heading" className="font-semibold text-ink">
                Communicate your thinking
              </h3>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">
              You can speak or type to the interviewer. Share your reasoning
              before and during implementation, not only after the code works.
            </p>
          </section>
        </div>

        <section className="mt-5 rounded-xl border border-true-blue bg-light-blue/22 p-5" aria-labelledby="coding-success-heading">
          <h3 id="coding-success-heading" className="font-semibold text-ink">
            How to do well
          </h3>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-ink">
            {SCORE_WELL.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-link" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <aside className="flex gap-3 rounded-xl border border-line bg-canvas p-5" aria-labelledby="coding-tests-heading">
            <TestTube2 className="mt-0.5 shrink-0 text-link" size={19} aria-hidden="true" />
            <div>
              <h3 id="coding-tests-heading" className="font-semibold text-ink">
                Tests
              </h3>
              <p className="mt-1 text-sm leading-6 text-muted">
                Visible tests run locally in your browser. Your final code and
                interview communication are saved for evaluation; deterministic
                hidden-test correctness is not currently calculated.
              </p>
            </div>
          </aside>
          <aside className="flex gap-3 rounded-xl border border-line bg-canvas p-5" aria-labelledby="coding-hints-heading">
            <Lightbulb className="mt-0.5 shrink-0 text-link" size={19} aria-hidden="true" />
            <div>
              <h3 id="coding-hints-heading" className="font-semibold text-ink">
                Hints
              </h3>
              <p className="mt-1 text-sm leading-6 text-muted">
                You can request stage-specific hints. Based on your progress,
                the interviewer may move directly to the most relevant stage;
                hints are nudges, not solution steps.
              </p>
            </div>
          </aside>
        </div>

        <div className="mt-8 flex justify-between gap-3 border-t border-line pt-6">
          <Button variant="light" onPress={nav.goBack}>
            Back
          </Button>
          <Button
            color="primary"
            endContent={<ArrowRight size={17} aria-hidden="true" />}
            onPress={nav.goNext}
          >
            Continue to camera setup
          </Button>
        </div>
      </div>
    </section>
  );
}
