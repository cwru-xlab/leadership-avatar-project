"use client";

/**
 * Pre-session setup for the coding room, then the room itself.
 *
 * This used to be a single "Begin coding session" button that drew a random
 * problem and hardcoded `cameraMode: "OFF"`. It now runs the SAME generic
 * `SetupWizard` every other practice type runs, with the steps declared on
 * `TECHNICAL_CODING.setupSteps` — so the coding interview gets an interviewer
 * choice, a resume, a job posting and the standard camera consent gate,
 * instead of being the one type with no setup at all.
 *
 * The component NAME is pinned by `scripts/verify-route-contract.ts`, which
 * requires the canonical `/practice/interviews/technical` page to render it.
 * Keep the export name even if this file's contents change again.
 *
 * Two things this file deliberately does not do:
 * - It does not re-implement the start POST. `SetupWizard` owns that; this
 *   page only contributes the body fields via `buildStartPayload`.
 * - It does not send the job posting to the evaluator. The posting is
 *   interviewer context only (`JobDescriptionStep` decision 2) and reaches
 *   the model through the chat body, never the report's evaluation input.
 */

import { useCallback, useState } from "react";

import SetupWizard, { type SetupStepNav } from "@/components/practice/SetupWizard";
import InterviewerStep, {
  type InterviewerOption,
} from "@/components/practice/steps/InterviewerStep";
import JobDescriptionStep from "@/components/practice/steps/JobDescriptionStep";
import ResumeStep from "@/components/practice/steps/ResumeStep";
import TechnicalFocusStep from "@/components/practice/steps/TechnicalFocusStep";
import TechnicalCodingBriefingStep from "@/components/practice/steps/TechnicalCodingBriefingStep";
import TechnicalCodingSession from "@/components/technical-interview/TechnicalCodingSession";
import { getEngineType } from "@/lib/engine/registry";
import type { CameraMode } from "@/lib/metrics/types";
import type {
  TechnicalCodingLanguage,
  TechnicalDifficulty,
  TechnicalTopic,
} from "@/lib/technical-interview/types";
import type { StartAvatarRequest } from "@/types";

export default function TechnicalCodingPracticePage() {
  const engineType = getEngineType("technical-coding");

  const [interviewer, setInterviewer] = useState<InterviewerOption | null>(null);
  const [topics, setTopics] = useState<readonly TechnicalTopic[]>([]);
  const [difficulty, setDifficulty] = useState<TechnicalDifficulty | null>(null);
  const [language, setLanguage] = useState<TechnicalCodingLanguage>("python");
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [resumeFileName, setResumeFileName] = useState<string | undefined>();
  const [jobDescriptionId, setJobDescriptionId] = useState<string | null>(null);
  const [jobDescriptionText, setJobDescriptionText] = useState("");
  const [jobDescriptionFileName, setJobDescriptionFileName] = useState<
    string | undefined
  >();
  const [reportId, setReportId] = useState<string | null>(null);
  // The mode the SERVER resolved, not the one the student asked for — it
  // downgrades to OFF when video consent is missing, and the room must capture
  // against the server's answer.
  const [cameraMode, setCameraMode] = useState<CameraMode>("OFF");

  const buildStartPayload = useCallback(
    () => ({
      interviewerAvatarId: interviewer?.avatarId,
      interviewerName: interviewer?.name,
      resumeId,
      resumeText,
      jobDescriptionId,
      jobDescriptionText,
      // Validated server-side by `normalizeTechnicalSelectionRequest`, which
      // drops anything it does not recognize. Empty means "no preference",
      // which selection reads as the whole catalog rather than an empty pool.
      technicalSelection: { topics, difficulty },
      language,
    }),
    [difficulty, interviewer, jobDescriptionId, jobDescriptionText, language, resumeId, resumeText, topics],
  );

  if (reportId && interviewer) {
    const avatarConfig: StartAvatarRequest = {
      quality: "low",
      avatarName: interviewer.avatarId,
      voice: { voiceId: interviewer.voice.id, rate: 1.05 },
      language: "en",
    };
    return (
      <TechnicalCodingSession
        reportId={reportId}
        avatarConfig={avatarConfig}
        cameraMode={cameraMode}
      />
    );
  }

  if (!engineType) {
    return (
      <main className="grid min-h-full place-items-center p-5">
        <p role="alert" className="text-sm text-danger">
          Technical practice is unavailable right now.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <SetupWizard
        typeSlug={engineType.slug}
        steps={engineType.setupSteps}
        progressAriaLabel="Coding interview setup progress"
        launchLabel="Begin coding session"
        buildStartPayload={buildStartPayload}
        onLaunch={({ reportId: launchedId, cameraMode: locked }) => {
          setCameraMode(locked);
          setReportId(launchedId);
        }}
        renderStep={(stepId: string, nav: SetupStepNav) => {
          if (stepId === "focus") {
            return (
              <TechnicalFocusStep
                nav={nav}
                topics={topics}
                difficulty={difficulty}
                language={language}
                onLanguageChange={setLanguage}
                onTopicsChange={setTopics}
                onDifficultyChange={setDifficulty}
              />
            );
          }

          if (stepId === "interviewer") {
            return (
              <InterviewerStep
                nav={nav}
                selectedInterviewerId={interviewer?.avatarId ?? null}
                onSelect={setInterviewer}
              />
            );
          }

          if (stepId === "resume") {
            return (
              <ResumeStep
                nav={nav}
                resumeId={resumeId}
                resumeFileName={resumeFileName}
                onResumeChange={(next) => {
                  setResumeId(next.resumeId);
                  setResumeText(next.resumeText);
                  setResumeFileName(next.resumeFileName);
                }}
              />
            );
          }

          if (stepId === "job-description") {
            return (
              <JobDescriptionStep
                nav={nav}
                jobDescriptionId={jobDescriptionId}
                jobDescriptionText={jobDescriptionText}
                jobDescriptionFileName={jobDescriptionFileName}
                onJobDescriptionChange={(next) => {
                  setJobDescriptionId(next.jobDescriptionId);
                  setJobDescriptionText(next.jobDescriptionText);
                  setJobDescriptionFileName(next.jobDescriptionFileName);
                }}
              />
            );
          }

          if (stepId === "briefing") {
            return <TechnicalCodingBriefingStep nav={nav} />;
          }

          return null;
        }}
      />
    </main>
  );
}
