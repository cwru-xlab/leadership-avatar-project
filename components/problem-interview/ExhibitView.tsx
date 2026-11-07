/**
 * One data exhibit — a table, or a simple horizontal bar chart — rendered the
 * same way in the live session (dark room) and on the report (white card).
 *
 * Plain HTML/CSS, no chart library. Bars are drawn with widths relative to the
 * largest value; the value is always printed beside its bar, so the chart is
 * readable without color and announced as a list by screen readers. Tables
 * scroll horizontally inside their own box, so a wide exhibit never widens
 * the page at 375px.
 */

import type { PublicExhibit } from "@/lib/problem-interview/session-state";

export type ExhibitTone = "room" | "page";

const TONE = {
  room: {
    title: "text-white",
    caption: "text-light-blue",
    head: "border-white/15 text-light-blue",
    cell: "border-white/10 text-canvas",
    track: "bg-white/10",
    bar: "bg-light-blue",
    label: "text-canvas",
    value: "text-white",
  },
  page: {
    title: "text-ink",
    caption: "text-muted",
    head: "border-line text-muted",
    cell: "border-line text-ink",
    track: "bg-light-blue/30",
    bar: "bg-true-blue",
    label: "text-ink",
    value: "text-ink",
  },
} as const;

function formatCell(value: string | number): string {
  return typeof value === "number" ? value.toLocaleString("en-US") : value;
}

export default function ExhibitView({
  exhibit,
  tone,
  headingLevel = 3,
}: {
  exhibit: PublicExhibit;
  tone: ExhibitTone;
  headingLevel?: 3 | 4;
}) {
  const t = TONE[tone];
  const Heading = headingLevel === 3 ? "h3" : "h4";

  return (
    <figure className="m-0 flex flex-col gap-3" data-testid={`exhibit-${exhibit.id}`}>
      <figcaption className="flex flex-col gap-1">
        <Heading className={`text-[15px] font-semibold leading-6 ${t.title}`}>
          {exhibit.title}
        </Heading>
        {exhibit.caption ? (
          <span className={`text-[12.5px] leading-5 ${t.caption}`}>{exhibit.caption}</span>
        ) : null}
      </figcaption>

      {exhibit.kind === "bar" ? (
        <BarList exhibit={exhibit} tone={tone} />
      ) : (
        <div className="max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label={`${exhibit.title} table`}>
          <table className="w-full min-w-max border-collapse text-left text-[13px] tabular-nums">
            <thead>
              <tr>
                {exhibit.columns.map((column) => (
                  <th
                    key={column}
                    scope="col"
                    className={`border-b px-2 py-2 font-semibold first:pl-0 ${t.head}`}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {exhibit.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) =>
                    cellIndex === 0 ? (
                      <th
                        key={cellIndex}
                        scope="row"
                        className={`border-b px-2 py-2 pl-0 font-semibold ${t.cell}`}
                      >
                        {formatCell(cell)}
                      </th>
                    ) : (
                      <td
                        key={cellIndex}
                        className={`border-b px-2 py-2 ${typeof cell === "number" ? "text-right" : ""} ${t.cell}`}
                      >
                        {formatCell(cell)}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}

function BarList({ exhibit, tone }: { exhibit: PublicExhibit; tone: ExhibitTone }) {
  const t = TONE[tone];
  const bars = exhibit.rows
    .map((row) => ({
      label: String(row[0] ?? ""),
      value: typeof row[1] === "number" ? row[1] : Number(row[1]),
    }))
    .filter((bar) => bar.label && Number.isFinite(bar.value));
  const max = Math.max(0, ...bars.map((bar) => Math.abs(bar.value)));
  const [categoryLabel, valueLabel] = exhibit.columns;

  return (
    <ul
      className="m-0 flex list-none flex-col gap-2 p-0"
      aria-label={`${categoryLabel ?? "Category"} by ${valueLabel ?? "value"}`}
    >
      {bars.map((bar) => (
        <li key={bar.label} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-[13px] leading-5">
            <span className={t.label}>{bar.label}</span>
            <span className={`font-semibold tabular-nums ${t.value}`}>
              {formatCell(bar.value)}
              <span className="sr-only"> {valueLabel}</span>
            </span>
          </div>
          <div className={`h-2 w-full rounded-full ${t.track}`} aria-hidden="true">
            <div
              className={`h-2 rounded-full ${t.bar}`}
              style={{ width: `${max > 0 ? Math.max(2, (Math.abs(bar.value) / max) * 100) : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
