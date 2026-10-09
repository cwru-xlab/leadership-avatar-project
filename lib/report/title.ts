/**
 * Student-facing report titles for My Reports.
 *
 * `title` on InteractionReport is optional for back-compat. When absent,
 * list/detail UIs call `displayReportTitle` to synthesize a readable label
 * from type + snapshot + timestamp so sessions remain distinguishable.
 */

import type { InputSnapshot } from "@/lib/report/snapshot";
import { getDeckMode } from "@/lib/pitch/deck-modes";

const TYPE_LABELS: Record<string, string> = {
  general: "General interview",
  technical: "Technical interview",
  consulting: "Consulting interview",
  "early-career": "Early-career interview",
  "case-study": "Case study",
  "pitch-elevator": "Elevator pitch",
  // "pitch-deck" is deliberately NOT a literal here anymore — its title now
  // resolves through the deck-mode table below like the four new modes, so
  // all five deck modes share one source of truth for their title (the
  // investor deck's title text is unchanged: DECK_MODES["pitch-deck"].cardTitle
  // reproduces "Investor pitch deck").
  "difficult-conversation": "Difficult conversation",
  networking: "Networking",
};

/**
 * A report with an unknown title must not regress to a blank heading —
 * any deck-mode slug (19-01's `DECK_MODES` table) resolves its title from
 * the table rather than needing a fourth/fifth literal added here; every
 * other slug falls back to the existing literal map, then to a
 * title-cased default.
 */
export function typeLabelForReport(typeSlug: string): string {
  const deckMode = getDeckMode(typeSlug);
  if (deckMode) return deckMode.cardTitle;

  return (
    TYPE_LABELS[typeSlug] ??
    typeSlug
      .split(/[-_]/)
      .filter(Boolean)
      .map((word) => word[0]!.toUpperCase() + word.slice(1))
      .join(" ")
  );
}

/** Compact date+time for list cards and default titles. */
export function formatReportWhen(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function truncate(text: string, max = 48): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function subjectFromSnapshot(input: InputSnapshot | null): string | null {
  if (!input) return null;
  switch (input.kind) {
    case "interview":
      return input.interviewerName
        ? `with ${input.interviewerName}`
        : input.roleTitle
          ? truncate(input.roleTitle)
          : null;
    case "scenario":
      return input.caseName ? truncate(input.caseName) : null;
    case "pitch":
      return input.pitchSubject ? truncate(input.pitchSubject) : null;
    case "difficult-conversation":
      return input.conversationTitle
        ? truncate(input.conversationTitle)
        : null;
    case "networking":
      if (input.displayName) return `with ${truncate(input.displayName)}`;
      if (input.goal) return truncate(input.goal);
      return null;
    default:
      return null;
  }
}

/**
 * Build a default title when the student does not supply one at finish.
 * Always includes type + when so two otherwise-identical sessions differ.
 */
export function buildDefaultReportTitle(opts: {
  typeSlug: string;
  input: InputSnapshot | null;
  when?: Date | string;
}): string {
  const type = typeLabelForReport(opts.typeSlug);
  const subject = subjectFromSnapshot(opts.input);
  const when = formatReportWhen(opts.when ?? new Date());
  return subject ? `${type} · ${subject} · ${when}` : `${type} · ${when}`;
}

/** Prefer persisted title; fall back to a synthesized label. */
export function displayReportTitle(opts: {
  title: string | null | undefined;
  typeSlug: string;
  input: InputSnapshot | null;
  when: string | Date;
}): string {
  const saved = opts.title?.trim();
  if (saved) return saved;
  return buildDefaultReportTitle({
    typeSlug: opts.typeSlug,
    input: opts.input,
    when: opts.when,
  });
}

/** Clamp and sanitize a student-supplied title. Empty → null (use default). */
export function normalizeReportTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.slice(0, 120);
}
