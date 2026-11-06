"use client";

/**
 * The check-in above the score panel: one question per flagged visual
 * observation, asked of the student whose report it is.
 *
 * Rules (see `lib/report/check-in.ts`, which owns every word asked here):
 * - It never blocks the report. It is a card in the page flow, not a dialog,
 *   and skipping a question costs nothing.
 * - One question at a time while any is unanswered. Once all are answered it
 *   collapses to one "Thanks" line plus any fixed coaching lines from "Yes";
 *   "Change answers" reopens every question as a stacked list.
 * - An answer never changes a score. The banner says so once, in muted text.
 * - "Something else" saves nothing by itself; it reveals that flag's options,
 *   and picking one saves.
 */
import { useId, useRef, useState } from "react";
import clsx from "clsx";
import { CircleCheck, MessageCircleQuestion } from "lucide-react";

import {
  CHECK_IN_ANSWER_LABELS,
  CHECK_IN_ANSWERS,
  checkInCoaching,
  type CheckInAnswer,
  type CheckInLead,
  type CheckInAnswers,
  type CheckInQuestion,
} from "@/lib/report/check-in";

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-true-blue";

const LINK_BUTTON = clsx(
  "min-h-11 w-fit rounded-sm text-sm font-semibold text-link hover:underline disabled:opacity-60",
  FOCUS_RING,
);

interface CheckInBannerProps {
  reportId: string;
  questions: CheckInQuestion[];
  answers: CheckInAnswers;
  onAnswersChange: (answers: CheckInAnswers) => void;
  /** The practice type's coaching opener, e.g. "In a real interview". */
  lead?: CheckInLead;
}

export default function CheckInBanner({ reportId, questions, answers, onAnswersChange, lead }: CheckInBannerProps) {
  const headingId = useId();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [current, setCurrent] = useState(() => firstUnanswered(questions, answers, 0) ?? 0);
  const questionRefs = useRef(new Map<string, HTMLElement>());
  const thanksRef = useRef<HTMLParagraphElement>(null);

  const allAnswered = questions.every((question) => answers[question.id]);
  const coaching = checkInCoaching(answers, lead);

  async function save(question: CheckInQuestion, answer: CheckInAnswer, reason?: string) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/practice/report/${encodeURIComponent(reportId)}/check-in`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flag: question.id, answer, ...(reason ? { reason } : {}) }),
      });
      const data = (await response.json().catch(() => ({}))) as { checkIn?: CheckInAnswers; error?: string };
      if (!response.ok || !data.checkIn) {
        setError(data.error ?? "Your answer couldn't be saved. Please try again.");
        return;
      }
      onAnswersChange(data.checkIn);
      setStatus("Answer saved.");
      if (reviewing) return;
      const next = firstUnanswered(questions, data.checkIn, questions.indexOf(question) + 1);
      if (next === null) {
        // Collapsed: hand focus to the thanks line so a keyboard user isn't dropped.
        requestAnimationFrame(() => thanksRef.current?.focus());
      } else {
        setCurrent(next);
        requestAnimationFrame(() => questionRefs.current.get(questions[next].id)?.focus());
      }
    } catch {
      setError("Your answer couldn't be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const register = (id: string) => (element: HTMLElement | null) => {
    if (element) questionRefs.current.set(id, element);
    else questionRefs.current.delete(id);
  };

  const live = (
    <>
      <p aria-live="polite" className="sr-only" role="status">
        {status}
      </p>
      {error && (
        <p className="text-sm text-copper-deep" role="alert">
          {error}
        </p>
      )}
    </>
  );

  if (allAnswered) {
    return (
      <section
        aria-labelledby={headingId}
        className="flex flex-col gap-3 rounded-xl border border-line bg-white px-5 py-3 md:px-6"
        data-testid="check-in"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <h2 className="sr-only" id={headingId}>
            Check-in on what the camera saw
          </h2>
          <p
            ref={thanksRef}
            className="flex min-w-[14rem] flex-1 items-start gap-2 text-sm leading-[1.45] text-ink outline-none"
            tabIndex={-1}
          >
            <CircleCheck aria-hidden className="mt-px shrink-0 text-level-4" size={18} strokeWidth={1.75} />
            <span>
              <span className="font-semibold">Thanks for checking in.</span>{" "}
              <span className="text-muted">Your answers never change your scores.</span>
            </span>
          </p>
          <button
            aria-expanded={reviewing}
            className={LINK_BUTTON}
            type="button"
            onClick={() => setReviewing((value) => !value)}
          >
            {reviewing ? "Done" : "Change answers"}
          </button>
        </div>

        {coaching.length > 0 && (
          <ul aria-label="Tips from your check-in" className="flex flex-col gap-1.5 pl-[26px]">
            {coaching.map((line) => (
              <li key={line} className="max-w-[65ch] text-sm leading-[1.5] text-ink">
                {line}
              </li>
            ))}
          </ul>
        )}

        {reviewing && (
          <ol className="flex flex-col divide-y divide-line border-t border-line">
            {questions.map((question) => (
              <li key={question.id} className="flex flex-col gap-3 py-4">
                <QuestionBlock
                  answers={answers}
                  disabled={saving}
                  question={question}
                  questionRef={register(question.id)}
                  onSave={save}
                />
              </li>
            ))}
          </ol>
        )}
        {live}
      </section>
    );
  }

  const question = questions[Math.min(current, questions.length - 1)];
  const index = questions.indexOf(question);

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-xl border border-line bg-white px-5 py-4 md:px-6"
      data-testid="check-in"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-cwru-blue" id={headingId}>
          <MessageCircleQuestion aria-hidden size={18} strokeWidth={1.75} />
          Quick check-in
        </h2>
        {questions.length > 1 && (
          <span className="text-[13px] tabular-nums text-muted">
            Question {index + 1} of {questions.length}
          </span>
        )}
      </div>

      <QuestionBlock
        key={question.id}
        answers={answers}
        disabled={saving}
        question={question}
        questionRef={register(question.id)}
        onSave={save}
      />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-[13px] text-muted">The camera sees motion, not reasons. Your answer never changes your scores.</p>
        {questions.length > 1 && (
          <div className="flex items-center gap-4">
            {index > 0 && (
              <button className={LINK_BUTTON} type="button" onClick={() => setCurrent(index - 1)}>
                Previous
              </button>
            )}
            {index < questions.length - 1 && (
              <button className={LINK_BUTTON} type="button" onClick={() => setCurrent(index + 1)}>
                {answers[question.id] ? "Next" : "Skip"}
              </button>
            )}
          </div>
        )}
      </div>
      {live}
    </section>
  );
}

/** One question, its three answers and, after "Something else", that flag's options. */
function QuestionBlock({
  question,
  answers,
  disabled,
  questionRef,
  onSave,
}: {
  question: CheckInQuestion;
  answers: CheckInAnswers;
  disabled: boolean;
  questionRef: (element: HTMLElement | null) => void;
  onSave: (question: CheckInQuestion, answer: CheckInAnswer, reason?: string) => void;
}) {
  const questionId = useId();
  const optionsLabelId = useId();
  const saved = answers[question.id];
  const [otherOpen, setOtherOpen] = useState(saved?.answer === "other");
  const chosen: CheckInAnswer | null = otherOpen ? "other" : (saved?.answer ?? null);

  return (
    <div className="flex flex-col gap-3">
      <p
        ref={questionRef}
        className="max-w-[65ch] text-[15px] leading-[1.55] text-ink outline-none"
        id={questionId}
        tabIndex={-1}
      >
        {question.question}
      </p>

      <div aria-labelledby={questionId} className="flex flex-wrap gap-2" role="group">
        {CHECK_IN_ANSWERS.map((answer) => (
          <ChoiceButton
            key={answer}
            disabled={disabled}
            pressed={chosen === answer}
            onClick={() => {
              if (answer === "other") {
                setOtherOpen(true);
                return;
              }
              setOtherOpen(false);
              onSave(question, answer);
            }}
          >
            {CHECK_IN_ANSWER_LABELS[answer]}
          </ChoiceButton>
        ))}
      </div>

      {otherOpen && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-semibold text-muted" id={optionsLabelId}>
            What was it?
          </p>
          <div aria-labelledby={optionsLabelId} className="flex flex-wrap gap-2" role="group">
            {question.otherOptions.map((option) => (
              <ChoiceButton
                key={option.id}
                compact
                disabled={disabled}
                pressed={saved?.answer === "other" && saved.reason === option.id}
                onClick={() => onSave(question, "other", option.id)}
              >
                {option.label}
              </ChoiceButton>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChoiceButton({
  pressed,
  disabled,
  compact = false,
  onClick,
  children,
}: {
  pressed: boolean;
  disabled: boolean;
  compact?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-pressed={pressed}
      className={clsx(
        "min-h-11 rounded-lg border text-sm transition-colors duration-150 ease-out aria-disabled:cursor-wait aria-disabled:opacity-60",
        compact ? "px-3 font-medium" : "min-w-[5.5rem] px-4 font-semibold",
        pressed
          ? "border-true-blue bg-light-blue/32 text-cwru-blue shadow-[inset_0_0_0_1px_var(--la-true-blue)]"
          : "border-line bg-white text-ink hover:bg-canvas",
        FOCUS_RING,
      )}
      // aria-disabled, not disabled: a disabled button drops keyboard focus
      // mid-save, and the review list keeps focus where the student is.
      aria-disabled={disabled || undefined}
      type="button"
      onClick={() => {
        if (!disabled) onClick();
      }}
    >
      {children}
    </button>
  );
}

function firstUnanswered(questions: CheckInQuestion[], answers: CheckInAnswers, from: number): number | null {
  for (let offset = 0; offset < questions.length; offset += 1) {
    const i = (from + offset) % questions.length;
    if (!answers[questions[i].id]) return i;
  }
  return null;
}
