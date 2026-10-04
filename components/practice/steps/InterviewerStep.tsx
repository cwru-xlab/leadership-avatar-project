"use client";

/**
 * Interviewer-selection step, ported verbatim from
 * `app/interview/[type]/page.tsx`. Fetches `/api/interview/interviewers`
 * and writes the chosen avatar into setup state owned by the page.
 *
 * CustomizePanel stays on the preset picker (`app/interview/page.tsx`) —
 * today's type-page wizard does not render it, so neither does this step
 * (REQ-69 invisible refactor).
 */

import type { SetupStepNav } from "@/components/practice/SetupWizard";
import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import { ArrowRight, Check, CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";

export interface InterviewerOption {
  avatarId: string;
  name: string;
  previewUrl: string | null;
  voice: { id: string; name: string };
}

export interface InterviewerStepProps {
  nav: SetupStepNav;
  selectedInterviewerId: string | null;
  onSelect: (interviewer: InterviewerOption) => void;
}

export default function InterviewerStep({
  nav,
  selectedInterviewerId,
  onSelect,
}: InterviewerStepProps) {
  const [interviewers, setInterviewers] = useState<InterviewerOption[]>([]);
  const [loadingInterviewers, setLoadingInterviewers] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    const loadInterviewers = async () => {
      try {
        const response = await fetch("/api/interview/interviewers", {
          cache: "no-store",
        });
        const data = (await response.json().catch(() => ({}))) as {
          interviewers?: InterviewerOption[];
          error?: string;
        };
        if (!response.ok || !data.interviewers?.length) {
          throw new Error(data.error || "No interviewers are available right now.");
        }
        if (!isCurrent) return;
        setInterviewers(data.interviewers);
        if (!selectedInterviewerId) {
          onSelect(data.interviewers[0]);
        }
      } catch (error) {
        if (!isCurrent) return;
        setCatalogError(
          error instanceof Error
            ? error.message
            : "No interviewers are available right now.",
        );
      } finally {
        if (isCurrent) setLoadingInterviewers(false);
      }
    };
    void loadInterviewers();
    return () => {
      isCurrent = false;
    };
    // Load once on mount — selection changes must not re-fetch the catalog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedInterviewer = interviewers.find(
    (interviewer) => interviewer.avatarId === selectedInterviewerId,
  );

  return (
    <section aria-labelledby="interviewer-heading">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#0a7391]">
            Step {nav.stepNumber} of {nav.totalSteps}
          </p>
          <h2
            id="interviewer-heading"
            className="mt-1 font-serif text-3xl tracking-[-0.03em]"
          >
            Choose your interviewer.
          </h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-[#58727f]">
          Each interviewer uses a compatible voice profile, so the session
          starts without a configuration step.
        </p>
      </div>

      {loadingInterviewers ? (
        <div className="grid min-h-64 place-items-center rounded-2xl border border-[#d4e2e9] bg-white">
          <Spinner color="primary" />
        </div>
      ) : catalogError ? (
        <Card className="border border-danger-200 bg-danger-50 shadow-none">
          <CardBody className="gap-3 p-6 text-danger-800">
            <CircleAlert size={22} />
            <p>{catalogError}</p>
            <Button size="sm" variant="flat" onPress={() => window.location.reload()}>
              Try again
            </Button>
          </CardBody>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {interviewers.map((interviewer) => {
              const selected = interviewer.avatarId === selectedInterviewerId;
              return (
                <button
                  key={interviewer.avatarId}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(interviewer)}
                  className={`group relative min-h-60 overflow-hidden rounded-2xl border text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0a7391] ${selected ? "border-[#0a7391] bg-[#edf9fc] shadow-[0_12px_28px_rgba(16,104,133,0.14)]" : "border-[#d4e2e9] bg-white hover:border-[#82bdcf] hover:shadow-md"}`}
                >
                  {interviewer.previewUrl ? (
                    <img
                      src={interviewer.previewUrl}
                      alt=""
                      className="absolute inset-0 z-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="absolute inset-0 z-0 bg-[#1d586e]" />
                  )}
                  <div className="absolute inset-0 z-10 bg-gradient-to-t from-[#112c39] via-[#112c39]/20 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 z-20 p-5 text-white">
                    <div className="mb-3 flex justify-between gap-2">
                      <Chip size="sm" className="bg-white/18 text-white">
                        {interviewer.voice.name}
                      </Chip>
                      {selected && (
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-[#79d4b1] text-[#0b3029]">
                          <Check size={15} />
                        </span>
                      )}
                    </div>
                    <h3 className="font-serif text-2xl">{interviewer.name}</h3>
                    <p className="mt-1 text-sm text-white/78">
                      Hiring manager · Live session
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-7 flex justify-end">
            <Button
              color="primary"
              size="lg"
              isDisabled={!selectedInterviewer}
              endContent={<ArrowRight size={17} />}
              onPress={nav.goNext}
            >
              Continue
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
