/**
 * Renders a study plan's generated content: prioritized practice themes
 * (exercises + readiness checks), strengths, resources, and the
 * next-practice focus.
 *
 * Extracted in quick-006 from `app/reports/page.tsx` (where it was a local,
 * unexported function) so both the draft-preview card on `/reports` and the
 * saved-plan's own route at `/study-plans/[planId]` can render the same
 * content without duplicating markup.
 *
 * Each priority is a tile: an icon, its title, why it matters, and the
 * exercise names up front; instructions, "ready when" criteria and
 * readiness checks open from the tile.
 */
import { BadgeCheck, BookOpen, ChevronDown, CircleCheckBig, ExternalLink, Target } from "lucide-react";

import { themeIcon } from "@/components/study-plan/competency-icons";
import type { StudyPlanContent } from "@/lib/study-plan/types";

export default function PlanContent({ content }: { content: StudyPlanContent }) {
  return (
    <div className="flex flex-col gap-7 text-sm text-ink">
      <section className="flex flex-col gap-3">
        <h3 className="font-display text-[22px] font-medium text-cwru-blue">
          Practice priorities{" "}
          <span className="font-sans text-sm font-normal text-muted">{content.priorityThemes.length}</span>
        </h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {content.priorityThemes.map((theme) => {
            const Icon = themeIcon(theme.theme);
            return (
              <article key={theme.priority} className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5">
                <div className="flex items-start justify-between">
                  <span className="grid size-[52px] place-items-center rounded-[14px] bg-light-blue/32 text-cwru-blue">
                    <Icon aria-hidden size={26} strokeWidth={1.75} />
                  </span>
                  <span aria-label={`Priority ${theme.priority}`} className="font-display text-[28px] font-medium text-light-blue">
                    {String(theme.priority).padStart(2, "0")}
                  </span>
                </div>
                <h4 className="text-base font-bold leading-snug text-ink">{theme.theme}</h4>
                <p className="line-clamp-3 leading-6 text-muted">{theme.whyItMatters}</p>
                <ul className="flex flex-col gap-1.5">
                  {theme.practiceExercises.map((exercise) => (
                    <li key={exercise.title} className="flex items-start gap-2">
                      <CircleCheckBig aria-hidden className="mt-0.5 shrink-0 text-true-blue" size={15} strokeWidth={2} />
                      <span>
                        {exercise.title} <span className="text-muted">· {exercise.estimatedMinutes} min</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <details className="group mt-auto border-t border-line pt-3">
                  <summary className="flex cursor-pointer list-none items-center gap-1 text-[13.5px] font-semibold text-true-blue [&::-webkit-details-marker]:hidden">
                    How to practice and readiness checks
                    <ChevronDown aria-hidden className="transition-transform duration-200 group-open:rotate-180" size={14} />
                  </summary>
                  <div className="mt-3 flex flex-col gap-3">
                    {theme.practiceExercises.map((exercise) => (
                      <div key={exercise.title} className="flex flex-col gap-1">
                        <p className="font-semibold">{exercise.title}</p>
                        <p className="leading-6">{exercise.instructions}</p>
                        <p className="text-xs leading-5 text-muted">Ready when: {exercise.successCriteria}</p>
                      </div>
                    ))}
                    <div className="flex flex-col gap-1">
                      <p className="text-xs font-semibold text-muted">Readiness checks</p>
                      <ul className="list-disc space-y-1 pl-5 leading-6">
                        {theme.readinessChecks.map((check) => (
                          <li key={check}>{check}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </details>
              </article>
            );
          })}
        </div>
      </section>

      <section className="flex items-start gap-4 rounded-2xl bg-light-blue/32 p-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-cwru-blue">
          <Target aria-hidden size={22} strokeWidth={1.75} />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-cwru-blue">Next practice focus</p>
          <p className="max-w-[60ch] font-display text-lg italic leading-[1.4] text-ink">{content.nextPracticeFocus}</p>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h3 className="font-display text-[22px] font-medium text-cwru-blue">Strengths to leverage</h3>
          {content.strengthsToLeverage.map((strength) => (
            <div key={strength.theme} className="flex gap-3 rounded-2xl border border-line bg-white p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-level-4/16 text-level-4">
                <BadgeCheck aria-hidden size={20} strokeWidth={2} />
              </span>
              <div className="flex flex-col gap-0.5">
                <p className="font-bold">{strength.theme}</p>
                <p className="leading-6 text-muted">{strength.explanation}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="font-display text-[22px] font-medium text-cwru-blue">Useful resources</h3>
          <ul className="flex flex-col gap-3">
            {content.resources.map((resource) => (
              <li key={resource.title} className="flex gap-3 rounded-2xl border border-line bg-white p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-light-blue/32 text-cwru-blue">
                  <BookOpen aria-hidden size={20} strokeWidth={1.75} />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  {resource.url ? (
                    <a
                      className="inline-flex items-center gap-1 font-bold text-true-blue hover:underline"
                      href={resource.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {resource.title}
                      <ExternalLink aria-hidden size={13} />
                    </a>
                  ) : (
                    <p className="font-bold">{resource.title}</p>
                  )}
                  <p className="leading-6 text-muted">{resource.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
