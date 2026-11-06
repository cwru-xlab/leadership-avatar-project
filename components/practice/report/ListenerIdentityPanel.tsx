/**
 * Names who an elevator pitch report's student actually spoke to, and reveals
 * what that person cared about once the session is over. Discovery is graded,
 * so this is the answer key: it stays behind a disclosure.
 *
 * Reports from before the roster have `listenerPersona: null` and resolve to the
 * legacy listener, because that is who those students spoke to.
 */

import { resolveElevatorListener } from "@/lib/pitch/elevator-personas";
import type { ReportDTO } from "@/lib/report/dto";
import { ChevronDown, UserRound } from "lucide-react";

export interface ListenerIdentityPanelProps {
  report: ReportDTO;
}

export default function ListenerIdentityPanel({
  report,
}: ListenerIdentityPanelProps) {
  const input = report.input;
  if (input?.kind !== "pitch" || input.pitchKind !== "elevator") return null;

  const { name, role, temperament, interests, priorities } =
    resolveElevatorListener(input.listenerPersona);

  return (
    <section
      aria-label="Your listener"
      className="rounded-xl border border-line bg-white px-5 py-4 text-ink"
      data-testid="listener-identity-panel"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-canvas text-cwru-blue"
        >
          <UserRound size={20} />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-muted">You pitched to</p>
          <p className="font-display text-xl font-medium leading-snug text-cwru-blue">
            {name}
          </p>
          <p className="text-sm text-muted">{role}</p>
        </div>
      </div>
      <details className="group mt-3">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded text-sm font-semibold text-link focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-true-blue [&::-webkit-details-marker]:hidden">
          What they cared about
          <ChevronDown
            aria-hidden
            className="transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
            size={16}
          />
        </summary>
        <div className="mt-2 flex max-w-[65ch] flex-col gap-3 text-sm leading-6">
          {temperament ? <p className="text-ink">{temperament}</p> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[13px] font-semibold text-muted">Interests</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {interests.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[13px] font-semibold text-muted">Priorities</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {priorities.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}
