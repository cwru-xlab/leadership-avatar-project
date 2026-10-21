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
  const [generatingPath, setGeneratingPath] = useState(false);
  const [degradedStepCount, setDegradedStepCount] = useState(0);

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

  // Own fetch, own loading/error state — deliberately separate from the
  // plan load above, same as the inline block this replaces.
  async function fetchPath() {
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
      if (!response.ok) {
        setPathError(data.error || "We couldn't load this plan's path.");
        return;
      }
      setPath(data.path ?? null);
    } catch {
      setPathError("We couldn't load this plan's path.");
    } finally {
      setPathLoading(false);
    }
  }

  async function generatePathForPlan() {
    if (generatingPath) return;
    setGeneratingPath(true);
    setPathError(null);
    try {
      const response = await fetch(`/api/study-plans/${planId}/path`, {
        method: "POST",
        credentials: "include",
      });
      if (response.status === 409) {
        // A race between two clicks (or two tabs) lands on the path that
        // already exists — refetch rather than showing an error.
        await fetchPath();
        return;
      }
      const data = (await response.json().catch(() => ({}))) as {
        path?: PathViewDTO;
        degradedSteps?: Array<{ position: number; competencyKey: string }>;
        error?: string;
      };
      if (!response.ok || !data.path) {
        setPathError(data.error || "We couldn't generate a path for this plan.");
        return;
      }
      setPath(data.path);
      setDegradedStepCount(data.degradedSteps?.length ?? 0);
    } catch {
      setPathError("We couldn't generate a path for this plan.");
    } finally {
      setGeneratingPath(false);
    }
  }

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
        <Button as={Link} href="/reports" className="mt-5" color="primary">
          Back to your reports
        </Button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="text-[#9b2c2c]">{loadError}</p>
        <Button as={Link} href="/reports" className="mt-5" variant="light">
          Back to your reports
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
          href="/reports"
          variant="light"
          size="sm"
          startContent={<ArrowLeft className="h-4 w-4" />}
          className="-ml-2 self-start text-default-600 data-[hover=true]:bg-transparent"
        >
          Back to your reports
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
                <PathPanel planId={plan.id} path={path} />
                <DegradedStepsNote count={degradedStepCount} />
              </>
            ) : (
              <div className="rounded-2xl border border-[#dce8ed] bg-[#f8fbfc] p-5">
                <p className="text-sm text-[#385463]">
                  This plan doesn&apos;t have an improvement path yet.
                </p>
                <Button
                  className="mt-3"
                  color="primary"
                  size="sm"
                  isDisabled={generatingPath}
                  onPress={generatePathForPlan}
                >
                  {generatingPath ? <><Spinner color="current" size="sm" /> Generating path</> : "Generate a path"}
                </Button>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
