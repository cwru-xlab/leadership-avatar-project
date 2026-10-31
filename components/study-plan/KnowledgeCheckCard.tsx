"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { Textarea } from "@heroui/input";
import { Spinner } from "@heroui/spinner";

import {
  CHECK_FORMATS,
  type CheckFormat,
  type CheckPayload,
} from "@/lib/study-plan/checks/types";
import { displayPrompt } from "@/lib/study-plan/checks/copy";
import { hrefForStep, type PathViewDTO } from "@/components/study-plan/PathPanel";

/**
 * Client-side types mirroring the attempt route's response shapes
 * (app/api/study-plans/checks/[checkId]/attempt/route.ts). NOT imported from
 * that file directly — a route module pulls in Prisma and server-only code,
 * which must never reach a client bundle.
 */
export interface QuotedTextDTO {
  text: string;
  sourceReportId: string;
  turnIndex: number;
}

export interface KeylessCheckDTO {
  id: string;
  format: CheckFormat;
  competencyKey: string;
  prompt: string;
  payload: CheckPayload;
  quotedText: QuotedTextDTO | null;
}

export interface AttemptMarkDTO {
  id: string;
  score: number;
  correct: boolean | null;
  gradedBy: "DETERMINISTIC" | "MODEL";
  detail: string;
  contested: boolean;
}

export interface KnowledgeCheckCardProps {
  planId: string;
  checkId: string;
  check: KeylessCheckDTO;
  initialAttempt: AttemptMarkDTO | null;
}

type ContestState = "idle" | "composing" | "submitting" | "confirmed" | "error";

/**
 * Renders and submits all four knowledge-check formats, shows the mark, and
 * offers the contest affordance. ONE component, four format branches — the
 * submit/mark/contest shell is identical across formats, and duplicating it
 * into four components is how three of them drift from the fourth.
 *
 * NO ANSWER REVEAL BEFORE SUBMISSION. Nothing in this component computes,
 * infers, or displays correctness before a response comes back from the
 * server — the three closed formats are graded server-side specifically so
 * the browser never holds the key. There is no local "is this the right
 * one" branch anywhere below; every correctness signal rendered here reads
 * directly off `attempt`, which is only ever set from a server response.
 */
export default function KnowledgeCheckCard({
  planId,
  checkId,
  check,
  initialAttempt,
}: KnowledgeCheckCardProps) {
  const [attempt, setAttempt] = useState<AttemptMarkDTO | null>(initialAttempt);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [betterIndex, setBetterIndex] = useState<number | null>(null);
  const [blanks, setBlanks] = useState<string[]>(
    check.payload.format === "FILL_IN_BLANK"
      ? new Array(check.payload.blankCount).fill("")
      : []
  );
  const [rewrittenLine, setRewrittenLine] = useState("");

  const [contestState, setContestState] = useState<ContestState>(
    initialAttempt?.contested ? "confirmed" : "idle"
  );
  const [contestReason, setContestReason] = useState("");
  const [contestError, setContestError] = useState<string | null>(null);

  const alreadyAnswered = attempt !== null;
  const nextStepHref = useNextStepHref(planId, checkId, attempt?.id ?? null);
  const contextLine =
    check.payload.format === "REWRITE_WEAK_LINE" || check.payload.format === "PICK_BETTER_RESPONSE"
      ? check.payload.contextLine ?? null
      : null;
  // PICK_BETTER_RESPONSE with context: the context block carries the
  // session link instead of a "My own words" block, because that block
  // would label one of the options as the student's and hand the answer away.
  const showQuoteBlock = !(check.payload.format === "PICK_BETTER_RESPONSE" && contextLine);

  async function submit(responseBody: unknown) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/study-plans/checks/${checkId}/attempt`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(responseBody),
      });
      const data = (await res.json().catch(() => ({}))) as {
        attempt?: AttemptMarkDTO;
        error?: string;
        field?: string;
      };

      if (res.status === 201 && data.attempt) {
        setAttempt(data.attempt);
        return;
      }
      if (res.status === 409 && data.attempt) {
        // A double-click or a stale page must not look like a failure — the
        // prior mark is rendered exactly as if it had just been submitted.
        setAttempt(data.attempt);
        setSubmitError(
          "This check was already answered — showing my original result."
        );
        return;
      }
      // Never show a raw error body — only the server's own message field.
      setSubmitError(data.error || "We couldn't grade that submission.");
    } catch {
      setSubmitError("We couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleContest() {
    if (!attempt) return;
    setContestState("submitting");
    setContestError(null);
    try {
      const res = await fetch(
        `/api/study-plans/check-attempts/${attempt.id}/contest`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: contestReason }),
        }
      );
      if (res.status === 201 || res.status === 409) {
        // A 409 (already contested) gets the SAME confirmation as a fresh
        // success — the mark stands either way, and the student already
        // flagged it once.
        setContestState("confirmed");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setContestError(data.error || "We couldn't raise this contest.");
      setContestState("composing");
    } catch {
      setContestError("We couldn't reach the server. Please try again.");
      setContestState("composing");
    }
  }

  return (
    <Card className="border border-line">
      <CardBody className="space-y-6 p-6">
        <div>
          <p className="text-xs font-bold text-true-blue">
            {FORMAT_LABEL[check.payload.format]}
          </p>
          {/* K3: the question always matches the interaction below it. */}
          <h1 className="mt-1 font-display font-medium text-xl leading-snug text-ink">
            {displayPrompt(check.prompt, check.payload)}
          </h1>
        </div>

        {contextLine && (
          <ContextBlock
            contextLine={contextLine}
            sourceReportId={showQuoteBlock ? null : check.quotedText?.sourceReportId ?? null}
          />
        )}

        {showQuoteBlock && <QuoteBlock quotedText={check.quotedText} />}

        <FormatBody
          payload={check.payload}
          weakLineShownAbove={
            showQuoteBlock &&
            check.payload.format === "REWRITE_WEAK_LINE" &&
            check.quotedText?.text === check.payload.weakLine
          }
          disabled={submitting || alreadyAnswered}
          selectedIndex={selectedIndex}
          onSelectedIndexChange={setSelectedIndex}
          betterIndex={betterIndex}
          onBetterIndexChange={setBetterIndex}
          blanks={blanks}
          onBlanksChange={setBlanks}
          rewrittenLine={rewrittenLine}
          onRewrittenLineChange={setRewrittenLine}
        />

        {submitError && (
          <p className="text-sm text-copper" role="alert">
            {submitError}
          </p>
        )}

        {!alreadyAnswered && (
          <Button
            color="primary"
            isDisabled={
              submitting ||
              !isResponseComplete(check.payload, {
                selectedIndex,
                betterIndex,
                blanks,
                rewrittenLine,
              })
            }
            onPress={() =>
              submit(
                buildResponseBody(check.payload, {
                  selectedIndex,
                  betterIndex,
                  blanks,
                  rewrittenLine,
                })
              )
            }
          >
            {submitting ? <Spinner size="sm" /> : "Submit answer"}
          </Button>
        )}

        {attempt && (
          <MarkPanel
            attempt={attempt}
            contestState={contestState}
            contestReason={contestReason}
            contestError={contestError}
            onContestReasonChange={setContestReason}
            onOpenContest={() => setContestState("composing")}
            onSubmitContest={handleContest}
          />
        )}

        {attempt && (
          <div className="flex flex-col gap-2 sm:flex-row">
            {/* K4: straight on to the next path step, via PathPanel's own link contract. */}
            {nextStepHref && (
              <Button
                as={Link}
                href={nextStepHref}
                color="primary"
                endContent={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
              >
                Continue to my next step
              </Button>
            )}
            <Button
              as={Link}
              href={`/study-plans/${planId}`}
              variant={nextStepHref ? "light" : "solid"}
              color={nextStepHref ? "default" : "primary"}
            >
              Back to my study plan
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

const FORMAT_LABEL: Record<CheckFormat, string> = {
  MULTIPLE_CHOICE: "Multiple choice",
  FILL_IN_BLANK: "Fill in the blank",
  PICK_BETTER_RESPONSE: "Pick the better response",
  REWRITE_WEAK_LINE: "Rewrite a weak line",
};

/**
 * The next path step's href after this check is answered, read from the
 * plan's path DTO (the path GET completes an answered check's step) and
 * built by PathPanel's `hrefForStep`. Null while loading, when the path is
 * finished, or when the next step would be this same check.
 */
function useNextStepHref(planId: string, checkId: string, attemptId: string | null): string | null {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    if (!attemptId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/study-plans/${planId}/path`, {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) return;
        const data = (await response.json().catch(() => ({}))) as { path?: PathViewDTO | null };
        const path = data.path;
        if (!path?.nextStep) return;
        const row = path.steps.find((step) => step.id === path.nextStep!.stepId);
        if (!row || (row.kind === "KNOWLEDGE_CHECK" && row.knowledgeCheckId === checkId)) return;
        const next = hrefForStep(planId, row);
        if (!cancelled) setHref(next);
      } catch {
        // "Back to my study plan" is always rendered; nothing to report.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planId, checkId, attemptId]);
  return href;
}

// ---------------------------------------------------------------------------
// Context + quote blocks
// ---------------------------------------------------------------------------

/**
 * K5: what the other person said right before the student's line. Copied
 * exactly from the stored transcript at generation (or re-derived from it,
 * through the verbatim gate, for older rows) — rendered untouched, like the
 * quote block below.
 */
function ContextBlock({
  contextLine,
  sourceReportId,
}: {
  contextLine: string;
  sourceReportId: string | null;
}) {
  return (
    <div className="rounded-xl border border-line bg-canvas p-4">
      <p className="text-xs font-bold text-muted">
        In my session, they said
      </p>
      <blockquote
        className="mt-2 text-sm leading-6 text-ink"
        style={{ whiteSpace: "pre-wrap" }}
      >
        {contextLine}
      </blockquote>
      {sourceReportId && (
        <Link
          href={`/practice/reports/${sourceReportId}`}
          className="mt-2 inline-block text-xs font-semibold text-cwru-blue underline underline-offset-2"
        >
          View the session this came from
        </Link>
      )}
    </div>
  );
}

function QuoteBlock({ quotedText }: { quotedText: QuotedTextDTO | null }) {
  if (!quotedText) return null;
  return (
    <div className="rounded-xl border border-light-blue bg-canvas p-4">
      <p className="text-xs font-bold text-true-blue">
        My own words
      </p>
      {/*
        VERBATIM, UNTOUCHED. No .trim(), no ellipsizing, no re-casing, no
        whitespace collapsing between the server's stored text and the
        screen — 21-04's verbatim gate guarantees the stored text matches the
        transcript exactly, and any client-side tidying here would break that
        guarantee at the very last step, where no verifier is watching.
        `pre-wrap` is what lets the original line breaks and spacing render
        exactly as stored, rather than being collapsed by normal HTML
        whitespace handling.
      */}
      <blockquote
        className="mt-2 text-sm leading-6 text-ink"
        style={{ whiteSpace: "pre-wrap" }}
      >
        {quotedText.text}
      </blockquote>
      <Link
        href={`/practice/reports/${quotedText.sourceReportId}`}
        className="mt-2 inline-block text-xs font-semibold text-cwru-blue underline underline-offset-2"
      >
        View the session this came from
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Format branches
// ---------------------------------------------------------------------------

interface FormatBodyProps {
  payload: CheckPayload;
  /** The weak line is already on screen in the quote block above. */
  weakLineShownAbove: boolean;
  disabled: boolean;
  selectedIndex: number | null;
  onSelectedIndexChange: (value: number) => void;
  betterIndex: number | null;
  onBetterIndexChange: (value: number) => void;
  blanks: string[];
  onBlanksChange: (value: string[]) => void;
  rewrittenLine: string;
  onRewrittenLineChange: (value: string) => void;
}

function FormatBody(props: FormatBodyProps) {
  const { payload } = props;

  if (payload.format === "MULTIPLE_CHOICE") {
    return (
      <fieldset disabled={props.disabled} className="space-y-3">
        <legend className="sr-only">Pick the best answer</legend>
        {payload.options.map((option, index) => (
          <label
            key={index}
            className="flex items-center gap-3 rounded-lg border border-line p-3 text-sm text-ink"
          >
            <input
              type="radio"
              name="mc-option"
              aria-label={`Option ${index + 1}: ${option}`}
              checked={props.selectedIndex === index}
              onChange={() => props.onSelectedIndexChange(index)}
            />
            {option}
          </label>
        ))}
      </fieldset>
    );
  }

  if (payload.format === "PICK_BETTER_RESPONSE") {
    return (
      <fieldset disabled={props.disabled} className="space-y-3">
        <legend className="sr-only">Pick the stronger response</legend>
        {/*
          K3: the legacy `rationalePrompt` ("Explain which answer…") is NOT
          rendered — the card takes a choice, not an explanation.
        */}
        {/*
          Neither candidate is ever labelled "yours" — even when one is the
          student's own verbatim line — because naming it would hand the
          answer away for free.
        */}
        {payload.candidates.map((candidate, index) => (
          <label
            key={index}
            className="flex items-center gap-3 rounded-lg border border-line p-3 text-sm text-ink"
          >
            <input
              type="radio"
              name="pbr-candidate"
              aria-label={`Response ${index + 1}: ${candidate}`}
              checked={props.betterIndex === index}
              onChange={() => props.onBetterIndexChange(index)}
            />
            {candidate}
          </label>
        ))}
      </fieldset>
    );
  }

  if (payload.format === "FILL_IN_BLANK") {
    let blankCursor = 0;
    return (
      <fieldset disabled={props.disabled} className="space-y-1">
        <legend className="sr-only">Fill in the blank</legend>
        <p className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm leading-7 text-ink">
          {payload.segments.map((segment, segmentIndex) => {
            const isLastSegment = segmentIndex === payload.segments.length - 1;
            const blankIndex = blankCursor;
            if (!isLastSegment) blankCursor += 1;
            return (
              <span key={segmentIndex} className="inline-flex items-center gap-1">
                {segment}
                {!isLastSegment && (
                  <input
                    type="text"
                    aria-label={`blank ${blankIndex + 1}`}
                    className="w-32 rounded border border-line px-2 py-1"
                    value={props.blanks[blankIndex] ?? ""}
                    onChange={(e) => {
                      // NOT trimmed here — 21-11 owns normalization and does
                      // it deliberately at grade time, so the client must
                      // submit exactly what was typed.
                      const next = [...props.blanks];
                      next[blankIndex] = e.target.value;
                      props.onBlanksChange(next);
                    }}
                  />
                )}
              </span>
            );
          })}
        </p>
      </fieldset>
    );
  }

  // REWRITE_WEAK_LINE
  return (
    <fieldset disabled={props.disabled} className="space-y-3">
      <legend className="sr-only">Rewrite the weak line</legend>
      {!props.weakLineShownAbove && (
        <div className="rounded-lg border border-line p-3 text-sm text-ink">
          <p className="text-xs font-bold text-true-blue">
            My line
          </p>
          <p className="mt-1" style={{ whiteSpace: "pre-wrap" }}>{payload.weakLine}</p>
        </div>
      )}
      <div className="rounded-lg border border-line p-3 text-sm text-ink">
        <p className="text-xs font-bold text-true-blue">
          Technique to apply
        </p>
        <p className="mt-1">{payload.techniqueHint}</p>
      </div>
      {/*
        Criteria shown BEFORE submission, not after: a student graded
        against hidden criteria cannot learn from the grade.
      */}
      <div className="rounded-lg border border-line p-3 text-sm text-ink">
        <p className="text-xs font-bold text-true-blue">
          This rewrite will be judged on
        </p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          {payload.rubricCriteria.map((criterion) => (
            <li key={criterion}>{criterion}</li>
          ))}
        </ul>
      </div>
      <Textarea
        aria-label="My rewrite"
        placeholder="Rewrite the line here…"
        value={props.rewrittenLine}
        onValueChange={props.onRewrittenLineChange}
        minRows={3}
      />
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Response assembly / completeness
// ---------------------------------------------------------------------------

interface DraftResponse {
  selectedIndex: number | null;
  betterIndex: number | null;
  blanks: string[];
  rewrittenLine: string;
}

function isResponseComplete(payload: CheckPayload, draft: DraftResponse): boolean {
  switch (payload.format) {
    case "MULTIPLE_CHOICE":
      return draft.selectedIndex !== null;
    case "PICK_BETTER_RESPONSE":
      return draft.betterIndex !== null;
    case "FILL_IN_BLANK":
      return (
        draft.blanks.length === payload.blankCount &&
        draft.blanks.every((b) => b.length > 0)
      );
    case "REWRITE_WEAK_LINE":
      return draft.rewrittenLine.trim().length > 0;
    default: {
      const exhaustive: never = payload;
      return Boolean(exhaustive);
    }
  }
}

function buildResponseBody(payload: CheckPayload, draft: DraftResponse): unknown {
  switch (payload.format) {
    case "MULTIPLE_CHOICE":
      return { selectedIndex: draft.selectedIndex };
    case "PICK_BETTER_RESPONSE":
      return { betterIndex: draft.betterIndex };
    case "FILL_IN_BLANK":
      // Submitted untrimmed, in order, exactly blankCount entries — 21-11
      // owns normalization and applies it deliberately at grade time.
      return { blanks: draft.blanks };
    case "REWRITE_WEAK_LINE":
      return { rewrittenLine: draft.rewrittenLine };
    default: {
      const exhaustive: never = payload;
      throw new Error(`Unknown check format: ${String(exhaustive)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Mark + contest
// ---------------------------------------------------------------------------

interface MarkPanelProps {
  attempt: AttemptMarkDTO;
  contestState: ContestState;
  contestReason: string;
  contestError: string | null;
  onContestReasonChange: (value: string) => void;
  onOpenContest: () => void;
  onSubmitContest: () => void;
}

function MarkPanel({
  attempt,
  contestState,
  contestReason,
  contestError,
  onContestReasonChange,
  onOpenContest,
  onSubmitContest,
}: MarkPanelProps) {
  const isRewrite = attempt.gradedBy === "MODEL";
  const correctnessLabel =
    attempt.correct === true
      ? "Correct"
      : attempt.correct === false
        ? "Not quite"
        : "Graded";

  const isCorrect = attempt.correct === true;

  return (
    <div
      aria-live="polite"
      className={
        isCorrect
          ? "rounded-xl border border-level-4/40 bg-level-4/10 p-4"
          : "rounded-xl border border-line bg-canvas p-4"
      }
    >
      <p className="flex items-center font-semibold text-ink">
        {isCorrect && (
          <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-level-4 text-white">
            <Check size={14} strokeWidth={3} aria-hidden="true" />
          </span>
        )}
        {/* Correctness conveyed in TEXT, not only colour. */}
        {correctnessLabel}
        {!isRewrite && (
          <span className="ml-2 font-normal text-muted">
            Score: {Math.round(attempt.score * 100)}%
          </span>
        )}
      </p>
      {attempt.detail && <DetailLines detail={attempt.detail} />}

      {/* CONTEST AFFORDANCE — visible only once a mark exists. */}
      {contestState === "idle" && (
        <Button size="sm" variant="light" className="mt-3" onPress={onOpenContest}>
          This grading looks wrong
        </Button>
      )}

      {contestState === "composing" && (
        <div className="mt-3 space-y-2">
          <Textarea
            aria-label="Why does this grading look wrong?"
            placeholder="Tell us what seems off about this mark…"
            value={contestReason}
            onValueChange={onContestReasonChange}
            minRows={2}
          />
          {contestError && (
            <p className="text-sm text-copper" role="alert">
              {contestError}
            </p>
          )}
          <Button
            size="sm"
            color="warning"
            isDisabled={contestReason.trim().length < 10}
            onPress={onSubmitContest}
          >
            Submit contest
          </Button>
        </div>
      )}

      {contestState === "submitting" && (
        <div className="mt-3">
          <Spinner size="sm" />
        </div>
      )}

      {contestState === "confirmed" && (
        <p className="mt-3 text-sm text-true-blue">
          {/*
            The mark stands; the contest is a flag — 21-15 reverses the
            contribution immediately, it does not re-grade or re-submit, and
            a student who is not told this will think nothing happened.
          */}
          Noted. This answer&apos;s contribution to my mastery score has
          been reversed while it&apos;s reviewed. My mark above is
          unchanged.
        </p>
      )}
    </div>
  );
}

/**
 * K2: the grade detail is one line per part ("Why it works: …",
 * "Technique: …"). A known label is set in bold; anything else (older
 * single-line details) renders as plain text, unchanged.
 */
const DETAIL_LABELS = ["What my pick missed", "What your pick missed", "Why it works", "Technique"] as const;

function DetailLines({ detail }: { detail: string }) {
  const lines = detail.split("\n").filter((line) => line.trim().length > 0);
  return (
    <div className="mt-2 space-y-1.5 text-sm leading-6 text-ink">
      {lines.map((line, i) => {
        const matched = DETAIL_LABELS.find((l) => line.startsWith(`${l}: `));
        if (!matched) return <p key={i}>{line}</p>;
        const label = matched === "What your pick missed" ? "What my pick missed" : matched;
        return (
          <p key={i}>
            <span className="font-semibold text-ink">{label}:</span>{" "}
            {line.slice(matched.length + 2)}
          </p>
        );
      })}
    </div>
  );
}

/**
 * Re-exported so a verifier (or a future caller) can assert the card's
 * format coverage iterates this list rather than a hardcoded one — a fifth
 * format added to CHECK_FORMATS later must fail here until this file
 * branches on it too.
 */
export { CHECK_FORMATS };
