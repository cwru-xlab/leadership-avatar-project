"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";

import CoachAvatarStage, {
  type CoachAvatarHandle,
} from "@/components/study-plan/coached/CoachAvatarStage";
import CoachedBriefCard from "@/components/study-plan/coached/CoachedBriefCard";
import CoachedMomentPanel from "@/components/study-plan/coached/CoachedMomentPanel";
import { useCoachedPushToTalk } from "@/components/study-plan/coached/useCoachedPushToTalk";

/**
 * Coached session shell (Phase 22): brief -> consent -> guarded opening ->
 * coach-closed legs -> complete.
 *
 * The avatar mount follows 22-AVATAR-MOUNT-DECISION.md: a second mount of the
 * shared avatar primitive (`CoachAvatarStage`), never an import of the unaided
 * practice shell. The student answers aloud (`useCoachedPushToTalk`); there is
 * no typed path.
 *
 * This file owns STATE AND FLOW. The rendering below is a deliberately plain
 * single column; plan 22-15 replaces it with the real session layout (avatar
 * and push-to-talk integration, moment panel placement, demonstration card).
 * The seams it should use: `submitUtterance` (bind to the hook's
 * `onTranscript`), `stageRef`, `videoUnavailable`, and the leg view.
 *
 * FLOW
 * - The avatar is NOT mounted until the student presses the brief's button
 *   (`consented`, a UI-only flag, not a leg). Nothing speaks before consent.
 * - The coach's opening turn is requested exactly once per leg through
 *   `requestOpeningTurn`, which is ref-guarded and may be triggered by the
 *   stage becoming ready, the stage failing, or a fallback timeout. A video
 *   vendor that fails or never reports ready therefore cannot hang a session;
 *   the session continues as captions (degraded mode, not a design choice).
 * - The coach, not the student, closes a leg. No forward control exists until
 *   the server says `legReady`.
 *
 * STATE MACHINE: mirrors the server, never leads it. `legView` is taken from
 * server responses only (GET / POST / PATCH) and is never assigned from a
 * local literal; completing re-reads the server's view.
 */

// ---------------------------------------------------------------------------
// Client-side types mirroring lib/study-plan/coached/runtime.ts's
// `CoachedLegView`. NOT imported: that module is server-only (Prisma, S3).
// ---------------------------------------------------------------------------

interface CoachedTipDTO {
  id: string;
  name: string;
  reminder: string;
}

interface CoachedMomentDTO {
  counterpartLine: string | null;
  studentLine: string;
  sourceReportId: string;
  turnIndex: number;
  sessionDate: string;
}

interface CoachedTurnDTO {
  seq: number;
  speaker: "COACH" | "STUDENT";
  move: string;
  text: string;
  demonstration: string | null;
  score: number | null;
  acceptable: boolean | null;
  parroted: boolean | null;
}

interface CoachedLegDTO {
  coachedSessionId: string;
  leg: "REPLAY" | "FRESH" | "COMPLETE";
  legCount: 1 | 2;
  thinEvidence: boolean;
  competencyKey: string;
  competencyLabel: string;
  competencyDescription: string;
  coach: { name: string; avatarId: string; voiceId: string; isDefault: boolean };
  moment: CoachedMomentDTO | null;
  conversation: CoachedTurnDTO[];
  awaiting: "REPLY" | "ATTEMPT" | "NONE" | null;
  legReady: boolean;
  attemptsInLeg: number;
  tips: CoachedTipDTO[];
  underlyingTypeSlug: string;
  underlyingTypeName: string;
  worth: { coachedWeight: number; unaidedWeight: number };
  selectionBasis: "PER_TURN_SCORE" | "GROWTH_AREA_FALLBACK";
  momentFraming: "REWORK" | "REFINEMENT";
}

interface CoachTurnDTO {
  speech: string;
  move: string;
  awaiting: "REPLY" | "ATTEMPT" | "NONE";
  demonstration: string | null;
  closedAtSoftCap: boolean;
}

type UiPhase = "LOADING" | "NEEDS_LOGIN" | "NOT_FOUND" | "ENTRY_ERROR" | "READY";

export interface CoachedSessionShellProps {
  planId: string;
  stepId: string;
}

/** Provisional until calibrated against real vendor connect times. */
const OPENING_FALLBACK_MS = 15_000;
/** Upper bound on waiting for the avatar to finish a line before the next. */
const SPEECH_WAIT_MAX_MS = 45_000;

export default function CoachedSessionShell({ stepId }: CoachedSessionShellProps) {
  const coachedUrl = `/api/study-plans/path-steps/${stepId}/coached`;

  const [uiPhase, setUiPhase] = useState<UiPhase>("LOADING");
  const [entryError, setEntryError] = useState<string | null>(null);
  const [legView, setLegView] = useState<CoachedLegDTO | null>(null);

  // UI-only flow state (none of these is a leg).
  const [consented, setConsented] = useState(false);
  const [videoUnavailable, setVideoUnavailable] = useState(false);
  const [coachBusy, setCoachBusy] = useState(false);
  const [finishingLeg, setFinishingLeg] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [latestDemonstration, setLatestDemonstration] = useState<string | null>(null);

  const stageRef = useRef<CoachAvatarHandle>(null);
  const stageReadyRef = useRef(false);
  const openingRequestedRef = useRef(false);
  const openingTimerRef = useRef<number | null>(null);
  const turnInFlightRef = useRef(false);

  /**
   * Reads (or, on first entry, enters) the step's coached session. The only
   * writer of `legView` besides the PATCH responses that return a leg.
   */
  const refreshLeg = useCallback(
    async (opts?: { allowCreate?: boolean }): Promise<void> => {
      const response = await fetch(coachedUrl, {
        method: opts?.allowCreate ? "POST" : "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (response.status === 401) {
        setUiPhase("NEEDS_LOGIN");
        return;
      }
      if (response.status === 404) {
        if (!opts?.allowCreate) {
          // No session yet. A GET never creates one, so this is the one retry.
          await refreshLeg({ allowCreate: true });
          return;
        }
        setUiPhase("NOT_FOUND");
        return;
      }
      if (response.status === 409) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setEntryError(data.error ?? "The original session's transcript could not be read.");
        setUiPhase("ENTRY_ERROR");
        return;
      }
      if (!response.ok) {
        setEntryError("Unable to load this coached step.");
        setUiPhase("ENTRY_ERROR");
        return;
      }

      const data = (await response.json()) as { leg: CoachedLegDTO };
      setLegView(data.leg);
      setUiPhase("READY");
    },
    [coachedUrl],
  );

  useEffect(() => {
    void refreshLeg();
    // Mount only: `refreshLeg` closes over `coachedUrl`, which never changes
    // for a mounted shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stop the avatar session when the shell unmounts (the stage also stops
  // itself on unmount; this covers the handle being held past it).
  useEffect(() => {
    return () => {
      if (openingTimerRef.current !== null) window.clearTimeout(openingTimerRef.current);
      stageRef.current?.stop();
    };
  }, []);

  // -------------------------------------------------------------------------
  // Coach turns
  // -------------------------------------------------------------------------

  /** Speaks a coach turn through the avatar when it is live; otherwise the
   * text is already on screen as a caption and nothing is spoken. */
  async function voiceCoachTurn(turn: CoachTurnDTO): Promise<void> {
    setLatestDemonstration(turn.demonstration);
    const stage = stageRef.current;
    if (!stage || !stage.isReady()) return;
    stage.speak(turn.speech);
    if (turn.demonstration) {
      await stage.waitForSpeechEnd(SPEECH_WAIT_MAX_MS);
      if (stage.isReady()) stage.speak(turn.demonstration);
    }
  }

  /** Reads a non-ok PATCH response: a 409 resynchronizes from the server. */
  async function handlePatchFailure(
    response: Response,
    fallbackMessage: string,
  ): Promise<void> {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (response.status === 409) {
      await refreshLeg();
      return;
    }
    setLiveError(data.error ?? fallbackMessage);
  }

  /**
   * Asks the coach to open (or resume) the current leg. Idempotent per leg:
   * the ref makes any second trigger a no-op, so the stage becoming ready,
   * the stage failing and the fallback timeout can all call it safely.
   */
  async function requestOpeningTurn(): Promise<void> {
    if (openingRequestedRef.current) return;
    openingRequestedRef.current = true;
    setCoachBusy(true);
    setLiveError(null);
    try {
      const response = await fetch(coachedUrl, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "turn" }),
      });
      if (!response.ok) {
        // Let the student retry the opening rather than sit on a dead session.
        openingRequestedRef.current = false;
        await handlePatchFailure(response, "Your coach could not start. Please try again.");
        return;
      }
      const data = (await response.json()) as { coachTurn: CoachTurnDTO; leg: CoachedLegDTO };
      setLegView(data.leg);
      await voiceCoachTurn(data.coachTurn);
    } catch {
      openingRequestedRef.current = false;
      setLiveError("We couldn't reach the server. Please try again.");
    } finally {
      setCoachBusy(false);
    }
  }

  async function submitUtterance(utterance: {
    text: string;
    spokenDurationMs: number;
  }): Promise<void> {
    if (turnInFlightRef.current) return;
    turnInFlightRef.current = true;
    setCoachBusy(true);
    setLiveError(null);
    try {
      const response = await fetch(coachedUrl, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "turn", utterance }),
      });
      if (!response.ok) {
        await handlePatchFailure(response, "The coach could not respond. Please try again.");
        return;
      }
      const data = (await response.json()) as { coachTurn: CoachTurnDTO; leg: CoachedLegDTO };
      setLegView(data.leg);
      await voiceCoachTurn(data.coachTurn);
    } catch {
      setLiveError("We couldn't reach the server. Please try again.");
    } finally {
      turnInFlightRef.current = false;
      setCoachBusy(false);
    }
  }

  // Stage callbacks. All three opening triggers are only reachable after
  // consent: the stage is not mounted before it, and the timer starts in the
  // consent handler.
  function handleStageReady(): void {
    stageReadyRef.current = true;
    if (openingTimerRef.current !== null) {
      window.clearTimeout(openingTimerRef.current);
      openingTimerRef.current = null;
    }
    void requestOpeningTurn();
  }

  function handleStageError(): void {
    stageReadyRef.current = false;
    setVideoUnavailable(true);
    void requestOpeningTurn();
  }

  function handleConsent(): void {
    setConsented(true);
    if (openingTimerRef.current !== null) window.clearTimeout(openingTimerRef.current);
    openingTimerRef.current = window.setTimeout(() => {
      openingTimerRef.current = null;
      if (stageReadyRef.current) return;
      setVideoUnavailable(true);
      void requestOpeningTurn();
    }, OPENING_FALLBACK_MS);
  }

  // -------------------------------------------------------------------------
  // Leg close: the coach closed it (legReady), the student confirms moving on.
  // -------------------------------------------------------------------------

  /** First leg -> second leg. Only offered when the server says legReady. */
  async function handleAdvance(): Promise<void> {
    if (!legView || !legView.legReady || finishingLeg) return;
    setFinishingLeg(true);
    setLiveError(null);
    try {
      const response = await fetch(coachedUrl, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advance" }),
      });
      if (!response.ok) {
        await handlePatchFailure(response, "Unable to move to the second moment.");
        return;
      }
      const data = (await response.json()) as { leg: CoachedLegDTO };
      setLegView(data.leg);
      setLatestDemonstration(null);
      // New leg, new opening. The stage stays mounted across legs.
      openingRequestedRef.current = false;
      await requestOpeningTurn();
    } catch {
      setLiveError("We couldn't reach the server. Please try again.");
    } finally {
      setFinishingLeg(false);
    }
  }

  /** Last leg -> complete. Only offered when the server says legReady. */
  async function handleComplete(): Promise<void> {
    if (!legView || !legView.legReady || finishingLeg) return;
    setFinishingLeg(true);
    setLiveError(null);
    try {
      const response = await fetch(coachedUrl, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      if (!response.ok) {
        await handlePatchFailure(response, "Unable to finish this coached session.");
        return;
      }
      stageRef.current?.stop();
      // Mirror the server: the finished view is read back, not assigned.
      await refreshLeg();
    } catch {
      setLiveError("We couldn't reach the server. Please try again.");
    } finally {
      setFinishingLeg(false);
    }
  }

  // -------------------------------------------------------------------------
  // Spoken answers (minimal wiring; 22-15 places the controls)
  // -------------------------------------------------------------------------

  const canSpeak =
    consented &&
    legView !== null &&
    legView.leg !== "COMPLETE" &&
    !legView.legReady &&
    legView.awaiting !== "NONE" &&
    legView.conversation.length > 0 &&
    !coachBusy &&
    !finishingLeg;

  const pushToTalk = useCoachedPushToTalk({
    enabled: canSpeak,
    onBeforeRecord: () => stageRef.current?.interrupt(),
    onTranscript: (t) => {
      void submitUtterance({ text: t.text, spokenDurationMs: Math.round(t.durationMs) });
    },
  });

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (uiPhase === "LOADING") {
    return (
      <div className="flex flex-col items-center gap-3 py-16" aria-live="polite">
        <Spinner size="lg" />
        <p className="text-sm text-[#58727f]">Your coach is choosing the moment to work on…</p>
      </div>
    );
  }

  if (uiPhase === "NEEDS_LOGIN") {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="text-[#385463]">Sign in to start this coached session.</p>
        <Button as={Link} href="/login" className="mt-5" color="primary">
          Go to sign in
        </Button>
      </div>
    );
  }

  if (uiPhase === "NOT_FOUND") {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="text-[#385463]">This coached step is not available.</p>
        <Button as={Link} href="/reports" className="mt-5" color="primary">
          Back to your study plan
        </Button>
      </div>
    );
  }

  if (uiPhase === "ENTRY_ERROR" || !legView) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="text-[#9b2c2c]" role="alert">
          {entryError ?? "Unable to load this coached step."}
        </p>
        <Button as={Link} href="/reports" className="mt-5" variant="light">
          Back to your study plan
        </Button>
      </div>
    );
  }

  if (legView.leg === "COMPLETE") {
    return (
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8" aria-live="polite">
        <CompleteLeg legView={legView} />
      </div>
    );
  }

  if (!consented) {
    const moment = legView.moment;
    return (
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8" aria-live="polite">
        {moment ? (
          <CoachedBriefCard
            coachName={legView.coach.name}
            competencyLabel={legView.competencyLabel}
            competencyDescription={legView.competencyDescription}
            moment={{
              counterpartLine: moment.counterpartLine,
              studentLine: moment.studentLine,
              sessionDate: moment.sessionDate,
            }}
            momentFraming={legView.momentFraming}
            legCount={legView.legCount}
            worth={legView.worth}
            onStart={handleConsent}
            starting={false}
            resuming={legView.conversation.length > 0}
          />
        ) : null}
      </div>
    );
  }

  const moment = legView.moment;
  const coachTurns = legView.conversation.filter((turn) => turn.speaker === "COACH");
  const latestCoachTurn = coachTurns.length > 0 ? coachTurns[coachTurns.length - 1] : null;
  const attempts = legView.conversation
    .filter((turn) => turn.speaker === "STUDENT" && turn.move === "ATTEMPT")
    .map((turn) => ({ text: turn.text, acceptable: turn.acceptable, parroted: turn.parroted }));
  const secondMomentNext = legView.leg === "REPLAY" && legView.legCount === 2;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8" aria-live="polite">
      <section aria-labelledby="coached-session-heading" className="space-y-5">
        <div>
          <h1 id="coached-session-heading" className="font-serif text-2xl text-[#102331]">
            {legView.competencyLabel}
          </h1>
          {legView.thinEvidence ? (
            <p className="mt-1 text-sm text-[#385463]">
              This session has one part: there was not a second moment clear enough to use.
            </p>
          ) : null}
          {videoUnavailable ? (
            <p className="mt-1 text-sm text-[#385463]" role="status">
              The video coach couldn&apos;t connect, so your coach will continue in text.
            </p>
          ) : null}
        </div>

        <CoachAvatarStage
          ref={stageRef}
          coach={legView.coach}
          onReady={handleStageReady}
          onError={handleStageError}
        />

        <div className="rounded-xl border border-[#dce8ed] bg-[#f8fbfc] p-4" aria-live="polite">
          <p className="text-xs font-bold uppercase tracking-wide text-[#58727f]">
            {legView.coach.name}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#173847]">
            {latestCoachTurn ? latestCoachTurn.text : "Your coach is getting ready…"}
          </p>
          {latestDemonstration ? (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#385463]">
              {latestDemonstration}
            </p>
          ) : null}
        </div>

        {moment ? (
          <CoachedMomentPanel
            counterpartLine={moment.counterpartLine}
            studentLine={moment.studentLine}
            attempts={attempts}
            sessionLink={`/practice/${legView.underlyingTypeSlug}/report/${moment.sourceReportId}`}
          />
        ) : null}

        {!legView.legReady ? (
          <div className="space-y-2">
            <Button
              color="primary"
              isDisabled={!canSpeak || pushToTalk.isTranscribing}
              onPressStart={() => void pushToTalk.startRecording()}
              onPressEnd={() => void pushToTalk.stopRecording()}
            >
              {pushToTalk.isRecording
                ? "Listening… release to send"
                : pushToTalk.isTranscribing || coachBusy
                  ? "Working…"
                  : "Hold to speak"}
            </Button>
            {pushToTalk.partialTranscript ? (
              <p className="text-sm text-[#58727f]">{pushToTalk.partialTranscript}</p>
            ) : null}
            {pushToTalk.micUnavailable ? (
              <p className="text-sm text-[#9b2c2c]" role="alert">
                Your microphone isn&apos;t available. Allow microphone access to continue.
              </p>
            ) : pushToTalk.error ? (
              <p className="text-sm text-[#9b2c2c]" role="alert">
                {pushToTalk.error}
              </p>
            ) : null}
          </div>
        ) : null}

        {liveError ? (
          <p className="text-sm text-[#9b2c2c]" role="alert">
            {liveError}
          </p>
        ) : null}

        <TipRail tips={legView.tips} />

        {legView.legReady ? (
          <Button
            color="primary"
            isDisabled={finishingLeg}
            onPress={secondMomentNext ? handleAdvance : handleComplete}
          >
            {finishingLeg ? (
              <Spinner size="sm" />
            ) : secondMomentNext ? (
              "Continue to your second moment"
            ) : (
              "Finish session"
            )}
          </Button>
        ) : null}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tip rail — technique reminders, visually separate from the student's own
// input/speaking area, rendering ONLY what the server already gated
// (REQ-115).
// ---------------------------------------------------------------------------

function TipRail({ tips }: { tips: CoachedTipDTO[] }) {
  return (
    <aside
      aria-label="Technique reminders"
      className="space-y-3 rounded-xl border border-[#dce8ed] bg-[#fbfdfe] p-4"
    >
      <p className="text-xs font-bold uppercase tracking-wide text-[#58727f]">
        Technique reminders
      </p>
      {/*
        The one allowed explanatory literal (plan 21-24's contract line) —
        this names the skill, never scripts the words. There is exactly
        one sentence like this in this file, and it is not a tip.
      */}
      <p className="text-xs leading-5 text-[#58727f]">
        These name a technique to apply — they are not words to say.
      </p>
      {tips.length === 0 && (
        <p className="text-xs text-[#58727f]">No reminders for this leg.</p>
      )}
      {/*
        Render ONLY what the server sent. Every `tip.reminder` below is read
        directly off the server response — never composed, templated,
        interpolated, concatenated, or defaulted. 21-23's `tipsForLeg` ran
        `assertTipSafe` over every one of these before sending it; a tip
        assembled in this view would have passed no gate at all.
      */}
      <ul className="space-y-3">
        {tips.map((tip) => (
          <li key={tip.id} className="rounded-lg bg-white p-3 shadow-sm">
            <p className="text-sm font-semibold text-[#102331]">{tip.name}</p>
            <p className="mt-1 text-sm leading-5 text-[#385463]">{tip.reminder}</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// COMPLETE
// ---------------------------------------------------------------------------

function CompleteLeg({ legView }: { legView: CoachedLegDTO }) {
  const pct = Math.round((legView.worth.coachedWeight / legView.worth.unaidedWeight) * 100);
  return (
    <section aria-labelledby="coached-complete-heading" className="space-y-5 text-center">
      <h1 id="coached-complete-heading" className="font-serif text-2xl text-[#102331]">
        Session complete.
      </h1>
      <p className="text-sm leading-6 text-[#385463]">
        Your coach graded your reworked lines, and {legView.competencyLabel} moved at the coached
        weight ({pct}% of an unaided session).
      </p>
      <div className="flex justify-center gap-3">
        <Button as={Link} href="/mastery" color="primary">
          View your mastery
        </Button>
        <Button as={Link} href="/reports" variant="light">
          Back to your reports
        </Button>
      </div>
    </section>
  );
}
