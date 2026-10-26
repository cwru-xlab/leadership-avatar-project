/**
 * Renders a study plan's generated content: strengths, prioritized practice
 * themes (exercises + readiness checks), resources, and the next-practice
 * focus callout.
 *
 * Extracted in quick-006 from `app/reports/page.tsx` (where it was a local,
 * unexported function) so both the draft-preview card on `/reports` and the
 * saved-plan's own route at `/study-plans/[planId]` can render the same
 * content without duplicating markup. Colors match origin/dev's Weatherhead
 * reports restyle so the extracted surface does not drift from /reports.
 */
import type { StudyPlanContent } from "@/lib/study-plan/types";

export default function PlanContent({ content }: { content: StudyPlanContent }) {
  return (
    <div className="space-y-7 text-sm text-[#33465d]">
      <section>
        <h3 className="font-serif text-xl text-[#10243f]">
          Strengths to leverage
        </h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {content.strengthsToLeverage.map((strength) => (
            <div
              key={strength.theme}
              className="rounded-xl border border-[#d7dfe8] bg-[#f7f9fb] p-4"
            >
              <p className="font-semibold text-[#10243f]">{strength.theme}</p>
              <p className="mt-1 leading-6">{strength.explanation}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="font-serif text-xl text-[#10243f]">
          Practice priorities
        </h3>
        <div className="mt-3 space-y-4">
          {content.priorityThemes.map((theme) => (
            <article
              key={theme.priority}
              className="rounded-xl border border-[#d7dfe8] p-4 sm:p-5"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#003087] text-xs font-bold text-white">
                  {theme.priority}
                </span>
                <div>
                  <h4 className="font-semibold text-[#10243f]">
                    {theme.theme}
                  </h4>
                  <p className="mt-1 leading-6">{theme.whyItMatters}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[#003087]">
                    Targeted exercises
                  </p>
                  <ul className="mt-2 space-y-3">
                    {theme.practiceExercises.map((exercise) => (
                      <li key={exercise.title}>
                        <p className="font-medium text-[#10243f]">
                          {exercise.title}{" "}
                          <span className="font-normal text-[#43546a]">
                            · {exercise.estimatedMinutes} min
                          </span>
                        </p>
                        <p className="mt-1 leading-6">
                          {exercise.instructions}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[#43546a]">
                          Ready when: {exercise.successCriteria}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[#003087]">
                    Readiness checks
                  </p>
                  <ul className="mt-2 list-disc space-y-2 pl-5 leading-6">
                    {theme.readinessChecks.map((check) => (
                      <li key={check}>{check}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h3 className="font-serif text-xl text-[#10243f]">Useful resources</h3>
        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {content.resources.map((resource) => (
            <li
              key={resource.title}
              className="rounded-xl border border-[#d7dfe8] p-4"
            >
              {resource.url ? (
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-[#003087] underline underline-offset-2"
                >
                  {resource.title}
                </a>
              ) : (
                <p className="font-semibold text-[#10243f]">{resource.title}</p>
              )}
              <p className="mt-1 leading-6">{resource.description}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-[#b7c9de] bg-[#edf2f8] p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[#003087]">
          Next practice focus
        </p>
        <p className="mt-2 font-medium leading-6 text-[#1d3655]">
          {content.nextPracticeFocus}
        </p>
      </section>
    </div>
  );
}
