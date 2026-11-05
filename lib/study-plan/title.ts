/**
 * Display titles for study plans.
 *
 * Generated titles used to read alike ("Self-Paced Study Plan: Building on
 * Solid Interview Foundations"). Saved plans are immutable snapshots, so the
 * stored row is never rewritten: this derives the title at display time. A
 * stored title survives only once its filler is gone and it still names
 * something; otherwise the plan's top priority themes name it. Dates are added
 * per list by `disambiguateTitles`, in the browser, so they use local time.
 */
import { clampTitleWords, disambiguateTitles, TITLE_WORD_BUDGET } from "@/lib/report/title";

// Words that describe every plan and so distinguish none. Compared lowercase.
const FILLER = new Set(
  (
    "self-paced self paced study plan plans practice interview interviews interviewing skill skills " +
    "technique techniques foundation foundations foundational building build strengthening strengthen " +
    "strong solid steady early review improving improve improvement enhancing enhancement enhanced " +
    "leveraging leverage strengths growing growth demonstrating developing development consistent " +
    "consistently more response responses behavioral on and the a an of for in to through with your"
  ).split(" "),
);

const LEADING_FILLER =
  /^(?:(?:building|strengthening|improving|enhancing|leveraging|growing|demonstrating|developing)(?: on)?\s+)+/i;

function distinctiveWords(text: string): string[] {
  return text
    .split(/[\s,:&/]+/)
    .map((word) => word.toLowerCase().replace(/[^a-z-]/g, ""))
    .filter((word) => word && !FILLER.has(word));
}

function capitalize(text: string): string {
  return text ? text[0]!.toUpperCase() + text.slice(1) : text;
}

/** Reduces a stored title to what is distinct, or null when nothing is. */
function cleanStoredTitle(raw: string): string | null {
  let title = raw.trim().replace(/\s+/g, " ");
  const colon = title.indexOf(":");
  if (colon > 0 && distinctiveWords(title.slice(0, colon)).length === 0) {
    title = title.slice(colon + 1).trim();
  }
  const trimmedLead = title.replace(LEADING_FILLER, "");
  const leadWasFiller = trimmedLead !== title;
  title = capitalize(trimmedLead.replace(/\s+(?:skills|practice plan|study plan|plan)$/i, ""));

  // A whole-title filler wrapper ("Strengthening Interview Skills Through X")
  // reads as a slogan, and over-budget titles are slogans by definition.
  if (/\b(?:interview|study|practice)\b/i.test(title) && leadWasFiller) return null;
  if (title.split(" ").length > TITLE_WORD_BUDGET) return null;
  return distinctiveWords(title).length >= 2 ? title : null;
}

/** "Organization of Responses" -> "Organization"; keeps a theme's naming words. */
function shortTheme(theme: string): string {
  const words = theme
    .replace(LEADING_FILLER, "")
    .replace(/\s+(?:in|during|across|for)\s+(?:your\s+)?(?:interview\s+)?(?:responses|answers|interviews?|communication|performance)\b.*$/i, "")
    .replace(/\s+of\s+(?:responses|answers)\b.*$/i, "")
    .replace(/\s+more consistently\b.*$/i, "")
    .replace(/\binterview\s+/i, "")
    .trim();
  return capitalize(words);
}

function titleFromThemes(themes: ReadonlyArray<{ priority: number; theme: string }>): string | null {
  const top = [...themes]
    .sort((a, b) => a.priority - b.priority)
    .map((theme) => shortTheme(theme.theme))
    .filter(Boolean);
  const unique = top.filter(
    (theme, index) => top.findIndex((other) => other.toLowerCase() === theme.toLowerCase()) === index,
  );
  if (unique.length === 0) return null;
  const [first, second] = unique;
  // One word alone ("Organization") says too little; the fuller theme says it.
  if (!second && !first!.includes(" ")) return clampTitleWords(themes[0]!.theme);
  const both = second ? `${first}, ${second}` : first!;
  return both.split(" ").length <= TITLE_WORD_BUDGET ? both : clampTitleWords(first!);
}

export interface TitledPlan {
  title: string;
  priorityThemes: ReadonlyArray<{ priority: number; theme: string }>;
}

/** The title every plan surface shows, without any date. */
export function displayPlanTitle(plan: TitledPlan): string {
  return (
    cleanStoredTitle(plan.title) ?? titleFromThemes(plan.priorityThemes) ?? clampTitleWords(plan.title)
  );
}

/** Replaces each plan's `title` with its display title, unique within the list. */
export function withDisplayTitles<T extends TitledPlan & { id: string; savedAt: string }>(
  plans: readonly T[],
): T[] {
  const titles = disambiguateTitles(
    plans.map((plan) => ({ id: plan.id, title: displayPlanTitle(plan), when: plan.savedAt })),
    { sameDay: "date-time" },
  );
  return plans.map((plan) => ({ ...plan, title: titles.get(plan.id) ?? plan.title }));
}
