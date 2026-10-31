"use client";

/**
 * One card shell for the practice libraries (case studies and student
 * scenarios on /case-play), so both sections read as one page: an optional
 * cover strip, the cast as stacked initials, the full title, a two-line
 * summary, a footer line, and the card's own actions below.
 */
import type { ReactNode } from "react";
import { ArrowRight, Briefcase } from "lucide-react";

export interface LibraryCharacter {
  name: string;
  role: string;
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

export default function LibraryCard({
  title,
  summary,
  coverImage,
  characters,
  badges,
  footer,
  actionLabel = "Start",
  actions,
}: {
  title: string;
  summary?: string;
  coverImage?: string;
  characters: LibraryCharacter[];
  badges?: ReactNode;
  footer?: ReactNode;
  actionLabel?: string;
  /** Owner-only controls, rendered under a divider. */
  actions?: ReactNode;
}) {
  const shown = characters.slice(0, 3);
  const lead = characters[0];
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white transition-colors duration-150 ease-out group-hover:border-true-blue/50">
      {coverImage ? (
        <div
          aria-hidden
          className="h-28 bg-light-blue/32 bg-cover bg-center"
          style={{ backgroundImage: `url(${coverImage})` }}
        />
      ) : null}
      <div className="flex flex-1 flex-col gap-3 p-[18px]">
        <div className="flex items-start gap-3">
          {shown.length > 0 ? (
            <span className="flex shrink-0 -space-x-2">
              {shown.map((c, i) => (
                <span
                  key={`${c.name}-${i}`}
                  className="grid size-11 place-items-center rounded-full bg-cwru-blue text-sm font-bold text-white shadow-[0_0_0_3px_white]"
                  title={`${c.name}${c.role ? ` · ${c.role}` : ""}`}
                >
                  {initials(c.name)}
                </span>
              ))}
            </span>
          ) : (
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-cwru-blue text-white">
              <Briefcase aria-hidden size={20} strokeWidth={1.75} />
            </span>
          )}
          <p className="flex min-w-0 flex-1 flex-col text-[12.5px] leading-snug text-muted">
            {lead ? (
              <>
                <span className="truncate font-semibold text-ink">{lead.name}</span>
                <span className="truncate">
                  {lead.role}
                  {characters.length > 1 ? ` · +${characters.length - 1} more` : ""}
                </span>
              </>
            ) : (
              <span>Case study</span>
            )}
          </p>
          {badges ? <span className="flex shrink-0 flex-wrap justify-end gap-1">{badges}</span> : null}
        </div>

        <h3 className="font-display text-[19px] font-medium leading-tight text-cwru-blue">{title}</h3>
        {summary ? <p className="line-clamp-2 text-[13.5px] leading-5 text-muted">{summary}</p> : null}

        <div className="mt-auto flex items-center justify-between gap-3 pt-1">
          <span className="text-[12.5px] text-muted">{footer}</span>
          <span className="inline-flex items-center gap-1 text-sm font-bold text-true-blue">
            {actionLabel} <ArrowRight aria-hidden size={15} strokeWidth={2.5} />
          </span>
        </div>

        {actions ? <div className="flex flex-wrap gap-1 border-t border-line pt-2.5">{actions}</div> : null}
      </div>
    </article>
  );
}

/** A small status pill for library cards. */
export function LibraryBadge({ tone = "neutral", children }: { tone?: "neutral" | "good" | "brand"; children: ReactNode }) {
  const cls =
    tone === "good" ? "bg-level-4/16 text-ink" : tone === "brand" ? "bg-light-blue/32 text-cwru-blue" : "bg-canvas text-muted";
  return <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${cls}`}>{children}</span>;
}
