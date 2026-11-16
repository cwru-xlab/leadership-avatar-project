/**
 * The interviewer picker's facets, its two orders, and the sections the
 * Suggested order groups the grid into.
 *
 * Pure functions, no React — the step owns the state, this file owns the rules,
 * so "does a Voice filter hide the faculty?" is answerable by reading one file.
 *
 * THREE RULES WORTH REMEMBERING:
 *
 * 1. ABSENT IS NOT A VALUE. `gender` and `language` are joined from HeyGen's
 *    preset voice catalog, which knows nothing about the account's five custom
 *    faculty avatars. An option missing a facet value therefore stays VISIBLE
 *    under that facet's filter, because hiding a face is a stronger claim than
 *    the data supports.
 *
 *    Today only `language` actually exercises this: the faculty's voice
 *    genders are curated in `FACULTY_VOICE_GENDER`, so every face now carries
 *    a gender and the Voice filter is exact. The rule is still load-bearing —
 *    a faculty avatar added without an entry in that map lands here, and
 *    `alwaysVisibleNote` is computed from live data so the caveat reappears by
 *    itself rather than needing a code change.
 *
 * 2. A ONE-VALUE FACET IS WORSE THAN NO FACET. The distribution is measured at
 *    runtime, not assumed: `availableFacets` drops any facet whose live data
 *    holds fewer than two distinct values. Today that silently removes the
 *    language facet — every preset voice on this account reads `"en"` — and
 *    will restore it by itself the day a second language ships. No code change,
 *    no stale dropdown offering a student one choice.
 *
 * 3. `plays` IS GROUPING, NOT A FILTER. Measured on the live catalog, 41 of 49
 *    stock faces are `general` and the remaining 8 split four ways (3 HR, 2
 *    technical, 2 coaching, 1 legal). A dropdown over that distribution is one
 *    useful option and four that return a handful each. As SECTIONS in the
 *    default order it reads as a table of contents instead: the student sees
 *    the professional looks without having to go hunting for them, and the long
 *    `general` tail is honestly labelled rather than hidden behind a choice.
 *    Grouping is also why there is no "faculty vs stock" filter — the faculty
 *    are the leading section.
 */

/**
 * The shape this file needs, declared structurally rather than imported.
 *
 * `InterviewerStep` owns the client-side `InterviewerOption` and imports these
 * functions, so importing its type back here would be a cycle. It also keeps
 * the rules honest: nothing in here can reach for a field it has not declared.
 *
 * `faculty` is optional only because `PracticeTypePage` synthesises an option
 * for the elevator pitch's server-cast listener, which never reaches this
 * picker. Absent is read as "not faculty", never as "unknown".
 */
export interface FacetedInterviewer {
  name: string;
  gender?: string;
  language?: string;
  plays?: string;
  faculty?: boolean;
}

/** Facets that get a toolbar control. `plays` is grouping; see rule 3. */
export type FacetId = "gender" | "language";

export type SortId = "suggested" | "name";

/** One student choice per facet; `null` is "no filter on this facet". */
export interface InterviewerFilters {
  /** Free text, matched against the name only. */
  query: string;
  gender: string | null;
  language: string | null;
}

export const EMPTY_FILTERS: InterviewerFilters = {
  query: "",
  gender: null,
  language: null,
};

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

export interface Facet {
  id: FacetId;
  /**
   * The control's label. It names the SOURCE of the value, not a claim about
   * the person: "Voice", never "Gender" — the value is the gender HeyGen
   * recorded for the voice paired with that face, and a student reading
   * "Gender" would take it as a statement about a human being.
   */
  label: string;
  /** Placeholder for the unfiltered state, e.g. "Any voice". */
  anyLabel: string;
  options: FacetOption[];
  /**
   * Set when some options carry no value for this facet and so can never be
   * excluded by it. The toolbar says this out loud instead of letting a
   * student wonder why five faces survive every filter.
   */
  alwaysVisibleNote: string | null;
}

const GENDER_LABELS: Record<string, string> = {
  female: "Female voice",
  male: "Male voice",
};

/** Vendor ships a code; label it without pretending we know more than that. */
function languageLabel(code: string): string {
  return code.toLowerCase() === "en" ? "English" : code;
}

/** The facet value an option carries, or undefined when nothing was supplied. */
function facetValue(
  option: FacetedInterviewer,
  facet: FacetId,
): string | undefined {
  return facet === "gender" ? option.gender : option.language;
}

/** Minimum distinct values before a dropdown earns its place in the toolbar. */
const MIN_DISTINCT_VALUES = 2;

/**
 * The facets today's data can actually support, in toolbar order.
 *
 * Counts come from the fetched catalog so an option count never disagrees with
 * what the grid shows, and a facet with one value drops out entirely (rule 2).
 */
export function availableFacets(
  interviewers: readonly FacetedInterviewer[],
): Facet[] {
  const specs: Array<{
    id: FacetId;
    label: string;
    anyLabel: string;
    labelFor: (value: string) => string;
    /**
     * Says WHY some faces carry no value, in that facet's own words. A generic
     * "5 faces have no voice on record" would be wrong twice over: every face
     * has a voice, and what is missing is the gender HeyGen recorded for it.
     */
    noteFor: (absent: number) => string;
    /** Sorted first by this, then by count, so option order is stable. */
    order?: readonly string[];
  }> = [
    {
      id: "gender",
      label: "Voice",
      anyLabel: "Any voice",
      labelFor: (v) => GENDER_LABELS[v] ?? v,
      noteFor: (n) =>
        `${n} ${n === 1 ? "face uses a custom voice" : "faces use custom voices"} with no gender on record, so ${n === 1 ? "it stays" : "they stay"} listed under either choice.`,
      order: ["female", "male"],
    },
    {
      id: "language",
      label: "Language",
      anyLabel: "Any language",
      labelFor: languageLabel,
      noteFor: (n) =>
        `${n} ${n === 1 ? "face has" : "faces have"} no language on record, so ${n === 1 ? "it stays" : "they stay"} listed under any choice.`,
    },
  ];

  const facets: Facet[] = [];
  for (const spec of specs) {
    const counts = new Map<string, number>();
    let absent = 0;
    for (const option of interviewers) {
      const value = facetValue(option, spec.id);
      if (value === undefined) absent += 1;
      else counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    if (counts.size < MIN_DISTINCT_VALUES) continue;

    const options = [...counts.entries()]
      .map(([value, count]) => ({ value, label: spec.labelFor(value), count }))
      .sort((a, b) => {
        const order = spec.order;
        if (order) {
          const ai = order.indexOf(a.value);
          const bi = order.indexOf(b.value);
          if (ai !== bi) {
            return (
              (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi)
            );
          }
        }
        return b.count - a.count || a.label.localeCompare(b.label);
      });

    facets.push({
      id: spec.id,
      label: spec.label,
      anyLabel: spec.anyLabel,
      options,
      alwaysVisibleNote: absent > 0 ? spec.noteFor(absent) : null,
    });
  }
  return facets;
}

function matchesFacet(
  option: FacetedInterviewer,
  facet: FacetId,
  chosen: string | null,
): boolean {
  if (!chosen) return true;
  const value = facetValue(option, facet);
  // Rule 1: nothing on record means this filter has no opinion about it.
  if (value === undefined) return true;
  return value === chosen;
}

/** Apply the student's choices. Order is the caller's job (`sortInterviewers`). */
export function filterInterviewers<T extends FacetedInterviewer>(
  interviewers: readonly T[],
  filters: InterviewerFilters,
): T[] {
  const query = filters.query.trim().toLowerCase();
  return interviewers.filter((option) => {
    if (query && !option.name.toLowerCase().includes(query)) return false;
    return (
      matchesFacet(option, "gender", filters.gender) &&
      matchesFacet(option, "language", filters.language)
    );
  });
}

/**
 * The two orders on offer.
 *
 * `suggested` reproduces today's list exactly: the `suggest`-ed face, then the
 * faculty, then catalog order — the merge in `lib/interview/avatar-catalog.ts`
 * already puts the account's own avatars first, so "faculty then catalog" is
 * not a re-sort, it is the order the route returns. `groupInterviewers` then
 * cuts that order into sections without reordering within them.
 *
 * The suggested face is PINNED to the front of both orders, not sorted into
 * them. It is a recommendation the step promises to list first (networking
 * matches a face to the person picked on step 1), so letting the alphabet bury
 * it under "Alessandra" would break that promise for an ordering preference.
 *
 * No "practiced with before" order: that needs an attempts query this step
 * does not make.
 */
export function sortInterviewers<T extends FacetedInterviewer>(
  interviewers: readonly T[],
  sort: SortId,
  suggested: T | undefined,
): T[] {
  const rest = interviewers.filter((option) => option !== suggested);
  const ordered =
    sort === "name"
      ? [...rest].sort((a, b) =>
          a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
        )
      : [...rest].sort(
          (a, b) => Number(Boolean(b.faculty)) - Number(Boolean(a.faculty)),
        );
  const pinned = suggested && interviewers.includes(suggested) ? [suggested] : [];
  return [...pinned, ...ordered];
}

export interface InterviewerSection<T> {
  id: string;
  /** Sentence case, no count — the count is rendered beside it. */
  label: string;
  members: T[];
}

/**
 * Section order for the Suggested view: the faculty first because they are the
 * reason the roster exists, then the professional looks in the order a student
 * is most likely to want them, then the long `general` tail.
 *
 * Note the faculty section is keyed off `faculty`, NOT off a `plays` value.
 * The five instructors deliberately carry no `plays` (see the field's comment
 * in `lib/interview/avatar-catalog.ts`), so a `plays`-only grouping would drop
 * them into an "everything else" bucket — the opposite of the point.
 */
const SECTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "faculty", label: "Weatherhead faculty" },
  { id: "hr", label: "Hiring and HR" },
  { id: "legal", label: "Legal" },
  { id: "technical", label: "Technical" },
  { id: "coaching", label: "Coaching" },
  { id: "general", label: "General business" },
];

/**
 * Cut an already-ordered list into the sections above, preserving the incoming
 * order inside each one.
 *
 * Only for the Suggested order — Name A–Z returns a single flat grid, because
 * sections and one alphabet are mutually exclusive ways to find a face, and
 * showing both would be an alphabet restarting six times.
 *
 * THE SUGGESTED FACE GETS ITS OWN LEADING SECTION when the caller supplies one
 * (networking matches a face to the person picked on step 1). The step promises
 * that face is listed FIRST, and dropping it into whichever section its
 * wardrobe belongs to would bury it four headings down. One card under its own
 * heading keeps the promise and explains itself.
 *
 * Empty sections are dropped, so filtering down to two faces shows two
 * headings rather than six, four of them empty. A face whose `plays` is not a
 * known section id falls into `general` rather than vanishing — the same churn
 * contract the roster file keeps.
 */
export function groupInterviewers<T extends FacetedInterviewer>(
  ordered: readonly T[],
  suggested?: T,
): InterviewerSection<T>[] {
  const pinned = suggested && ordered.includes(suggested) ? suggested : undefined;
  const buckets = new Map<string, T[]>(SECTIONS.map((s) => [s.id, []]));
  for (const option of ordered) {
    if (option === pinned) continue;
    const id = option.faculty
      ? "faculty"
      : option.plays && buckets.has(option.plays)
        ? option.plays
        : "general";
    buckets.get(id)!.push(option);
  }
  const sections: InterviewerSection<T>[] = pinned
    ? [{ id: "suggested", label: "Suggested for you", members: [pinned] }]
    : [];
  for (const section of SECTIONS) {
    const members = buckets.get(section.id)!;
    if (members.length) {
      sections.push({ id: section.id, label: section.label, members });
    }
  }
  return sections;
}
