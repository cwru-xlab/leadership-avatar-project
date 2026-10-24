"use client";

/**
 * A final, local-only briefing before an interview session begins. The parent
 * resolves the selected role and interviewer, so this step neither persists
 * data nor adds another session launch path.
 */

import type { SetupStepNav } from "@/components/practice/SetupWizard";
import { Button } from "@heroui/button";
import { ArrowRight, BriefcaseBusiness, Image, UserRound } from "lucide-react";

export interface InterviewBackgroundReminderStepProps {
  nav: SetupStepNav;
  roleTitle: string;
  industry: string;
  interviewerName: string;
  hasResume: boolean;
}

export default function InterviewBackgroundReminderStep({
  nav,
  roleTitle,
  industry,
  interviewerName,
  hasResume,
}: InterviewBackgroundReminderStepProps) {
  return (
    <section
      className="mx-auto max-w-3xl"
      aria-labelledby="interview-background-heading"
    >
      <div className="rounded-2xl border border-[#d4e2e9] bg-white p-6 shadow-[0_12px_32px_rgba(30,68,85,0.07)] sm:p-9">
        <div className="flex items-start gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e0f3f9] text-[#08718d]">
            <BriefcaseBusiness size={21} aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#0a7391]">
              Step {nav.stepNumber} of {nav.totalSteps}
            </p>
            <h2
              id="interview-background-heading"
              className="mt-1 font-serif text-3xl tracking-[-0.03em]"
            >
              A quick reminder before you begin.
            </h2>
            <p className="mt-3 max-w-xl text-[15px] leading-7 text-[#58727f]">
              Keep this context in mind as you answer. Your interviewer will
              begin with the first question after you enter the session.
            </p>
          </div>
        </div>

        <dl className="mt-7 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[#d4e2e9] bg-[#f6fafb] p-4">
            <dt className="text-xs font-bold uppercase tracking-[0.14em] text-[#58727f]">
              Role focus
            </dt>
            <dd className="mt-1 text-base font-semibold text-[#183947]">
              {roleTitle}
            </dd>
            <p className="mt-1 text-sm leading-6 text-[#58727f]">
              Frame examples around work in {industry}.
            </p>
          </div>
          <div className="rounded-xl border border-[#d4e2e9] bg-[#f6fafb] p-4">
            <dt className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[#58727f]">
              <UserRound size={15} aria-hidden="true" /> Interviewer
            </dt>
            <dd className="mt-1 text-base font-semibold text-[#183947]">
              {interviewerName}
            </dd>
            <p className="mt-1 text-sm leading-6 text-[#58727f]">
              Answer directly, then connect your experience to the role.
            </p>
          </div>
        </dl>

        <p className="mt-5 rounded-xl bg-[#effaf5] px-4 py-3 text-sm leading-6 text-[#185b49]">
          {hasResume
            ? "Your uploaded resume is available for grounded follow-up questions."
            : "Use specific examples that show how you would contribute in this role."}
        </p>

        <aside
          className="mt-3 flex gap-3 rounded-xl border border-[#d4e2e9] bg-[#f6fafb] px-4 py-3 text-sm leading-6 text-[#405d69]"
          aria-labelledby="camera-background-reminder"
        >
          <Image
            className="mt-0.5 shrink-0 text-[#08718d]"
            size={18}
            aria-hidden="true"
          />
          <div>
            <h3 id="camera-background-reminder" className="font-semibold text-[#183947]">
              Set up your camera background
            </h3>
            <p className="mt-1">
              A professional or softly blurred background keeps the focus on you
              and can make a strong first impression.
            </p>
          </div>
        </aside>

        <div className="mt-8 flex justify-between gap-3 border-t border-[#e0eaee] pt-6">
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
