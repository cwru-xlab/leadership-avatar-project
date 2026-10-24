"use client";

/**
 * FIXED URL CONTRACT (Phase 23): `PathPanel` renders
 * `/study-plans/{planId}/drills/{stepId}` for every VOICE_DRILL step. Keyed
 * by STEP id; the drill is resolved server-side from the user-owned step.
 *
 * PLACEHOLDER: loads and shows the drill brief so the link resolves. The
 * spoken rep itself (camera + vocal/visual capture in the shared practice
 * shell, live tip, end-only grade) mounts here as `VoiceDrillRunner` once the
 * shared session shell lands — see components/study-plan/drill/contract.ts
 * and .planning/phases/23-learning-paths-hub/23-VOICE-DRILL-CONTRACT.md.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import DrillBrief from "@/components/study-plan/drill/DrillBrief";
import { fetchDrill, type DrillApiError } from "@/components/study-plan/drill/api";
import type { VoiceDrillDTO } from "@/lib/study-plan/drill/types";

export default function VoiceDrillPage() {
  const params = useParams<{ planId: string; stepId: string }>();
  const router = useRouter();
  const [drill, setDrill] = useState<VoiceDrillDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link
        href={`/study-plans/${params.planId}`}
        className="inline-flex items-center gap-1 text-sm text-[#58727f] hover:text-[#0a7391]"
      >
        <ArrowLeft size={14} aria-hidden="true" /> Back to the path
      </Link>
      <div className="mt-4">
        {error ? (
          <p role="alert" className="rounded-xl border border-[#f0c9c9] bg-[#fdf3f3] p-4 text-sm text-[#8a2b2b]">
            {error}
          </p>
        ) : drill ? (
          <>
            <DrillBrief drill={drill} />
            <p className="mt-4 text-sm text-[#58727f]">
              The spoken drill opens here in the practice session view (camera and voice analysis).
            </p>
          </>
        ) : (
          <p className="text-sm text-[#58727f]">Loading your drill…</p>
        )}
      </div>
    </div>
  );
}
