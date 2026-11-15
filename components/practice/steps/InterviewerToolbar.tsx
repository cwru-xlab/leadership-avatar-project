"use client";

/**
 * The interviewer picker's filter toolbar: name search, one dropdown per
 * supported facet, a sort control, and the live result count.
 *
 * WHY A TOOLBAR AND NOT A LEFT RAIL. The grid is the content, and at 54 cards
 * the student's first move is nearly always "find a face", not "narrow by
 * attribute". A horizontal strip above the grid keeps the cards at full width
 * at every breakpoint and keeps the controls in the same reading line as the
 * heading, so the step still reads as one question. A rail would cost the grid
 * a column and would need its own collapsed state on mobile.
 *
 * WHAT THE FACETS ARE, AND ARE NOT. The dropdowns come from
 * `availableFacets`, which measures the live catalog and drops any facet with
 * fewer than two values — so this component never hardcodes which controls
 * exist. Today that leaves one dropdown: language is all-`en` upstream, and
 * `plays` is grid GROUPING rather than a filter because 41 of 49 stock faces
 * are `general` (see `lib/interview/interviewer-facets.ts`, rule 3).
 *
 * The "Voice" label is deliberate: the value is the gender HeyGen recorded for
 * the VOICE paired with a face, not a claim about a person, and the note under
 * an active filter says out loud that faces with nothing on record stay
 * listed.
 *
 * The count lives in an `aria-live="polite"` region so a screen-reader user
 * hears the grid change as they type, rather than having to go look.
 */

import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { ListFilter, Search, X } from "lucide-react";

import {
  EMPTY_FILTERS,
  type Facet,
  type FacetId,
  type InterviewerFilters,
  type SortId,
} from "@/lib/interview/interviewer-facets";

export interface InterviewerToolbarProps {
  facets: Facet[];
  filters: InterviewerFilters;
  sort: SortId;
  /** How many faces survive the current filters — the same number the grid renders. */
  resultCount: number;
  /** The unfiltered roster size, for the "of 54" denominator. */
  totalCount: number;
  onFiltersChange: (next: InterviewerFilters) => void;
  onSortChange: (next: SortId) => void;
}

const SORT_LABELS: Record<SortId, string> = {
  suggested: "Suggested",
  name: "Name A–Z",
};

/** Shared control chrome: 44px tall for touch, 4px radius per the input rule. */
const CONTROL_TRIGGER =
  "h-11 min-h-11 rounded-sm border border-line bg-white shadow-none data-[hover=true]:border-true-blue/50 data-[focus=true]:border-true-blue group-data-[focus-visible=true]:ring-2 group-data-[focus-visible=true]:ring-true-blue";

export default function InterviewerToolbar({
  facets,
  filters,
  sort,
  resultCount,
  totalCount,
  onFiltersChange,
  onSortChange,
}: InterviewerToolbarProps) {
  const activeChips = buildChips(facets, filters);

  const setFacet = (facet: FacetId, value: string | null) =>
    onFiltersChange({ ...filters, [facet]: value });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-white p-3">
        <Input
          className="min-w-52 max-w-md flex-1 basis-56"
          classNames={{
            inputWrapper: CONTROL_TRIGGER,
            label: "text-[13px] font-semibold text-ink",
            input: "text-[14.5px]",
          }}
          isClearable
          label="Search by name"
          labelPlacement="outside"
          placeholder="Any name"
          startContent={<Search aria-hidden className="shrink-0 text-muted" size={18} />}
          value={filters.query}
          onClear={() => onFiltersChange({ ...filters, query: "" })}
          onValueChange={(query) => onFiltersChange({ ...filters, query })}
        />

        {facets.map((facet) => (
          <Select
            key={facet.id}
            // Half a row each under 640px so Voice and Sort pair up instead
            // of stacking into a third row; fixed and compact above it, where
            // search, the facets, Sort and the count share one line.
            className="w-[calc(50%-0.375rem)] shrink-0 sm:w-40"
            classNames={{
              trigger: CONTROL_TRIGGER,
              label: "text-[13px] font-semibold text-ink",
              value: "text-[14.5px] text-ink",
              // Raised surface, portalled above the grid: a dropdown clipped
              // by the first card row is the whole point of getting right.
              // `min-w-max` because the popover otherwise inherits the 160px
              // trigger width and truncates "Female voice (28)" mid-count.
              popoverContent:
                "min-w-max rounded-lg border border-line shadow-raised",
            }}
            label={facet.label}
            labelPlacement="outside"
            placeholder={facet.anyLabel}
            renderValue={(items) =>
              items.length ? (
                <span className="truncate">
                  {facet.options.find((o) => o.value === items[0]?.key)?.label ??
                    facet.anyLabel}
                </span>
              ) : (
                <span className="text-muted">{facet.anyLabel}</span>
              )
            }
            selectedKeys={filters[facet.id] ? [filters[facet.id]!] : []}
            selectionMode="single"
            onSelectionChange={(keys) => {
              const next = [...(keys as Set<string>)][0] ?? null;
              setFacet(facet.id, next);
            }}
          >
            {facet.options.map((option) => (
              <SelectItem key={option.value} textValue={option.label}>
                {`${option.label} (${option.count})`}
              </SelectItem>
            ))}
          </Select>
        ))}

        <Select
          className="w-[calc(50%-0.375rem)] shrink-0 sm:w-40"
          classNames={{
            trigger: CONTROL_TRIGGER,
            label: "text-[13px] font-semibold text-ink",
            value: "text-[14.5px] text-ink",
            popoverContent:
              "min-w-max rounded-lg border border-line shadow-raised",
          }}
          disallowEmptySelection
          label="Sort"
          labelPlacement="outside"
          selectedKeys={[sort]}
          selectionMode="single"
          startContent={
            <ListFilter aria-hidden className="shrink-0 text-muted" size={18} />
          }
          onSelectionChange={(keys) => {
            const next = [...(keys as Set<string>)][0] as SortId | undefined;
            if (next) onSortChange(next);
          }}
        >
          {(Object.keys(SORT_LABELS) as SortId[]).map((id) => (
            <SelectItem key={id} textValue={SORT_LABELS[id]}>
              {SORT_LABELS[id]}
            </SelectItem>
          ))}
        </Select>
        {/* Reading order puts the count after Sort, and an aria-live region
            has to be in the DOM before it updates or the change is never
            announced — so it lives in the row itself, always mounted, rather
            than in the chips row that comes and goes.
            `ml-auto` only once the row is wide enough to hold it: below that
            it wraps to its own line and a left edge reads better than a count
            stranded on the right. */}
        <p
          aria-live="polite"
          className="self-center whitespace-nowrap text-[13px] text-muted min-[1100px]:ml-auto"
        >
          <span className="font-semibold text-ink">{resultCount}</span>
          {` of ${totalCount} ${totalCount === 1 ? "interviewer" : "interviewers"}`}
          {activeChips.length > 0 ? " match" : ""}
        </p>
      </div>

      {/* Chips only when something is set. They sit BELOW the toolbar card,
          not inside it, so adding one grows the page by a single 32px row
          rather than reflowing the control row and shoving the grid down. */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <ul className="flex flex-wrap items-center gap-2">
            {activeChips.map((chip) => (
              <li key={chip.key}>
                <button
                  className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-light-blue/32 px-2.5 text-[13px] text-ink transition-colors duration-150 ease-out hover:bg-light-blue/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-true-blue"
                  type="button"
                  onClick={() => onFiltersChange(chip.clear(filters))}
                >
                  {chip.label}
                  <X aria-hidden size={14} />
                  <span className="sr-only">— remove this filter</span>
                </button>
              </li>
            ))}
          </ul>
          <Button
            className="h-8 min-w-0 px-2 text-[13px] font-semibold text-link"
            size="sm"
            variant="light"
            onPress={() => onFiltersChange(EMPTY_FILTERS)}
          >
            Clear all
          </Button>

          {/* Rule 1 made visible: without this line the five faculty faces
              surviving every Voice filter look like a bug. */}
          {facets
            .filter((facet) => filters[facet.id] && facet.alwaysVisibleNote)
            .map((facet) => (
              <p
                key={facet.id}
                className="basis-full text-[13px] leading-5 text-muted"
              >
                {facet.alwaysVisibleNote}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}

interface ActiveChip {
  key: string;
  label: string;
  clear: (filters: InterviewerFilters) => InterviewerFilters;
}

/**
 * One chip per active choice. Labels carry the facet name ("Voice: Female
 * voice" would stutter, so a value already naming its facet stands alone) so a
 * chip is readable out of the dropdown's context.
 */
function buildChips(
  facets: Facet[],
  filters: InterviewerFilters,
): ActiveChip[] {
  const chips: ActiveChip[] = [];
  const query = filters.query.trim();
  if (query) {
    chips.push({
      key: "query",
      label: `Name: ${query}`,
      clear: (f) => ({ ...f, query: "" }),
    });
  }
  for (const facet of facets) {
    const value = filters[facet.id];
    if (!value) continue;
    const label =
      facet.options.find((option) => option.value === value)?.label ?? value;
    chips.push({
      key: facet.id,
      label: label.toLowerCase().includes(facet.label.toLowerCase())
        ? label
        : `${facet.label}: ${label}`,
      clear: (f) => ({ ...f, [facet.id]: null }),
    });
  }
  return chips;
}
