/**
 * Student-facing report titles for My Reports.
 *
 * `title` on InteractionReport is optional for back-compat, and most stored
 * values are machine defaults rather than something a student typed. List and
 * detail UIs call `displayReportTitle`, which keeps a student's own title and
 * otherwise derives a short, specific one from the snapshot at display time,
 * so old rows benefit without being rewritten. `disambiguateTitles` adds the
 * date, then the time, only where a list holds identical titles.
 *
 * Deliberate omission: `interviewerPersona` is never part of a title. It can
 * be a distilled description of a real person (see ReportCustomizationStrip);
 * the interviewer's name is the only persona fact shown.
 */

import type { InputSnapshot } from "@/lib/report/snapshot";
import { getDeckMode } from "@/lib/pitch/deck-modes";
import { CURATED_INDUSTRIES, CURATED_ROLES } from "@/lib/interview/customization-options";

const TYPE_LABELS: Record<string, string> = {
  general: "General interview",
  technical: "Engineering behavioral interview",
  "technical-coding": "Technical coding interview",
  consulting: "Consulting interview",
  "early-career": "Early-career interview",
  "product-management": "Product management interview",
  "data-analytics": "Data / product analytics interview",
  finance: "Finance interview",
  "system-design": "System design interview",
  "case-study": "Case study",
  "pitch-elevator": "Elevator pitch",
  // "pitch-deck" is deliberately NOT a literal here anymore — its title now
  // resolves through the deck-mode table below like the four new modes, so
  // all five deck modes share one source of truth for their title (the
  // investor deck's title text is unchanged: DECK_MODES["pitch-deck"].cardTitle
  // reproduces "Investor pitch deck").
  "difficult-conversation": "Courageous conversation",
  networking: "Networking",
  "clinical-communication": "Clinical communication",
  "motivational-interviewing": "Motivational interviewing",
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
    case "technical-coding":
      return truncate(input.assignment.title);
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

/** Every display title fits this many words, disambiguating date included. */
export const TITLE_WORD_BUDGET = 8;

const DANGLING_WORD = /^(a|an|and|at|by|for|from|in|of|on|or|the|to|with|your|my)$/i;

function titleWords(text: string): string[] {
  return text.split(/\s+/).filter((word) => word && word !== "·");
}

/** Cut to `max` words on a word boundary, never ending on "for" or "and". */
export function clampTitleWords(text: string, max = TITLE_WORD_BUDGET): string {
  const clean = text.trim().replace(/\s+/g, " ").replace(/…$/, "");
  const words = clean.split(" ");
  if (titleWords(clean).length <= max) return clean;
  const kept = words.slice(0, max);
  while (kept.length > 1 && (DANGLING_WORD.test(kept[kept.length - 1]!) || kept[kept.length - 1] === "·")) {
    kept.pop();
  }
  return `${kept.join(" ").replace(/[,;:·\s]+$/, "")}…`;
}

// Each interview type's default role and industry say nothing the type label
// doesn't, so they never earn a place in a title.
const UNSPECIFIC_INTERVIEW_TARGETS = new Set([
  "an early-career professional role",
  "a software engineering role",
  "a management consulting associate role",
  "an internship or entry-level rotational role",
  "a product manager role",
  "a data scientist (product analytics) role",
  "an investment banking analyst role",
  "general / cross-industry",
  "technology",
  "management consulting",
]);

function interviewTarget(roleTitle: string | null, industry: string | null): string | null {
  for (const [raw, options] of [
    [roleTitle, CURATED_ROLES],
    [industry, CURATED_INDUSTRIES],
  ] as const) {
    const value = raw?.trim();
    if (!value || UNSPECIFIC_INTERVIEW_TARGETS.has(value.toLowerCase())) continue;
    const curated = options.find((option) => option.promptValue === value);
    // Curated labels pair synonyms ("Team lead / people manager"); the first reads best.
    return curated
      ? curated.label.split(" / ")[0]!
      : value.replace(/^(an?|the)\s+/i, "").replace(/\s+role$/i, "");
  }
  return null;
}

/** "Finance interview with Karen Liu"; the type label is the fallback subject. */
function deriveInterviewTitle(typeSlug: string, input: InputSnapshot | null): string {
  const type = typeLabelForReport(typeSlug);
  if (input?.kind !== "interview") return type;
  const target = interviewTarget(input.roleTitle, input.industry);
  const name = input.interviewerName?.trim();
  const lead = target ? `${target} interview` : type;
  if (!name) return clampTitleWords(lead);
  const suffix = ` with ${name}`;
  return `${clampTitleWords(lead, TITLE_WORD_BUDGET - titleWords(suffix).length)}${suffix}`;
}

/** The coding exercise's public title. The snapshot check doesn't type `assignment` deeply. */
function codingExerciseTitle(input: Extract<InputSnapshot, { kind: "technical-coding" }>): string | null {
  const title = input.assignment?.title;
  return typeof title === "string" && title.trim() ? title.trim() : null;
}

/** A short title from what the session was about. No date: see `disambiguateTitles`. */
export function deriveReportTitle(typeSlug: string, input: InputSnapshot | null): string {
  const type = typeLabelForReport(typeSlug);
  switch (input?.kind) {
    case "scenario":
      return clampTitleWords(input.caseName?.trim() || type);
    case "pitch": {
      if (input.pitchKind === "deck") {
        return input.slideCount ? `${type} · ${input.slideCount} slides` : type;
      }
      const subject = input.pitchSubject?.trim().replace(/^(an?|the)\s+/i, "");
      return clampTitleWords(subject ? `${type}: ${subject}` : type);
    }
    case "difficult-conversation":
      return clampTitleWords(input.conversationTitle?.trim() || type);
    case "technical-coding":
      return clampTitleWords(codingExerciseTitle(input) || type);
    case "networking": {
      const name = input.displayName?.trim();
      if (name) return clampTitleWords(`Networking with ${name}`);
      return clampTitleWords(input.goal?.trim() ? `Networking: ${input.goal.trim()}` : "Networking practice");
    }
    default:
      return deriveInterviewTitle(typeSlug, input);
  }
}

// A stored default ends in a timestamp the server formatted, e.g. "Oct 9, 2026, 2:30 PM".
const STORED_WHEN = /\s*·\s*[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}\s?[AP]M$/;

/**
 * True when a stored title is a machine default rather than the student's own
 * words. Conservative on purpose: anything that doesn't exactly fit a known
 * default shape stays, so an edited title is never replaced.
 */
function isMachineTitle(title: string, typeSlug: string, input: InputSnapshot | null): boolean {
  const bare = title.replace(STORED_WHEN, "").trim();
  const type = typeLabelForReport(typeSlug);
  if ([type, "Practice interview", "Networking practice"].includes(bare)) return true;

  const separator = bare.indexOf(" · ");
  if (separator < 0) return false;
  const lead = bare.slice(0, separator);
  const tail = bare.slice(separator + 3).replace(/…$/, "").trim();
  const leadIsType = lead === type || lead === "Interview" || lead === "Networking";
  if (getDeckMode(typeSlug) && /pitch/i.test(lead) && /^\d+ slides$/.test(tail)) return true;
  if (!leadIsType || !tail) return false;

  const sources: Array<string | null | undefined> = [];
  switch (input?.kind) {
    case "interview":
      sources.push(input.roleTitle);
      if (input.interviewerName) sources.push(`with ${input.interviewerName}`);
      break;
    case "scenario":
      sources.push(input.caseName);
      break;
    case "pitch":
      sources.push(input.pitchSubject);
      break;
    case "difficult-conversation":
      sources.push(input.conversationTitle);
      break;
    case "networking":
      sources.push(input.goal);
      if (input.displayName) sources.push(`with ${input.displayName}`);
      break;
    case "technical-coding":
      sources.push(codingExerciseTitle(input));
      break;
  }
  return sources.some((source) => source?.trim().replace(/\s+/g, " ").startsWith(tail));
}

/**
 * The title every surface shows: the student's own if they wrote one, else a
 * short one derived from the snapshot. `when` no longer affects the result; it
 * stays in the signature so a list can pass the row through `disambiguateTitles`.
 */
export function displayReportTitle(opts: {
  title: string | null | undefined;
  typeSlug: string;
  input: InputSnapshot | null;
  when?: string | Date;
}): string {
  const saved = opts.title?.trim();
  if (saved && !isMachineTitle(saved, opts.typeSlug, opts.input)) return saved;
  return deriveReportTitle(opts.typeSlug, opts.input);
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function formatTitleDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
  });
}

function formatTitleTime(d: Date, seconds: boolean): string {
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}),
  });
}

/**
 * Makes a list's titles unique, for reports and study plans alike. A title used
 * once is untouched. Identical ones gain the date, or the time when two fall on
 * the same day, with the base shortened to stay within the budget. A surface
 * whose rows don't always state the date passes `sameDay: "date-time"`.
 * Runs in the browser, so dates are the student's local dates.
 */
export function disambiguateTitles<T extends { id: string; title: string; when: string | Date }>(
  items: readonly T[],
  { sameDay = "time" }: { sameDay?: "time" | "date-time" } = {},
): Map<string, string> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.title.trim().toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const out = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.set(group[0]!.id, group[0]!.title);
      continue;
    }
    const dates = group.map((item) => new Date(item.when));
    const days = dates.map(dayKey);
    const minutes = dates.map((d) => Math.floor(d.getTime() / 60_000));
    const count = <V,>(values: V[], value: V) => values.filter((other) => other === value).length;
    // The same clock time can recur on two days of one group; only then does
    // a time-only suffix need its date back.
    const clocks = dates.map((d) => formatTitleTime(d, false));
    group.forEach((item, index) => {
      const d = dates[index]!;
      const sharesDay = count(days, days[index]) > 1;
      const time = formatTitleTime(d, count(minutes, minutes[index]) > 1);
      const timeIsEnough = sameDay === "time" && count(clocks, clocks[index]) === count(minutes, minutes[index]);
      const suffix = !sharesDay
        ? formatTitleDate(d)
        : timeIsEnough
          ? time
          : `${formatTitleDate(d)}, ${time}`;
      const base = clampTitleWords(item.title, TITLE_WORD_BUDGET - titleWords(suffix).length);
      out.set(item.id, `${base} · ${suffix}`);
    });
  }
  return out;
}

/** Clamp and sanitize a student-supplied title. Empty → null (use default). */
export function normalizeReportTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.slice(0, 120);
}
