"use client";

/**
 * A saved study plan's own URL route (quick-006). Previously a saved plan
 * rendered inline on `/reports` by setting `viewedPlan` state after a
 * client-side fetch; that inline block (title, saved date, source-report
 * count, summary, `PlanContent`, and the `PathPanel` + generate-path action)
 * moves here verbatim. `/reports`'s "View plan" button now navigates here
 * instead of fetching into local state.
 *
 * Follows the same auth/loading/error conventions as its path-step
 * children, `app/study-plans/[planId]/checks/[checkId]/page.tsx` and
 * `app/study-plans/[planId]/coached/[stepId]/page.tsx`: a client fetch, a
 * 401 renders a "go sign in" prompt, a 404 renders a "not available"
 * message with a way back — no automatic redirect.
 *
 * Path fetch/generation keeps its own isolated loading/error state, exactly
 * as it did on `/reports` — a path fetch failure sets `pathError` only and
 * never blocks the plan content rendered above it.
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { ArrowLeft } from "lucide-react";

import type { StudyPlanDTO } from "@/lib/study-plan/plan-dto";
import PlanContent from "@/components/study-plan/PlanContent";
import PathPanel, {
  DegradedStepsNote,
  type PathViewDTO,
} from "@/components/study-plan/PathPanel";
import SincePlanGrowth from "@/components/study-plan/SincePlanGrowth";
import GeneratePathCard from "@/components/study-plan/GeneratePathCard";
import { usePathMastery } from "@/components/study-plan/PathVisuals";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function StudyPlanPage() {
  const params = useParams<{ planId: string }>();
  const router = useRouter();
  const planId = params.planId;

  const [needsLogin, setNeedsLogin] = useState(false);
  const [notFound, setNotFoundState] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [plan, setPlan] = useState<StudyPlanDTO | null>(null);

  // Path panel state — isolated from the plan-fetch state above, same as
  // the inline block this replaces: a path fetch failure sets `pathError`
  // only and never touches `loadError`.
  const [path, setPath] = useState<PathViewDTO | null>(null);
  const [pathLoading, setPathLoading] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);
  const [degradedStepCount, setDegradedStepCount] = useState(0);
  const mastery = usePathMastery();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`/api/study-plans/${planId}`, {
          cache: "no-store",
          credentials: "include",
        });
        if (response.status === 401) {
          if (!cancelled) setNeedsLogin(true);
          return;
        }
        if (response.status === 404) {
          if (!cancelled) setNotFoundState(true);
          return;
        }
        const data = (await response.json().catch(() => ({}))) as {
          plan?: StudyPlanDTO;
          error?: string;
        };
        if (!response.ok || !data.plan) {
          if (!cancelled) setLoadError(data.error || "We couldn't load this study plan.");
          return;
        }
        if (!cancelled) setPlan(data.plan);
      } catch {
        if (!cancelled) setLoadError("We couldn't load this study plan.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [planId]);

  // Fetches the path once the plan has loaded successfully.
  useEffect(() => {
    if (!plan) return;
    let cancelled = false;
    void (async () => {
      setPathLoading(true);
      setPathError(null);
      try {
        const response = await fetch(`/api/study-plans/${planId}/path`, {
          cache: "no-store",
          credentials: "include",
        });
        const data = (await response.json().catch(() => ({}))) as {
          path?: PathViewDTO | null;
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok) {
          setPathError(data.error || "We couldn't load this plan's path.");
          return;
        }
        setPath(data.path ?? null);
      } catch {
        if (!cancelled) setPathError("We couldn't load this plan's path.");
      } finally {
        if (!cancelled) setPathLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `plan` (not plan.id) is intentional here — this effect should run once
    // the plan object itself resolves, mirroring the original effect's
    // dependency on `viewedPlan`.
  }, [plan, planId]);

  if (needsLogin) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="text-[#385463]">Sign in to view this study plan.</p>
        <Button className="mt-5" color="primary" onPress={() => router.push("/login")}>
          Go to sign in
        </Button>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="text-[#385463]">This study plan is not available.</p>
        <Button as={Link} href="/study-plans" className="mt-5" color="primary">
          Back to study plans
        </Button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="text-[#9b2c2c]">{loadError}</p>
        <Button as={Link} href="/study-plans" className="mt-5" variant="light">
          Back to study plans
        </Button>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#f5f8fa] text-[#102331]">
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-10 lg:px-8">
        <Button
          as={Link}
          href="/study-plans"
          variant="light"
          size="sm"
          startContent={<ArrowLeft className="h-4 w-4" />}
          className="-ml-2 self-start text-default-600 data-[hover=true]:bg-transparent"
        >
          Back to study plans
        </Button>

        <section className="mt-4 rounded-2xl border border-[#d4e2e9] bg-white p-5 shadow-[0_8px_24px_rgba(20,58,75,0.06)] sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0a7391]">Saved study plan</p>
          <h1 className="mt-2 font-serif text-3xl text-[#102331]">{plan.title}</h1>
          <p className="mt-1 text-sm text-[#58727f]">
            Saved {formatDate(plan.savedAt)} · {plan.sourceReportCount} reports analyzed
          </p>
          <p className="mt-4 max-w-3xl leading-7 text-[#385463]">{plan.content.summary}</p>
          <div className="mt-7">
            <PlanContent content={plan.content} />
          </div>

          {/* The path lives inside the study plan that owns it
              (REQ-120/REQ-122), fetched in its own effect above with its
              own loading/error state. A fetch failure here never blocks the
              plan content rendered just above. */}
          <div className="mt-8">
            {pathLoading ? (
              <div className="h-24 animate-pulse rounded-2xl border border-[#e3ebee] bg-white" />
            ) : pathError ? (
              <p className="text-sm text-danger-700">{pathError}</p>
            ) : path ? (
              <>
                <PathPanel
                  planId={plan.id}
                  path={path}
                  levels={mastery?.levels}
                  growthSlot={<SincePlanGrowth planId={plan.id} />}
                />
                <DegradedStepsNote count={degradedStepCount} />
              </>
            ) : (
              <GeneratePathCard
                planId={plan.id}
                onGenerated={(generated, degraded) => {
                  setPath(generated);
                  setDegradedStepCount(degraded);
                }}
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
