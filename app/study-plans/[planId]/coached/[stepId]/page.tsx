"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@heroui/button";
import { ArrowLeft } from "lucide-react";

import CoachedSessionShell from "@/components/study-plan/CoachedSessionShell";
import { useLayout } from "@/lib/layout-context";

/**
 * FIXED URL CONTRACT shared with 21-19: `PathPanel` renders
 * `/study-plans/{planId}/coached/{stepId}` for every `COACHED_SESSION` path
 * step. Keyed by STEP id, not session id, because on first entry no session
 * exists yet — 21-23's POST (via `CoachedSessionShell`'s own first fetch)
 * creates it. Neither segment name may be renamed, and neither segment may
 * be changed to a session id.
 *
 * NO FETCHING, NO DATABASE ACCESS HERE. `CoachedSessionShell` owns the
 * entire session lifecycle (auth-gate-on-401, entry, leg reads, advance,
 * complete) — that keeps the leg state in exactly one place. This page's
 * only two jobs are: suppress the normal chrome (a live avatar conversation
 * inside a sidebar layout is a worse session), and offer a labelled way to
 * leave and come back, which works because 21-23's GET resumes from
 * whatever leg the student left on.
 *
 * NO PATH MUTATION. Step completion happens server-side inside
 * `finishCoachedSession`, called from `completeCoachedSession` — this page
 * calls no step-completion function and reaches no database client
 * directly.
 */
export default function CoachedSessionPage() {
  const params = useParams<{ planId: string; stepId: string }>();
  const { setFullScreen } = useLayout();

  const planId = params.planId;
  const stepId = params.stepId;

  // Chrome-suppressed for the whole page, same mechanism
  // `app/practice/[type]/[instanceId]/page.tsx` uses for its own live
  // session phase — set from THIS page, never by touching anything under
  // `app/practice/`.
  useEffect(() => {
    setFullScreen(true);
    return () => setFullScreen(false);
  }, [setFullScreen]);

  return (
    <div className="min-h-screen bg-[#f8fbfc]">
      <div className="mx-auto max-w-3xl px-4 pt-6">
        <Button
          as={Link}
          href="/reports"
          variant="light"
          size="sm"
          startContent={<ArrowLeft className="h-4 w-4" />}
          className="-ml-2 self-start text-default-600 data-[hover=true]:bg-transparent"
        >
          Leave coached session
        </Button>
        <p className="mt-1 text-xs text-[#58727f]">
          You can leave at any point — your coached session resumes right
          where you left it when you come back.
        </p>
      </div>

      <CoachedSessionShell planId={planId} stepId={stepId} />
    </div>
  );
}
