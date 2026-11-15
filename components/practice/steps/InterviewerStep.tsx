"use client";

/**
 * Interviewer-selection step, ported verbatim from
 * `app/interview/[type]/page.tsx`. Fetches `/api/interview/interviewers`
 * and writes the chosen avatar into setup state owned by the page.
 *
 * Customization lives on its own page before the wizard
 * (`components/interview/InterviewCustomizePage.tsx`); this step does not
 * render it (REQ-69 invisible refactor).
 *
 * FILTERING (this step is shared — interviews, networking, pitches and
 * difficult conversations all mount it, so every caller gets the toolbar).
 * The roster is ~54 faces and was a flat vertical scroll. `InterviewerToolbar`
 * now sits between the heading and the grid; which facets it offers is
 * measured from the fetched catalog by `lib/interview/interviewer-facets.ts`,
 * never hardcoded here.
 *
 * Two promises filtering must not break:
 * - The `suggest`-ed face stays pre-selected, pinned first and tagged
 *   "Suggested" in BOTH sort orders. It is a recommendation, not a sort key.
 * - A filter that hides the currently selected face does NOT change the
 *   selection. The step says so instead (`hiddenSelection` below), because
 *   silently re-picking someone's interviewer is worse than a hidden card.
 *
 * The step's closing action lives in `InterviewerActionDock`, which wraps the
 * grid: the house `border-t` step footer in flow, plus a strip that pins the
 * same action to the top of the column while that footer is off screen. It
 * replaced a dock that hovered over the cards. Its header comment keeps the
 * geometry reasoning.
 */

import type { SetupStepNav } from "@/components/practice/SetupWizard";
import InterviewerActionDock from "@/components/practice/steps/InterviewerActionDock";
import InterviewerToolbar from "@/components/practice/steps/InterviewerToolbar";
import {
  availableFacets,
  EMPTY_FILTERS,
  filterInterviewers,
  groupInterviewers,
  sortInterviewers,
  type InterviewerFilters,
  type SortId,
} from "@/lib/interview/interviewer-facets";
import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Spinner } from "@heroui/spinner";
import { Check, CircleAlert, Mic, SearchX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export interface InterviewerOption {
  avatarId: string;
  name: string;
  previewUrl: string | null;
  voice: { id: string; name: string };
  /**
   * Facets joined server-side in `lib/interview/avatar-catalog.ts`. All four
   * are optional on the wire: `gender` and `language` are absent whenever the
   * vendor's preset voice catalog said nothing (the five faculty avatars use
   * custom voices), and an absent value means a filter on that facet keeps
   * the option VISIBLE rather than hiding it.
   */
  gender?: string;
  language?: string;
  plays?: string;
  /** True for the account's own avatars — the Weatherhead faculty. */
  faculty?: boolean;
}

export interface InterviewerStepProps {
  nav: SetupStepNav;
  selectedInterviewerId: string | null;
  onSelect: (interviewer: InterviewerOption) => void;
  /** Step heading; defaults to the interview wording (UAT K-6). */
  heading?: string;
  /** Role line under each avatar's name; defaults to the interview wording. */
  roleLabel?: string;
  /**
   * A suggested face (networking's built-in characters). It is pre-selected
   * when nothing is selected yet, listed first and tagged "Suggested"; the
   * student can still pick any face. Returning undefined keeps the old
   * behaviour: catalog order, first entry pre-selected.
   */
  suggest?: (interviewers: InterviewerOption[]) => InterviewerOption | undefined;
}

export default function InterviewerStep({
  nav,
  selectedInterviewerId,
  onSelect,
  heading = "Choose your interviewer",
  roleLabel = "Hiring manager",
  suggest,
}: InterviewerStepProps) {
  const [interviewers, setInterviewers] = useState<InterviewerOption[]>([]);
  const [loadingInterviewers, setLoadingInterviewers] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [filters, setFilters] = useState<InterviewerFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortId>("suggested");

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
          onSelect(suggest?.(data.interviewers) ?? data.interviewers[0]);
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

  const suggested = suggest?.(interviewers);
  // Which dropdowns exist at all is a property of the data, recomputed only
  // when the catalog changes (see `availableFacets`: a facet with one distinct
  // value is dropped, which hides the language facet on today's all-English
  // preset voices).
  const facets = useMemo(() => availableFacets(interviewers), [interviewers]);
  const ordered = useMemo(
    () =>
      sortInterviewers(filterInterviewers(interviewers, filters), sort, suggested),
    [interviewers, filters, sort, suggested],
  );
  // Sections only in the Suggested order; Name A-Z is one flat alphabet.
  // Mutually exclusive on purpose — an alphabet restarting at every heading is
  // harder to scan than either one alone.
  const sections = useMemo(
    () => (sort === "suggested" ? groupInterviewers(ordered, suggested) : null),
    [ordered, sort, suggested],
  );

  const selectedInterviewer = interviewers.find(
    (interviewer) => interviewer.avatarId === selectedInterviewerId,
  );
  // A filter must never re-pick someone's interviewer, so the selection stands
  // and the step says the card is out of view instead.
  const hiddenSelection = Boolean(
    selectedInterviewer &&
      !ordered.some((option) => option.avatarId === selectedInterviewer.avatarId),
  );

  /**
   * One picker card. Shared by the grouped and flat views so the card cannot
   * drift between them. Unchanged from the pre-filter grid apart from being
   * lifted out of the map.
   */
  const renderCard = (interviewer: InterviewerOption) => {
    const selected = interviewer.avatarId === selectedInterviewerId;
    // The card's name is a heading one level below whatever is above it: h3 in
    // the flat alphabetical grid, h4 under a section's own h3. Skipping a level
    // would break heading navigation in exactly the view meant to help it.
    const NameTag = sections ? "h4" : "h3";
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
            {interviewer === suggested && (
              <span className="mr-auto rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-cwru-blue">
                Suggested
              </span>
            )}
            {selected && (
              <span className="grid h-6 w-6 place-items-center rounded-full bg-true-blue text-white ring-2 ring-white">
                <Check size={15} strokeWidth={3} />
              </span>
            )}
          </div>
          <NameTag className="font-display font-medium text-2xl">
            {interviewer.name}
          </NameTag>
          <p className="mt-1 text-sm text-white/90">{roleLabel} · Live session</p>
        </div>
      </button>
    );
  };

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
        <InterviewerActionDock
          continueDisabled={!selectedInterviewer}
          stripSummary={
            selectedInterviewer ? (
              <>
                Selected{" "}
                <span className="font-semibold text-white">{selectedInterviewer.name}</span>
              </>
            ) : (
              "Choose an interviewer to continue"
            )
          }
          summary={
            selectedInterviewer ? (
              <>
                Selected{" "}
                <span className="font-semibold text-ink">
                  {selectedInterviewer.name}
                </span>
              </>
            ) : (
              `${interviewers.length} interviewers — choose one to continue`
            )
          }
          onContinue={nav.goNext}
        >
          <div className="mb-5 flex flex-col gap-3">
            <InterviewerToolbar
              facets={facets}
              filters={filters}
              resultCount={ordered.length}
              sort={sort}
              totalCount={interviewers.length}
              onFiltersChange={setFilters}
              onSortChange={setSort}
            />
            {hiddenSelection && selectedInterviewer && (
              <p className="text-[13px] leading-5 text-muted">
                <span className="font-semibold text-ink">
                  {selectedInterviewer.name}
                </span>
                {" is still your interviewer — the current filters just hide "}
                {"that card."}
              </p>
            )}
          </div>

          {ordered.length === 0 ? (
            // Compact and left-aligned, not a tall centred hero: the page
            // already carries the pace panel below, so a 260px empty state
            // wastes the screen the student needs for the filters above it.
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-white p-5">
              <SearchX aria-hidden className="shrink-0 text-muted" size={20} />
              <div className="min-w-48 flex-1">
                <p className="text-[15px] font-semibold text-ink">
                  No interviewer matches those filters
                </p>
                <p className="mt-0.5 text-sm leading-6 text-muted">
                  Clear them to see all {interviewers.length} faces again.
                </p>
              </div>
              <Button
                className="h-11 font-semibold"
                color="primary"
                variant="bordered"
                onPress={() => setFilters(EMPTY_FILTERS)}
              >
                Clear filters
              </Button>
            </div>
          ) : (
            // Sections in the Suggested order, one flat grid in Name A-Z.
            // `renderCard` is shared by both so the card never drifts between
            // the two views.
            sections ? (
              <div className="flex flex-col gap-8">
                {sections.map((section) => (
                  <section key={section.id} aria-labelledby={`interviewer-group-${section.id}`}>
                    <div className="mb-3 flex items-baseline gap-2">
                      {/* A real h3 under the step's h2, so a screen-reader user
                          can jump between sections rather than walking 54
                          buttons. */}
                      <h3
                        className="text-[13px] font-semibold text-ink"
                        id={`interviewer-group-${section.id}`}
                      >
                        {section.label}
                      </h3>
                      <span className="text-[13px] text-muted">{section.members.length}</span>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {section.members.map(renderCard)}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {ordered.map(renderCard)}
              </div>
            )
          )}
        </InterviewerActionDock>
      )}
    </section>
  );
}
