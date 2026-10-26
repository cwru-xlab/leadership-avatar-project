"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { ArrowLeft, Mic } from "lucide-react";

import CameraConsentStep from "@/components/session/CameraConsentStep";
import DrillBrief from "@/components/study-plan/drill/DrillBrief";
import DrillResult from "@/components/study-plan/drill/DrillResult";
import VoiceDrillRunner from "@/components/study-plan/drill/VoiceDrillRunner";
import { fetchDrill } from "@/components/study-plan/drill/api";
import type {
  DrillCoach,
  DrillDelivery,
} from "@/components/study-plan/drill/contract";
import { CONTRIBUTION_WEIGHTS } from "@/lib/mastery/weights";
import type { CameraMode } from "@/lib/metrics/types";
import type {
  VoiceDrillAttemptDTO,
  VoiceDrillDTO,
} from "@/lib/study-plan/drill/types";

/**
 * VOICE_DRILL flow: brief -> camera consent -> live rep (VoiceDrillRunner on
 * the shared session chrome) -> graded result. Two taps from the path to
 * speaking ("Start", then the camera choice); "Try again" goes straight back
 * into the room with the same camera choice. The runner stays mounted (hidden)
 * under the result so a retry reuses the live avatar session; it is remounted
 * only if that session died in the meantime.
 *
 * No numbers before the result; no gating — any drill can be redone at any
 * time, and each finished attempt counts as its own evidence.
 */

type Phase = "BRIEF" | "CONSENT" | "ROOM" | "RESULT";

interface GradedView {
  attempt: VoiceDrillAttemptDTO;
  delivery: DrillDelivery;
  previousScore: number | null;
}

export default function VoiceDrillShell({
  planId,
  stepId,
  initialDrill,
}: {
  planId: string;
  stepId: string;
  initialDrill: VoiceDrillDTO;
}) {
  const router = useRouter();
  const [drill, setDrill] = useState(initialDrill);
  const [phase, setPhase] = useState<Phase>("BRIEF");
  const [cameraMode, setCameraMode] = useState<CameraMode>("OFF");
  const [coach, setCoach] = useState<DrillCoach | null>(null);
  const [coachError, setCoachError] = useState(false);
  const [graded, setGraded] = useState<GradedView | null>(null);
  /** The rep counter the mounted runner follows (a retry increments it). */
  const [rep, setRep] = useState(0);
  const [retryFocus, setRetryFocus] = useState<string | null>(null);
  /** Remounts the runner — only when its avatar session has died. */
  const [repKey, setRepKey] = useState(0);
  const [stageLost, setStageLost] = useState(false);

  // The student's coach from Settings — the same identity coached mode uses.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/coach", { cache: "no-store", credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { coach?: DrillCoach };
        if (!data.coach) throw new Error("no coach");
        if (!cancelled) setCoach(data.coach);
      })
      .catch(() => {
        if (!cancelled) setCoachError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const worthPct = Math.round(
    (CONTRIBUTION_WEIGHTS.VOICE_DRILL / CONTRIBUTION_WEIGHTS.LIVE_SESSION) *
      100,
  );
  const lastScore = (() => {
    const done = drill.attempts.filter(
      (a) => a.completedAt !== null && a.score !== null,
    );
    return done.length > 0 ? done[done.length - 1].score : null;
  })();

  function handleGraded(
    attempt: VoiceDrillAttemptDTO,
    delivery: DrillDelivery,
  ): void {
    setGraded({ attempt, delivery, previousScore: lastScore });
    setPhase("RESULT");
    // Refresh the attempts list (the brief shows finished attempts).
    fetchDrill(stepId)
      .then(setDrill)
      .catch(() => undefined);
  }

  function handleTryAgain(): void {
    // The coach names ONE technique: the server's retry focus (the quoted
    // miss, else the technique the note is about), else the drill's own.
    setRetryFocus(
      graded?.attempt.retryFocus?.techniqueName ??
        drill.techniqueName ??
        null,
    );
    setGraded(null);
    if (stageLost) {
      setStageLost(false);
      setRepKey((k) => k + 1);
    }
    setRep((r) => r + 1);
    setPhase("ROOM");
  }

  const leaveHref = `/study-plans/${planId}`;

  const runner =
    (phase === "ROOM" || phase === "RESULT") && coach ? (
      <div
        className={phase === "ROOM" ? undefined : "hidden"}
        aria-hidden={phase !== "ROOM"}
      >
        <VoiceDrillRunner
          key={repKey}
          planId={planId}
          stepId={stepId}
          drill={drill}
          liveTip={drill.tipText}
          durationSeconds={drill.durationSeconds}
          cameraMode={cameraMode}
          coach={coach}
          rep={rep}
          active={phase === "ROOM"}
          retryFocus={retryFocus}
          onGraded={handleGraded}
          onExit={() => router.push(leaveHref)}
          onStageLost={() => setStageLost(true)}
        />
      </div>
    ) : null;

  // ONE tree shape for every phase: the runner keeps its position (and so its
  // mounted avatar session) when the result opens over it.
  return (
    <>
      {runner}
      {phase === "ROOM" ? null : (
        <div
          className="mx-auto max-w-3xl space-y-6 px-4 py-8"
          aria-live="polite"
        >
          <Button
            as={Link}
            href={leaveHref}
            variant="light"
            size="sm"
            startContent={<ArrowLeft className="h-4 w-4" />}
            className="-ml-2 self-start text-default-600 data-[hover=true]:bg-transparent"
          >
            Back to the path
          </Button>

          {phase === "RESULT" && graded ? (
            <DrillResult
              planId={planId}
              competencyLabel={drill.competencyLabel}
              attempt={graded.attempt}
              previousScore={graded.previousScore}
              delivery={graded.delivery}
              worthPct={worthPct}
              onTryAgain={handleTryAgain}
            />
          ) : phase === "CONSENT" && coach ? (
            <CameraConsentStep
              stepNumber={2}
              totalSteps={2}
              onBack={() => setPhase("BRIEF")}
              onLaunch={(mode) => {
                setCameraMode(mode);
                setPhase("ROOM");
              }}
              launchLabel={`Start with ${coach.name}`}
              sessionNoun="drill"
              cameraOnDescription="My camera and voice are analysed to give me delivery feedback with my drill result."
              cameraOffDescription="My voice is still analysed for my drill result; my camera isn't used, so visual delivery won't be described."
            />
          ) : (
            <>
              <DrillBrief drill={drill} />
              <div className="space-y-2 rounded-xl border border-[#dce8ed] bg-white p-5 text-sm leading-6 text-[#385463]">
                <p>
                  {coach ? coach.name : "My coach"} sets the scene out loud;
                  then I answer out loud and apply the technique above. No
                  score while I talk.
                </p>
                <p>
                  Worth: {worthPct}% of an unaided practice session toward{" "}
                  {drill.competencyLabel}.
                </p>
                <p className="flex items-center gap-1.5">
                  <Mic size={14} aria-hidden="true" /> I will need a
                  microphone.
                </p>
              </div>
              {coachError ? (
                <p role="alert" className="text-sm text-[#9b2c2c]">
                  We couldn&apos;t load my coach. Refresh the page to try
                  again.
                </p>
              ) : null}
              <Button
                color="primary"
                size="lg"
                isDisabled={!coach}
                onPress={() => setPhase("CONSENT")}
              >
                {drill.attempts.some((a) => a.completedAt !== null)
                  ? "Drill it again"
                  : "Start the drill"}
              </Button>
            </>
          )}
        </div>
      )}
    </>
  );
}
