"use client";

/**
 * FIXED URL CONTRACT (Phase 23): `PathPanel` renders
 * `/study-plans/{planId}/drills/{stepId}` for every VOICE_DRILL step. Keyed
 * by STEP id; the drill is resolved server-side from the user-owned step.
 *
 * This page loads the brief (`fetchDrill`) and hands it to `VoiceDrillShell`
 * (brief -> camera consent -> live rep on the shared session chrome -> graded
 * result). Chrome-suppressed like the coached page, and the scroll container
 * lives here. Contract:
 * .planning/phases/23-learning-paths-hub/23-VOICE-DRILL-CONTRACT.md
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Spinner } from "@heroui/spinner";

import VoiceDrillShell from "@/components/study-plan/drill/VoiceDrillShell";
import { fetchDrill, type DrillApiError } from "@/components/study-plan/drill/api";
import { useLayout } from "@/lib/layout-context";
import type { VoiceDrillDTO } from "@/lib/study-plan/drill/types";

export default function VoiceDrillPage() {
  const params = useParams<{ planId: string; stepId: string }>();
  const router = useRouter();
  const { setFullScreen } = useLayout();
  const [drill, setDrill] = useState<VoiceDrillDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFullScreen(true);
    return () => setFullScreen(false);
  }, [setFullScreen]);

  useEffect(() => {
    let cancelled = false;
    fetchDrill(params.stepId)
      .then((d) => {
        if (!cancelled) setDrill(d);
      })
      .catch((e: DrillApiError) => {
        if (cancelled) return;
        if (e.status === 401) {
          router.push("/login");
          return;
        }
        setError(e.error ?? "Unable to load this voice drill.");
      });
    return () => {
      cancelled = true;
    };
  }, [params.stepId, router]);

  return (
    <div className="h-dvh overflow-y-auto bg-canvas">
      {drill ? (
        <VoiceDrillShell planId={params.planId} stepId={params.stepId} initialDrill={drill} />
      ) : (
        <div className="mx-auto max-w-3xl px-4 py-8">
          <Link
            href={`/study-plans/${params.planId}`}
            className="inline-flex items-center gap-1 text-sm text-muted hover:text-true-blue"
          >
            <ArrowLeft size={14} aria-hidden="true" /> Back to the path
          </Link>
          <div className="mt-6">
            {error ? (
              <p role="alert" className="rounded-xl border border-copper/30 bg-copper/8 p-4 text-sm text-copper">
                {error}
              </p>
            ) : (
              <div className="flex items-center gap-3 text-sm text-muted">
                <Spinner size="sm" /> Loading your drill…
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
