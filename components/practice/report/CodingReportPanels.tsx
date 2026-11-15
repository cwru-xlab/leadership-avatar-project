"use client";

/**
 * Report panels for a technical coding interview:
 *
 * - `CodingScoresPanel` — the three coding rubric dimensions as figure cards,
 *   the way motivational interviewing shows its MITI globals: BESIDE the four
 *   headline scores, never added to them. Coding correctness reads "Not run"
 *   while no server executor exists (`evaluation-runner.ts` stores null).
 * - `CodingStepsPanel` — the step-by-step process checklist
 *   (`TECHNICAL_CODING_FRAMEWORK`) through the shared `ProcessStepsSection`.
 *   Self-nulls without `codingSteps`, so reports graded before the checklist
 *   existed render without it.
 * - `CodingSolutionPanel` — "Your solution": the problem, the target
 *   complexity, the student's final code, the visible tests, hints used, how a
 *   strong candidate approaches it, and the model solution.
 *
 * THE MODEL SOLUTION IS NOT IN THE PAGE UNTIL ASKED FOR. The user's decision
 * (2026-11-15): the approach shows, the solution sits behind an explicit
 * "Show model solution" so a student who wants to retry fresh is never
 * spoiled. It is fetched from its own owner-only route on click, never
 * prefetched, and "Hide" unmounts it again.
 *
 * No resume or job-posting attribution belongs here: the coding report is
 * graded on the code and the conversation about it.
 */

import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@heroui/button";
import { ChevronDown, Eye, EyeOff } from "lucide-react";

import LevelChip from "@/components/report/LevelChip";
import { SCORE_LABELS, scoreLevel } from "@/components/interview/ReportScoreCards";
import type { ReportDTO } from "@/lib/report/dto";
import { asProcessStepResults } from "@/lib/problem-interview/outcome";
import { toPublicFramework } from "@/lib/problem-interview/session-state";
import {
  CODING_STEPS_OUTCOME_KEY,
  TECHNICAL_CODING_FRAMEWORK,
} from "@/lib/technical-interview/process-framework";
import { TECHNICAL_CODING_RUBRIC_EXTRAS } from "@/lib/technical-interview/prompts";
import {
  TECHNICAL_CODING_LANGUAGE_LABEL,
  TECHNICAL_CODING_LANGUAGES,
  type TechnicalCodingLanguage,
} from "@/lib/technical-interview/types";

import { ProcessStepsSection } from "./ProcessStepsPanel";

/** CodeMirror is client-only and heavy; the report loads it only for this tab. */
const ReadOnlyCode = dynamic(() => import("./ReadOnlyCode"), {
  ssr: false,
  loading: () => <div aria-hidden className="h-40 animate-pulse rounded-lg bg-canvas" />,
});

const PUBLIC_CODING_FRAMEWORK = toPublicFramework(TECHNICAL_CODING_FRAMEWORK);

/**
 * Optional outcome field naming how `coding_correctness` was decided:
 * `"executed"` (tests ran) or `"reading"` (estimated from reading the code).
 * Absent today. A number without it is treated as a reading-based estimate,
 * because no server executor exists (`sandbox.ts` is fail-closed).
 */
export const CODING_CORRECTNESS_BASIS_KEY = "codingCorrectnessBasis";

function codingInput(report: ReportDTO) {
  return report.input?.kind === "technical-coding" ? report.input : null;
}

export function isCodingReport(report: ReportDTO): boolean {
  return codingInput(report) !== null;
}

function Section({
  title,
  children,
  testId,
  aside,
}: {
  title: string;
  children: ReactNode;
  testId: string;
  aside?: ReactNode;
}) {
  return (
    <section
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-white px-5 py-5 sm:px-6"
      data-testid={testId}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-[22px] font-medium leading-[1.15] text-cwru-blue">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group text-[14px]">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-semibold text-link focus-visible:outline focus-visible:outline-2 focus-visible:outline-true-blue">
        {summary}
        <ChevronDown size={16} aria-hidden className="shrink-0 group-open:rotate-180 motion-safe:transition-transform" />
      </summary>
      <div className="flex flex-col gap-2 pt-1">{children}</div>
    </details>
  );
}

/* ------------------------------------------------------------------------ */
/* Coding scores                                                            */
/* ------------------------------------------------------------------------ */

/** Shown first to last: the two the evaluator scores, then correctness. */
const SCORE_ORDER = ["coding_quality", "technical_communication", "coding_correctness"] as const;

const normalize = (value: string) => value.trim().toLowerCase().replace(/[\s_-]+/g, " ").replace(/ score$/, "");

/**
 * The rubric note the evaluator wrote for one dimension. Matched by key or by
 * label, case-insensitively, because the model writes `item` as free text
 * ("Coding Quality", "coding_quality").
 */
function noteFor(report: ReportDTO, key: string, label: string): string | null {
  const notes = report.reportStructured?.rubric_notes ?? [];
  const wanted = new Set([normalize(key), normalize(label)]);
  const hit = notes.find((n) => wanted.has(normalize(n.item)));
  const text = hit?.note.trim().replace(/^meets all criteria:\s*(no|yes)[.;]?\s*/i, "");
  return text ? text.replace(/^./, (c) => c.toUpperCase()) : null;
}

export function CodingScoresPanel({ report }: { report: ReportDTO }) {
  if (!isCodingReport(report)) return null;
  const basis = report.outcome?.[CODING_CORRECTNESS_BASIS_KEY];

  return (
    <Section title="Coding scores" testId="coding-scores-panel">
      <p className="max-w-[65ch] text-[14px] leading-6 text-muted">
        Scored on your code and how you explained it. They sit beside the four scores above and
        aren&apos;t blended into them.
      </p>
      <ul className="m-0 grid list-none grid-cols-1 gap-2.5 p-0 lg:grid-cols-3">
        {SCORE_ORDER.map((key) => {
          const dim = TECHNICAL_CODING_RUBRIC_EXTRAS.find((d) => d.key === key)!;
          const raw = report.scores?.[key];
          const score = typeof raw === "number" ? raw : null;
          const note = noteFor(report, dim.key, dim.label);
          const isCorrectness = key === "coding_correctness";
          const caption =
            isCorrectness && score !== null
              ? basis === "executed"
                ? "From running your code against the tests."
                : "Estimated from reading your code. No tests were run."
              : null;

          return (
            <li
              key={key}
              className={`flex min-w-0 flex-col gap-1.5 rounded-lg border border-line px-4 py-3.5 ${score === null ? "la-hatch" : ""}`}
              data-testid={`coding-score-${key}`}
            >
              {score !== null ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-baseline gap-1">
                    <span className="font-display text-[28px] font-medium leading-none text-cwru-blue [font-variant-numeric:lining-nums]">
                      {score}
                    </span>
                    <span className="text-[13px] text-muted">/ 5</span>
                  </p>
                  <LevelChip label={SCORE_LABELS[scoreLevel(score)] ?? ""} level={scoreLevel(score)} />
                </div>
              ) : (
                <p className="font-display text-[22px] font-medium leading-tight text-muted">
                  {isCorrectness ? "Not run" : "Not scored"}
                </p>
              )}
              <p className="text-[13.5px] font-semibold text-ink">{dim.label}</p>
              <p className="text-[12.5px] leading-[1.45] text-muted">
                {isCorrectness && score === null
                  ? "Your code wasn't run against the tests on our side, so correctness isn't scored."
                  : (caption ?? dim.description)}
              </p>
              {note ? <p className="text-[13px] leading-[1.5] text-ink">{note}</p> : null}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/* ------------------------------------------------------------------------ */
/* Process steps                                                            */
/* ------------------------------------------------------------------------ */

export function hasCodingSteps(report: ReportDTO): boolean {
  return asProcessStepResults(report.outcome?.[CODING_STEPS_OUTCOME_KEY]) !== null;
}

export function CodingStepsPanel({ report }: { report: ReportDTO }) {
  if (!hasCodingSteps(report)) return null;
  return (
    <ProcessStepsSection
      framework={PUBLIC_CODING_FRAMEWORK}
      stepResults={report.outcome?.[CODING_STEPS_OUTCOME_KEY]}
      heading="Process steps"
      testId="coding-steps"
      summaryStatuses={["hit", "prompted", "partly", "missed", "not_applicable"]}
    />
  );
}

/* ------------------------------------------------------------------------ */
/* Your solution                                                            */
/* ------------------------------------------------------------------------ */

interface CodingSolutionView {
  language: TechnicalCodingLanguage;
  finalSource: string | null;
  hints: { tier: number; text: string }[];
  maxHints: number;
  material: { approach: string; complexity: string; pitfalls: string[] } | null;
  modelSolutionLanguages: TechnicalCodingLanguage[];
}

type Load<T> = { state: "loading" } | { state: "error" } | { state: "ready"; data: T };

function formatValue(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function CodingSolutionPanel({ report }: { report: ReportDTO }) {
  const input = codingInput(report);
  const [load, setLoad] = useState<Load<CodingSolutionView>>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/practice/report/${report.id}/coding`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { solution?: CodingSolutionView };
        if (cancelled) return;
        setLoad(response.ok && body.solution ? { state: "ready", data: body.solution } : { state: "error" });
      })
      .catch(() => !cancelled && setLoad({ state: "error" }));
    return () => {
      cancelled = true;
    };
  }, [report.id]);

  if (!input) return null;
  const { assignment, language } = input;
  const solution = load.state === "ready" ? load.data : null;
  const complexity = solution?.material?.complexity || assignment.expectedComplexity;
  const languageLabel = TECHNICAL_CODING_LANGUAGE_LABEL[language];

  return (
    <div className="flex flex-col gap-4" data-testid="coding-solution-panel">
      <Section title="The problem" testId="coding-problem">
        <p className="font-semibold text-ink">{assignment.title}</p>
        <p className="max-w-[65ch] whitespace-pre-line text-[15px] leading-6 text-ink">{assignment.statement}</p>
        <p className="text-[14px] text-ink" data-testid="coding-target-complexity">
          <span className="font-semibold">Target complexity: </span>
          {complexity}
        </p>
        {assignment.constraints.length > 0 ? (
          <Disclosure summary={`Constraints (${assignment.constraints.length})`}>
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[14px] leading-6 text-ink">
              {assignment.constraints.map((constraint) => (
                <li key={constraint}>{constraint}</li>
              ))}
            </ul>
          </Disclosure>
        ) : null}
      </Section>

      <Section
        title="Your final code"
        testId="coding-final-code"
        aside={<span className="text-[13px] text-muted">{languageLabel}</span>}
      >
        {load.state === "loading" ? (
          <div aria-hidden className="h-40 animate-pulse rounded-lg bg-canvas" />
        ) : load.state === "error" ? (
          <p className="text-[14px] text-muted">We couldn&apos;t load your code. Refresh to try again.</p>
        ) : solution?.finalSource ? (
          <ReadOnlyCode
            code={solution.finalSource}
            language={solution.language}
            label={`Your final ${languageLabel} code`}
          />
        ) : (
          <p className="max-w-[65ch] text-[14px] leading-6 text-muted" data-testid="coding-final-code-empty">
            This session ended before your final code was saved, so there is no code to show.
          </p>
        )}
      </Section>

      <Section title="Visible tests" testId="coding-visible-tests">
        {assignment.publicTests.length ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {assignment.publicTests.map((t) => (
              <li key={t.id} className="flex min-w-0 flex-col gap-1 rounded-lg bg-canvas px-3 py-2.5">
                <span className="text-[13px] font-semibold text-ink">{t.label}</span>
                <code className="min-w-0 break-all font-mono text-[13px] text-ink">
                  {formatValue(t.input)} → {formatValue(t.expected)}
                </code>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-muted">This problem had no visible tests.</p>
        )}
      </Section>

      <Section
        title="Hints used"
        testId="coding-hints"
        aside={
          solution ? (
            <span className="text-[13px] font-semibold text-ink" data-testid="coding-hints-count">
              {solution.hints.length} of {solution.maxHints}
            </span>
          ) : null
        }
      >
        {!solution ? (
          <p className="text-[14px] text-muted">{load.state === "error" ? "Hints couldn't be loaded." : "Loading…"}</p>
        ) : solution.hints.length === 0 ? (
          <p className="text-[14px] text-muted">You didn&apos;t ask for a hint.</p>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {solution.hints.map((hint) => (
              <li key={hint.tier} className="flex flex-col gap-0.5 border-l-2 border-light-blue pl-3">
                <span className="text-[13px] font-semibold text-muted">Hint {hint.tier}</span>
                <span className="max-w-[65ch] text-[14px] leading-6 text-ink">{hint.text}</span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="How a strong candidate approaches it" testId="coding-approach">
        {!solution ? (
          <p className="text-[14px] text-muted">{load.state === "error" ? "This couldn't be loaded." : "Loading…"}</p>
        ) : solution.material ? (
          <>
            <div className="flex max-w-[65ch] flex-col gap-2 text-[15px] leading-6 text-ink">
              {solution.material.approach
                .split(/\n\s*\n/)
                .filter((p) => p.trim())
                .map((paragraph, i) => (
                  <p key={i}>{paragraph.trim()}</p>
                ))}
            </div>
            {solution.material.pitfalls.length > 0 ? (
              <Disclosure summary={`Common pitfalls (${solution.material.pitfalls.length})`}>
                <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[14px] leading-6 text-ink">
                  {solution.material.pitfalls.map((pitfall) => (
                    <li key={pitfall}>{pitfall}</li>
                  ))}
                </ul>
              </Disclosure>
            ) : null}
          </>
        ) : (
          <p className="max-w-[65ch] text-[14px] leading-6 text-muted" data-testid="coding-approach-empty">
            A worked approach for this problem isn&apos;t available yet.
          </p>
        )}
      </Section>

      {solution && solution.modelSolutionLanguages.length > 0 ? (
        <ModelSolution
          reportId={report.id}
          languages={solution.modelSolutionLanguages}
          initial={solution.modelSolutionLanguages.includes(language) ? language : solution.modelSolutionLanguages[0]}
        />
      ) : null}
    </div>
  );
}

function ModelSolution({
  reportId,
  languages,
  initial,
}: {
  reportId: string;
  languages: TechnicalCodingLanguage[];
  initial: TechnicalCodingLanguage;
}) {
  const [revealed, setRevealed] = useState(false);
  const [language, setLanguage] = useState<TechnicalCodingLanguage>(initial);
  const [code, setCode] = useState<Partial<Record<TechnicalCodingLanguage, string>>>({});
  const [error, setError] = useState(false);

  // Fetched only once revealed, one language at a time, and kept for this
  // visit so switching back is instant. Hiding unmounts the code.
  useEffect(() => {
    if (!revealed || code[language] !== undefined) return;
    let cancelled = false;
    setError(false);
    fetch(`/api/practice/report/${reportId}/coding/model-solution?language=${language}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { code?: string };
        if (cancelled) return;
        if (response.ok && typeof body.code === "string") setCode((prev) => ({ ...prev, [language]: body.code }));
        else setError(true);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [revealed, language, reportId, code]);

  const shown = code[language];

  return (
    <Section title="Model solution" testId="coding-model-solution">
      {!revealed ? (
        <div className="flex flex-col items-start gap-3">
          <p className="max-w-[65ch] text-[14px] leading-6 text-muted">
            Spoiler: this is a full working answer. If you&apos;d rather solve it fresh with Practice
            again, leave it hidden.
          </p>
          <Button
            variant="bordered"
            className="h-11 rounded-lg border-cwru-blue px-4 font-semibold text-cwru-blue"
            startContent={<Eye aria-hidden size={18} />}
            onPress={() => setRevealed(true)}
          >
            Show model solution
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {languages.length > 1 ? (
              <div role="group" aria-label="Solution language" className="inline-flex rounded-lg border border-line p-0.5">
                {TECHNICAL_CODING_LANGUAGES.filter((l) => languages.includes(l)).map((l) => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={language === l}
                    onClick={() => setLanguage(l)}
                    className={`min-h-11 rounded-md px-3 text-[14px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-true-blue ${
                      language === l ? "bg-light-blue/32 text-cwru-blue" : "text-muted hover:text-cwru-blue"
                    }`}
                  >
                    {TECHNICAL_CODING_LANGUAGE_LABEL[l]}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-[13px] text-muted">{TECHNICAL_CODING_LANGUAGE_LABEL[language]}</span>
            )}
            <Button
              variant="light"
              className="h-11 rounded-lg px-3 font-semibold text-link"
              startContent={<EyeOff aria-hidden size={18} />}
              onPress={() => setRevealed(false)}
            >
              Hide model solution
            </Button>
          </div>
          {error ? (
            <p className="text-[14px] text-muted">We couldn&apos;t load the model solution. Try again in a moment.</p>
          ) : shown !== undefined ? (
            <div data-testid="coding-model-solution-code">
              <ReadOnlyCode
                code={shown}
                language={language}
                label={`Model solution in ${TECHNICAL_CODING_LANGUAGE_LABEL[language]}`}
              />
            </div>
          ) : (
            <div aria-hidden className="h-40 animate-pulse rounded-lg bg-canvas" />
          )}
        </div>
      )}
    </Section>
  );
}
