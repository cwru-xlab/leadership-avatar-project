"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";

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
 * only job is to suppress the normal chrome (a live avatar conversation
 * inside a sidebar layout is a worse session) and be the scroll container.
 * The labelled way to leave and come back is rendered by the shell; it works
 * because 21-23's GET resumes from whatever leg the student left on.
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
    // main-content.tsx sets overflow-hidden on <main> in full-screen mode and
    // serves every full-screen surface, so the scroll container lives here.
    // h-dvh rather than h-full: the percentage-height chain through the flex
    // ancestors is not guaranteed (not verified in a browser).
    <div className="h-dvh overflow-y-auto bg-canvas">
      {/* The labelled "Leave coached session" link lives in the shell: above
          the brief and camera step, and in the live room's header (Phase 22
          G4 — the live room is the shared dark session room, and a light bar
          above it would split the screen). */}
      <CoachedSessionShell planId={planId} stepId={stepId} />
    </div>
  );
}
