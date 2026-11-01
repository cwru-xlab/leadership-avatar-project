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
import { Spinner } from "@heroui/spinner";
import { ArrowRight, Check, CircleAlert, Mic } from "lucide-react";
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
  /** Step heading; defaults to the interview wording (UAT K-6). */
  heading?: string;
  /** Role line under each avatar's name; defaults to the interview wording. */
  roleLabel?: string;
}

export default function InterviewerStep({
  nav,
  selectedInterviewerId,
  onSelect,
  heading = "Choose your interviewer",
  roleLabel = "Hiring manager",
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
          <h2
            id="interviewer-heading"
            className="mt-1 font-display font-medium text-3xl tracking-[-0.03em]"
          >
            {heading}
          </h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-muted">
          Each interviewer uses a compatible voice profile, so the session
          starts without a configuration step.
        </p>
      </div>

      {loadingInterviewers ? (
        <div className="grid min-h-64 place-items-center rounded-xl border border-line bg-white">
          <Spinner color="primary" />
        </div>
      ) : catalogError ? (
        <Card className="border border-copper/40 bg-copper/[0.06] shadow-none">
          <CardBody className="gap-3 p-6 text-copper-deep">
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
                  className={`group relative min-h-60 overflow-hidden rounded-xl border text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-true-blue ${selected ? "border-true-blue bg-light-blue/22" : "border-line bg-white hover:border-true-blue/50 hover:shadow-md"}`}
                >
                  {interviewer.previewUrl ? (
                    <img
                      src={interviewer.previewUrl}
                      alt=""
                      className="absolute inset-0 z-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="absolute inset-0 z-0 bg-cwru-blue" />
                  )}
                  {/* The fade has to carry text over any photo: solid ink under the
                      name block, easing out by mid-card. */}
                  <div className="absolute inset-0 z-10 bg-gradient-to-t from-ink from-15% via-ink/65 via-45% to-transparent to-75%" />
                  <div className="absolute inset-x-0 bottom-0 z-20 p-5 text-white">
                    <div className="mb-3 flex justify-between gap-2">
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-ink/80 px-2.5 py-0.5 text-xs text-white ring-1 ring-white/20"
                        title="Voice profile"
                      >
                        <Mic aria-hidden size={12} />
                        <span className="sr-only">Voice: </span>
                        {interviewer.voice.name}
                      </span>
                      {selected && (
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-true-blue text-white ring-2 ring-white">
                          <Check size={15} strokeWidth={3} />
                        </span>
                      )}
                    </div>
                    <h3 className="font-display font-medium text-2xl">{interviewer.name}</h3>
                    <p className="mt-1 text-sm text-white/90">
                      {roleLabel} · Live session
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
          {/* Sticky, because the roster is ~54 cards deep: a Continue button
              parked under the last row costs the student a long scroll back.
              It stays in flow, so it never covers the final row at rest — it
              only pins while there is still list below. Requires that no
              ancestor create a scroll container; see the overflow-x-clip note
              in app/practice/[type]/page.tsx. It pins at -4rem with matching
              bottom padding because the content column's own 4rem bottom
              padding would otherwise leave a strip of cards showing under it. */}
          <div className="sticky -bottom-16 z-30 mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-canvas pb-20 pt-4 shadow-[0_-12px_20px_-16px_rgb(9_20_58/0.35)]">
            <p className="text-sm text-muted">
              {selectedInterviewer ? (
                <>
                  Selected{" "}
                  <span className="font-semibold text-ink">
                    {selectedInterviewer.name}
                  </span>
                </>
              ) : (
                `${interviewers.length} interviewers — choose one to continue`
              )}
            </p>
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
