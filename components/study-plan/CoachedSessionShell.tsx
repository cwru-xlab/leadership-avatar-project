"use client";

import BackLink from "@/components/shell/BackLink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { ChevronLeft, Sparkles, Volume2 } from "lucide-react";

import type { InteractiveAvatarRef } from "@/components/HeyGenAvatar/InteractiveAvatar";
import { StreamingAvatarSessionState } from "@/components/HeyGenAvatar/logic";
import CameraConsentStep from "@/components/session/CameraConsentStep";
import { FaceDetectionBanner } from "@/components/session/FaceDetectionBanner";
import { SelfViewThumbnail } from "@/components/session/SelfViewThumbnail";
import { SessionAvatar, useAvatarKeepAlive } from "@/components/session/SessionAvatar";
import {
  PushToTalkControl,
  SessionLiveBadge,
  SessionRoom,
  SessionSidePane,
  SessionStageHeader,
  SessionStagePane,
  SessionStatus,
} from "@/components/session/SessionRoom";
import { usePushToTalkRecorder } from "@/components/session/usePushToTalkRecorder";
import { useSyncVisualSpeaking, useVisualCapture } from "@/components/session/useVisualCapture";
import CoachedBriefCard from "@/components/study-plan/coached/CoachedBriefCard";
import CoachedMomentPanel from "@/components/study-plan/coached/CoachedMomentPanel";
import DeliveryBandsCard, { type DeliveryCapture } from "@/components/study-plan/DeliveryBandsCard";
import { useNextStepHref } from "@/components/study-plan/useNextStepHref";
import { diagnoseDelivery } from "@/lib/study-plan/delivery-diagnosis";
import type { CompetencyKey } from "@/lib/mastery/competencies";
import type { CameraMode, VocalMetrics } from "@/lib/metrics/types";
import type { StartAvatarRequest } from "@/types";

/** Coached mode scores no visuals live; the banner says what is really affected. */
const COACHED_FACE_BANNER_DETAIL =
  "Move back into frame so your end-of-session delivery feedback can include visuals.";

/**
 * Coached session shell (Phase 22): brief -> camera consent -> guarded
 * opening -> coach-closed legs -> graded summary.
 *
 * SHARED SHELL (22-SHARED-SHELL-DECISION.md, superseding
 * 22-AVATAR-MOUNT-DECISION.md): the live room is built from the same session
 * chrome the interview/practice shell uses — `components/session/` — not a
 * second copy of it: the camera consent step, the avatar stage and keep-alive,
 * the push-to-talk recorder with vocal capture, the
 * self-view with face detection and visual capture, and the room layout. The
 * coach layer itself stays server-side in `lib/study-plan/coached/`; nothing
 * from the practice component tree is imported here.
 *
 * FLOW
 * - The avatar is NOT mounted until the student has read the brief AND made
 *   the camera choice (`consented`, a UI-only flag, not a leg). Nothing speaks
 *   before consent.
 * - The coach's opening turn is requested exactly once per leg through
 *   `requestOpeningTurn` (ref-guarded). Like practice, it starts when the
 *   avatar stage reaches CONNECTED (G2). It starts without video only on a
 *   definitive vendor failure (`handleStageError`) or when the student
 *   explicitly chooses to continue without video after a slow connect
 *   (`handleContinueWithoutVideo`) — never from a silent timeout.
 * - Coach speech that arrives while the stage is not connected is QUEUED, not
 *   dropped, and is spoken the moment the stage connects (G2).
 * - The coach, not the student, closes a leg. No forward control exists until
 *   the server says `legReady`.
 * - Technique reminders are shown live; numeric grades are not. The server
 *   withholds every per-attempt score until the session is COMPLETE, and only
 *   then does the graded summary render (user decision 2026-10-24).
 *
 * STATE MACHINE: mirrors the server, never leads it. `legView` is taken from
 * server responses only (GET / POST / PATCH) and is never assigned from a
 * local literal; completing re-reads the server's view.
 *
 * REQ-85: no live meter, level indicator or score is rendered while the
 * session runs. Delivery metrics appear only in the end-of-session summary.
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
  /** Always null mid-session — numeric grades only at the end. */
  score: number | null;
  acceptable: boolean | null;
  parroted: boolean | null;
}

interface CoachedLegSummaryDTO {
  leg: "REPLAY" | "FRESH";
  moment: CoachedMomentDTO;
  originalScore: number | null;
  attempts: Array<{
    text: string;
    score: number | null;
    acceptable: boolean | null;
    parroted: boolean | null;
    /** Did not answer this moment's question. */
    offTopic?: boolean;
  }>;
  gradedScore: number | null;
  gradedAttemptText: string | null;
  closedAtSoftCap: boolean;
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
  summary: { legs: CoachedLegSummaryDTO[]; completedAt: string | null } | null;
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

/**
 * After this long without CONNECTED, the student is OFFERED a captions-only
 * session. It no longer starts one on its own: an opening requested before
 * CONNECTED was the G2 silent-coach defect.
 */
const SLOW_CONNECT_NOTICE_MS = 15_000;
/** Upper bound on waiting for the avatar to finish a line before the next. */
const SPEECH_WAIT_MAX_MS = 45_000;

const DEMONSTRATION_DISCLOSURE =
  "This is one version your coach said out loud — a separate thing from the technique tips. Now say it your own way.";

/** Leaving returns to the plan the step belongs to; the session resumes on return. */
function leaveHref(planId: string): string {
  return `/study-plans/${planId}`;
}

export default function CoachedSessionShell({ planId, stepId }: CoachedSessionShellProps) {
  const coachedUrl = `/api/study-plans/path-steps/${stepId}/coached`;

  const [uiPhase, setUiPhase] = useState<UiPhase>("LOADING");
  const [entryError, setEntryError] = useState<string | null>(null);
  const [legView, setLegView] = useState<CoachedLegDTO | null>(null);

  // UI-only flow state (none of these is a leg).
  const [cameraStepOpen, setCameraStepOpen] = useState(false);
  const [consented, setConsented] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>("OFF");
  const [stageReady, setStageReady] = useState(false);
  const [videoUnavailable, setVideoUnavailable] = useState(false);
  const [slowConnect, setSlowConnect] = useState(false);
  const [coachBusy, setCoachBusy] = useState(false);
  const [finishingLeg, setFinishingLeg] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [talkError, setTalkError] = useState<string | null>(null);
  const [latestDemonstration, setLatestDemonstration] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [delivery, setDelivery] = useState<DeliveryCapture | null>(null);

  const avatarRef = useRef<InteractiveAvatarRef>(null);
  const stageReadyRef = useRef(false);
  const cameraModeRef = useRef<CameraMode>("OFF");
  const sessionStartedAtRef = useRef<number | null>(null);
  const openingRequestedRef = useRef(false);
  const slowConnectTimerRef = useRef<number | null>(null);
  const turnInFlightRef = useRef(false);
  /** The latest coach turn that could not be voiced yet (stage not connected). */
  const pendingSpeechRef = useRef<CoachTurnDTO | null>(null);
  /** Metrics collected for the complete PATCH; kept so a retry resends them. */
  const collectedMetricsRef = useRef<DeliveryCapture | null>(null);
  const captionsEndRef = useRef<HTMLDivElement>(null);

  // Shared camera self-view + visual capture.
  const {
    cameraStream,
    faceMissing,
    startVisualCapture,
    stopVisualCapture,
    releaseVisualCapture,
    syncSpeaking,
  } = useVisualCapture();

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

  // Keep the latest caption in view inside the conversation pane.
  const conversationLength = legView?.conversation.length ?? 0;
  useEffect(() => {
    captionsEndRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [conversationLength]);

  const sessionRunning = consented && legView !== null && legView.leg !== "COMPLETE";

  // Elapsed clock, same rendering as the practice room's status chip.
  useEffect(() => {
    if (!sessionRunning) return;
    const interval = window.setInterval(() => {
      if (sessionStartedAtRef.current === null) return;
      setElapsedSeconds(Math.floor((Date.now() - sessionStartedAtRef.current) / 1000));
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [sessionRunning]);

  // Keep the avatar session alive while connected (shared keep-alive).
  useAvatarKeepAlive(avatarRef, stageReady && sessionRunning);

  const avatarConfig = useMemo<StartAvatarRequest | null>(() => {
    if (!legView) return null;
    return {
      quality: "low",
      avatarName: legView.coach.avatarId,
      knowledgeId: undefined,
      voice: { rate: 1.0, voiceId: legView.coach.voiceId, emotion: undefined },
      language: "en",
    } as StartAvatarRequest;
    // Keyed on the coach identity only, so a new leg view never restarts the avatar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legView?.coach.avatarId, legView?.coach.voiceId]);

  // -------------------------------------------------------------------------
  // Coach turns
  // -------------------------------------------------------------------------

  /**
   * Speaks a coach turn through the avatar. If the stage is not connected the
   * turn is QUEUED (latest wins) and spoken by `flushPendingSpeech` the moment
   * it connects — never silently dropped (G2). The text is on screen as a
   * caption either way.
   */
  async function voiceCoachTurn(turn: CoachTurnDTO): Promise<void> {
    setLatestDemonstration(turn.demonstration);
    const avatar = avatarRef.current;
    if (!avatar || !stageReadyRef.current) {
      pendingSpeechRef.current = turn;
      return;
    }
    pendingSpeechRef.current = null;
    avatar.speak(turn.speech);
    if (turn.demonstration) {
      await avatar.waitForSpeechEnd(SPEECH_WAIT_MAX_MS);
      if (stageReadyRef.current) avatarRef.current?.speak(turn.demonstration);
    }
  }

  function flushPendingSpeech(): void {
    const pending = pendingSpeechRef.current;
    if (pending) void voiceCoachTurn(pending);
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
   * the ref makes any second trigger a no-op.
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

  /** Starts the shared visual capture once, when the student chose camera ON. */
  function startCaptureIfAllowed(): void {
    if (cameraModeRef.current !== "ON") return;
    startVisualCapture(() => sessionStartedAtRef.current ?? Date.now());
  }

  // Stage callbacks. Every opening trigger is only reachable after consent:
  // the stage is not mounted before it.

  /** CONNECTED — the same moment practice starts its opening turn. */
  function handleStageReady(): void {
    if (stageReadyRef.current) return;
    stageReadyRef.current = true;
    setStageReady(true);
    setSlowConnect(false);
    setVideoUnavailable(false);
    if (slowConnectTimerRef.current !== null) {
      window.clearTimeout(slowConnectTimerRef.current);
      slowConnectTimerRef.current = null;
    }
    // Capture starts after the avatar has connected, never before, so it
    // cannot delay the avatar handshake (REQ-49) — exactly as in practice.
    startCaptureIfAllowed();
    // A turn that arrived while the stage was down is spoken now.
    flushPendingSpeech();
    void requestOpeningTurn();
  }

  function handleStageInactive(): void {
    stageReadyRef.current = false;
    setStageReady(false);
  }

  /** The vendor definitively failed: degraded captions mode, not a design choice. */
  function handleStageError(): void {
    stageReadyRef.current = false;
    setStageReady(false);
    setVideoUnavailable(true);
    startCaptureIfAllowed();
    void requestOpeningTurn();
  }

  /** The student chose not to wait for a slow video connection. */
  function handleContinueWithoutVideo(): void {
    setSlowConnect(false);
    setVideoUnavailable(true);
    startCaptureIfAllowed();
    void requestOpeningTurn();
  }

  // The avatar reports state through one stable callback, so a re-render can
  // never re-report CONNECTED; it dispatches to the current handlers.
  const stageHandlersRef = useRef({ ready: handleStageReady, inactive: handleStageInactive });
  stageHandlersRef.current = { ready: handleStageReady, inactive: handleStageInactive };
  const handleAvatarStateChange = useCallback((state: StreamingAvatarSessionState) => {
    if (state === StreamingAvatarSessionState.CONNECTED) stageHandlersRef.current.ready();
    else if (state === StreamingAvatarSessionState.INACTIVE) stageHandlersRef.current.inactive();
  }, []);
  const stageErrorRef = useRef(handleStageError);
  stageErrorRef.current = handleStageError;
  const handleAvatarTokenError = useCallback(() => stageErrorRef.current(), []);

  /** Brief and camera choice done: mount the room. Does not request the opening. */
  function handleConsent(mode: CameraMode): void {
    cameraModeRef.current = mode;
    setCameraMode(mode);
    sessionStartedAtRef.current = Date.now();
    setElapsedSeconds(0);
    setConsented(true);
    if (slowConnectTimerRef.current !== null) window.clearTimeout(slowConnectTimerRef.current);
    slowConnectTimerRef.current = window.setTimeout(() => {
      slowConnectTimerRef.current = null;
      if (!stageReadyRef.current) setSlowConnect(true);
    }, SLOW_CONNECT_NOTICE_MS);
  }

  // -------------------------------------------------------------------------
  // Spoken answers — the shared push-to-talk recorder (no typed path).
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

  /** Live mirror of `!canSpeak`: refuses a recording start (the recorder's lock). */
  const talkLockRef = useRef(true);
  talkLockRef.current = !canSpeak;

  const submitUtteranceRef = useRef(submitUtterance);
  submitUtteranceRef.current = submitUtterance;
  const handleTranscript = useCallback((transcript: string, elapsedMs: number) => {
    setTalkError(null);
    return submitUtteranceRef.current({
      text: transcript.trim(),
      spokenDurationMs: Math.round(elapsedMs),
    });
  }, []);

  const {
    isRecording,
    isTranscribing,
    partialTranscript,
    startRecording,
    stopRecording,
    toggleRecording,
    releaseMicrophone,
    vocalCaptureRef,
  } = usePushToTalkRecorder({
    language: "en",
    sending: coachBusy || finishingLeg,
    isPaused: !canSpeak,
    lockRef: talkLockRef,
    onTranscript: handleTranscript,
    onRecordingStarted: () => setTalkError(null),
    // Recording is validly claimed: cut the coach off now.
    onRecordingClaimed: () => avatarRef.current?.interrupt(),
    onRejected: (reason) =>
      setTalkError(
        reason === "too-short"
          ? "Nothing was recorded. Tap the microphone, speak, then tap again to send."
          : "No speech was detected. Check that the right microphone is selected and not muted.",
      ),
    onTranscriptionFailed: (error) => {
      console.error("Coached transcription failed:", error);
      setTalkError("Could not transcribe your answer. Please try again.");
    },
    onMicrophoneUnavailable: (error) => {
      console.error("Microphone unavailable:", error);
      setTalkError(
        "A microphone is required for coached sessions because the rework is spoken. Allow microphone access and try again.",
      );
    },
    audioFileName: "coached-answer.webm",
    stampVocalTurnStart: true,
  });

  // Unmount: release the microphone, the camera and the avatar. Declared
  // as in practice.
  useEffect(() => {
    return () => {
      if (slowConnectTimerRef.current !== null) window.clearTimeout(slowConnectTimerRef.current);
      releaseMicrophone();
      releaseVisualCapture();
      vocalCaptureRef.current?.detachStream();
      avatarRef.current?.stopSession();
    };
  }, [releaseMicrophone, releaseVisualCapture, vocalCaptureRef]);

  useSyncVisualSpeaking(syncSpeaking, isRecording);

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

  /**
   * Stops the shared capture and collects its metrics, once — the same
   * stop-then-finish order the practice shell uses, so the metrics ride in the
   * finish request. A retry after a failed PATCH reuses what was collected.
   */
  async function collectDeliveryMetrics(): Promise<DeliveryCapture> {
    if (collectedMetricsRef.current) return collectedMetricsRef.current;
    // Both stops are bounded and never throw by contract.
    const visual = await stopVisualCapture();
    let vocal: VocalMetrics | null = null;
    try {
      vocal = (await vocalCaptureRef.current?.drain()) ?? null;
    } catch {
      vocal = null;
    }
    const collected = { cameraMode: cameraModeRef.current, visual, vocal };
    collectedMetricsRef.current = collected;
    return collected;
  }

  /** Last leg -> complete. Only offered when the server says legReady. */
  async function handleComplete(): Promise<void> {
    if (!legView || !legView.legReady || finishingLeg) return;
    setFinishingLeg(true);
    setLiveError(null);
    try {
      const metrics = await collectDeliveryMetrics();
      const response = await fetch(coachedUrl, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", metrics }),
      });
      if (!response.ok) {
        await handlePatchFailure(response, "Unable to finish this coached session.");
        return;
      }
      setDelivery(metrics);
      releaseMicrophone();
      releaseVisualCapture();
      vocalCaptureRef.current?.detachStream();
      avatarRef.current?.stopSession();
      // Mirror the server: the finished view is read back, not assigned.
      await refreshLeg();
    } catch {
      setLiveError("We couldn't reach the server. Please try again.");
    } finally {
      setFinishingLeg(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (uiPhase === "LOADING") {
    return (
      <div className="flex flex-col items-center gap-3 py-16" aria-live="polite">
        <Spinner size="lg" />
        <p className="text-sm text-muted">Your coach is choosing the moment to work on…</p>
      </div>
    );
  }

  if (uiPhase === "NEEDS_LOGIN") {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="text-ink">Sign in to start this coached session.</p>
        <Button as={Link} href="/login" className="mt-5" color="primary">
          Go to sign in
        </Button>
      </div>
    );
  }

  if (uiPhase === "NOT_FOUND") {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="text-ink">This coached step is not available.</p>
        <Button as={Link} href="/reports" className="mt-5" color="primary">
          Back to my study plan
        </Button>
      </div>
    );
  }

  if (uiPhase === "ENTRY_ERROR" || !legView) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="text-copper-deep" role="alert">
          {entryError ?? "Unable to load this coached step."}
        </p>
        <Button as={Link} href="/reports" className="mt-5" variant="light">
          Back to my study plan
        </Button>
      </div>
    );
  }

  if (legView.leg === "COMPLETE") {
    return (
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8" aria-live="polite">
        <CompleteLeg legView={legView} planId={planId} delivery={delivery} />
      </div>
    );
  }

  if (!consented) {
    const moment = legView.moment;
    return (
      <div className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 px-4 py-8" aria-live="polite">
        <LeaveBar planId={planId} />
        {cameraStepOpen ? (
          // The SAME camera consent gate every practice type uses (shared
          // session chrome). Step 1 was the brief.
          <CameraConsentStep
            stepNumber={2}
            totalSteps={2}
            onBack={() => setCameraStepOpen(false)}
            onLaunch={handleConsent}
            launchLabel={`Start with ${legView.coach.name}`}
            sessionNoun="session"
            cameraOnDescription="Your camera and voice are analysed to give you delivery feedback in your end-of-session summary."
            cameraOffDescription="Your voice is still analysed for your end-of-session summary; your camera isn't used, so visual delivery won't be described."
          />
        ) : moment ? (
          <CoachedBriefCard
            coachAvatarId={legView.coach.avatarId}
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
            onStart={() => setCameraStepOpen(true)}
            starting={false}
            resuming={legView.conversation.length > 0}
            progress={
              legView.legReady
                ? {
                    partDone: legView.leg === "FRESH" ? 2 : 1,
                    next: legView.leg === "REPLAY" && legView.legCount === 2 ? "SECOND_MOMENT" : "SUMMARY",
                  }
                : null
            }
          />
        ) : null}
      </div>
    );
  }

  const moment = legView.moment;
  // No per-try verdicts ("Accepted" / "Not yet" / "Repeated the coach") in the
  // live room: live technique tips only, grading at the end (user decision
  // 2026-10-24). The student's tries are already in the captions; every
  // verdict and grade appears in the COMPLETE summary.
  const secondMomentNext = legView.leg === "REPLAY" && legView.legCount === 2;
  const partNumber = legView.leg === "FRESH" ? 2 : 1;
  const coachLabel = `Coach ${legView.coach.name}`;
  const connected = stageReady || videoUnavailable;
  const idleLabel =
    legView.awaiting === "ATTEMPT" ? "Tap to say your better version" : "Tap to answer";

  return (
    <SessionRoom className="relative flex min-h-[100dvh] flex-col bg-ink text-canvas lg:h-[100dvh] lg:flex-row">
      <SessionStagePane className="relative flex h-[56vh] min-h-[320px] flex-col lg:h-full lg:flex-1 lg:w-[64%]">
        <SessionStageHeader>
          <Button
            as={Link}
            href={leaveHref(planId)}
            isIconOnly
            aria-label="Leave coached session — it resumes where you left it"
            variant="light"
            className="bg-ink/65 text-white backdrop-blur-md"
          >
            <ChevronLeft size={20} />
          </Button>
          <SessionLiveBadge label="COACHED PRACTICE" />
          <div className="h-10 w-10" aria-hidden />
        </SessionStageHeader>

        {avatarConfig ? (
          // Stays mounted even when unavailable so a late connect can still
          // voice the queued coach turn, and its unmount cleanup runs.
          <div className={videoUnavailable ? "hidden" : "absolute inset-0"}>
            <SessionAvatar
              ref={avatarRef}
              config={avatarConfig}
              onSessionStateChange={handleAvatarStateChange}
              onSessionTokenError={handleAvatarTokenError}
            />
          </div>
        ) : null}
        {videoUnavailable ? (
          <div className="absolute inset-0 grid place-items-center px-8 text-center" role="status">
            <p className="max-w-sm text-sm leading-6 text-white">
              The video coach couldn&apos;t connect, so your coach will continue in text. If the
              video connects later, you&apos;ll hear your coach.
            </p>
          </div>
        ) : null}
        {!connected ? (
          <div className="absolute inset-x-0 bottom-24 z-10 flex flex-col items-center gap-3 px-6 text-center">
            <Spinner color="primary" size="sm" />
            <p className="text-sm text-white">Connecting to {coachLabel}…</p>
            {slowConnect ? (
              <Button size="sm" variant="flat" className="text-white" onPress={handleContinueWithoutVideo}>
                Taking a while — continue without video
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-ink via-ink/45 to-transparent" />
        <span className="pointer-events-none absolute bottom-4 left-4 z-20 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
          {coachLabel}
        </span>
        <SelfViewThumbnail stream={cameraStream} />
      </SessionStagePane>

      <SessionSidePane className="relative z-10 flex w-full flex-col border-white/10 bg-ink/95 lg:h-full lg:w-[36%] lg:max-w-[570px] lg:border-l">
        <div className="px-5 pb-5 pt-6 sm:px-8 lg:pt-7">
          <SessionStatus
            eyebrow="Coached practice"
            title={legView.competencyLabel}
            subtitle={
              connected
                ? `Part ${partNumber} of ${legView.legCount} · with ${coachLabel}`
                : "Connecting securely"
            }
            elapsedSeconds={elapsedSeconds}
          />
          {legView.thinEvidence ? (
            <p className="mt-3 text-xs leading-5 text-light-blue">
              This session has one part: there was not a second moment clear enough to use.
            </p>
          ) : null}
        </div>

        <div
          aria-live="polite"
          className="flex min-h-0 flex-1 flex-col gap-5 px-5 py-5 sm:px-8 lg:overflow-y-auto"
        >
          {moment ? (
            <CoachedMomentPanel
              counterpartLine={moment.counterpartLine}
              studentLine={moment.studentLine}
              sessionLink={`/practice/${legView.underlyingTypeSlug}/report/${moment.sourceReportId}`}
            />
          ) : null}

          <div className="space-y-5" aria-label="Conversation captions">
            {legView.conversation.length === 0 ? (
              <div className="flex min-h-24 flex-col items-center justify-center text-center text-light-blue">
                <Spinner color="primary" size="sm" />
                <p className="mt-3 text-sm">
                  {connected
                    ? `${coachLabel} is getting ready…`
                    : "Establishing a secure live connection."}
                </p>
              </div>
            ) : (
              legView.conversation.map((turn) =>
                turn.speaker === "COACH" ? (
                  <article key={turn.seq} className="max-w-[94%]">
                    <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold text-light-blue">
                      <Sparkles size={13} /> {coachLabel}
                    </div>
                    <p className="whitespace-pre-wrap text-[15px] leading-7 text-canvas">
                      {turn.text}
                    </p>
                  </article>
                ) : (
                  <article
                    key={turn.seq}
                    className="ml-auto max-w-[88%] whitespace-pre-wrap rounded-xl rounded-br-sm bg-cwru-blue px-4 py-3 text-sm leading-6 text-white"
                  >
                    {turn.text}
                  </article>
                ),
              )
            )}
            {coachBusy && legView.conversation.length > 0 ? (
              <p className="flex items-center gap-2 text-[11px] font-semibold text-light-blue">
                <Volume2 size={13} className="animate-pulse" /> {coachLabel} is thinking…
              </p>
            ) : null}
            {partialTranscript ? (
              <article className="ml-auto max-w-[88%] rounded-xl rounded-br-sm border border-light-blue bg-cwru-blue px-4 py-3 text-sm leading-6 text-white">
                {partialTranscript}
              </article>
            ) : null}
            <div ref={captionsEndRef} />
          </div>

          {latestDemonstration ? (
            <aside
              aria-label="Coach example"
              className="space-y-2 rounded-xl border border-level-2/40 bg-level-2/10 p-4"
            >
              <p className="text-xs font-bold text-ink">
                {legView.coach.name}&apos;s example
              </p>
              <p className="whitespace-pre-wrap text-sm leading-6 text-ink">
                {latestDemonstration}
              </p>
              <p className="text-xs leading-5 text-muted">
                {DEMONSTRATION_DISCLOSURE}
              </p>
            </aside>
          ) : null}

          <TipRail tips={legView.tips} />
        </div>

        <div className="border-t border-white/10 bg-ink px-5 py-5 sm:px-8">
          {!legView.legReady ? (
            <div className="space-y-2">
              <PushToTalkControl
                isRecording={isRecording}
                isTranscribing={isTranscribing}
                isDisabled={!canSpeak || isTranscribing}
                onToggle={toggleRecording}
                idleLabel={coachBusy ? "Your coach is responding…" : idleLabel}
                recordingLabel="Tap again to send"
                startAriaLabel={idleLabel}
                stopAriaLabel="Stop recording and send your answer"
              />
              {talkError ? (
                <p className="text-sm text-copper-soft" role="alert">
                  {talkError}
                </p>
              ) : null}
            </div>
          ) : (
            <Button
              color="primary"
              isDisabled={finishingLeg}
              onPress={secondMomentNext ? handleAdvance : handleComplete}
            >
              {finishingLeg ? (
                <Spinner size="sm" />
              ) : secondMomentNext ? (
                "Continue to my second moment"
              ) : (
                "Finish session"
              )}
            </Button>
          )}
          {liveError ? (
            <p className="mt-2 text-sm text-copper-soft" role="alert">
              {liveError}
            </p>
          ) : null}
          <p className="mt-3 text-[11px] leading-4 text-light-blue">
            You answer out loud. Your coach grades your reworked lines; the grades appear when the
            session ends.
          </p>
        </div>
      </SessionSidePane>

      <FaceDetectionBanner
        visible={cameraMode === "ON" && faceMissing}
        detail={COACHED_FACE_BANNER_DETAIL}
      />
    </SessionRoom>
  );
}

/** The labelled way out, before the live room opens. Resuming is server-side. */
function LeaveBar({ planId }: { planId: string }) {
  return (
    <div>
      <BackLink
        ariaLabel="Leave coached session — it resumes where you left it"
        href={leaveHref(planId)}
        label="Study plan"
      />
      <p className="mt-1 text-xs text-muted">
        You can leave at any point — your coached session resumes right where you left it when
        you come back.
      </p>
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
      className="space-y-3 rounded-xl border border-white/10 bg-ink p-4"
    >
      <p className="text-xs font-bold text-light-blue">
        Technique reminders
      </p>
      {/*
        The one allowed explanatory literal (plan 21-24's contract line) —
        this names the skill, never scripts the words. There is exactly
        one sentence like this in this file, and it is not a tip.
      */}
      <p className="text-xs leading-5 text-light-blue">
        These name a technique to apply — they are not words to say.
      </p>
      {tips.length === 0 && (
        <p className="text-xs text-light-blue">No reminders for this leg.</p>
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
          <li key={tip.id} className="rounded-lg bg-ink p-3">
            <p className="text-sm font-semibold text-white">{tip.name}</p>
            <p className="mt-1 text-sm leading-5 text-white">{tip.reminder}</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// COMPLETE — the graded summary. The only place numeric grades appear.
// ---------------------------------------------------------------------------

function ScoreBadge({ label, score }: { label: string; score: number | null }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-light-blue bg-white px-2.5 py-0.5 text-xs font-semibold text-link">
      {label}: {score === null ? "not scored" : `${score}/5`}
    </span>
  );
}

function CompleteLeg({
  legView,
  planId,
  delivery,
}: {
  legView: CoachedLegDTO;
  planId: string;
  delivery: DeliveryCapture | null;
}) {
  const pct = Math.round((legView.worth.coachedWeight / legView.worth.unaidedWeight) * 100);
  const legs = legView.summary?.legs ?? [];
  const nextStepHref = useNextStepHref(planId);
  const diagnosis =
    delivery && legView.competencyKey === "delivery_presence"
      ? diagnoseDelivery({
          competencyKey: "delivery_presence" as CompetencyKey,
          cameraMode: delivery.cameraMode,
          visual: delivery.visual,
          vocal: delivery.vocal,
        })
      : null;

  return (
    <section aria-labelledby="coached-complete-heading" className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 id="coached-complete-heading" className="font-display font-medium text-2xl text-ink">
          Session complete.
        </h1>
        <p className="text-sm leading-6 text-ink">
          Your coach graded your reworked lines, and {legView.competencyLabel} moved at the coached
          weight ({pct}% of an unaided session).
        </p>
      </div>

      {legs.map((leg, index) => {
        const improvement =
          leg.gradedScore !== null && leg.originalScore !== null
            ? leg.gradedScore - leg.originalScore
            : null;
        return (
          <article
            key={leg.leg}
            className="space-y-4 rounded-xl border border-line bg-white p-5"
            aria-label={`Moment ${index + 1} results`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display font-medium text-lg text-ink">Moment {index + 1}</h2>
              <div className="flex flex-wrap gap-2">
                <ScoreBadge label="Original" score={leg.originalScore} />
                <ScoreBadge label="Your rework" score={leg.gradedScore} />
              </div>
            </div>

            {leg.moment.counterpartLine ? (
              <div>
                <p className="text-xs font-bold text-link">They said:</p>
                <blockquote className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink">
                  {leg.moment.counterpartLine}
                </blockquote>
              </div>
            ) : null}
            <div>
              <p className="text-xs font-bold text-link">
                You said originally:
              </p>
              <blockquote className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink">
                {leg.moment.studentLine}
              </blockquote>
            </div>
            {leg.gradedAttemptText ? (
              <div>
                <p className="text-xs font-bold text-level-4">
                  Your graded rework:
                </p>
                <blockquote className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink">
                  {leg.gradedAttemptText}
                </blockquote>
              </div>
            ) : null}

            <p className="text-sm leading-6 text-ink">
              {leg.gradedScore === null
                ? "This moment closed without a gradable attempt, so it did not move your mastery."
                : improvement === null
                  ? `Graded ${leg.gradedScore}/5 on ${legView.competencyLabel}.`
                  : improvement > 0
                    ? `Up ${improvement} from the original moment (${leg.originalScore}/5 → ${leg.gradedScore}/5).`
                    : improvement === 0
                      ? `Level with the original moment (${leg.gradedScore}/5) — the rework held the line rather than lifting it.`
                      : `Below the original moment (${leg.originalScore}/5 → ${leg.gradedScore}/5) — worth another try in a future session.`}
              {leg.closedAtSoftCap ? " Your coach closed this part at the time limit." : ""}
            </p>

            {leg.attempts.length > 1 ? (
              <details className="text-sm text-ink">
                <summary className="cursor-pointer text-xs font-semibold text-cwru-blue">
                  All {leg.attempts.length} tries
                </summary>
                <ol className="mt-2 space-y-2">
                  {leg.attempts.map((attempt, i) => (
                    <li key={i} className="rounded-lg bg-canvas p-3">
                      <blockquote className="whitespace-pre-wrap">{attempt.text}</blockquote>
                      <p className="mt-1 text-xs text-muted">
                        {attempt.offTopic
                          ? `Off-topic — didn't answer this moment's question${attempt.score === null ? "" : ` (${attempt.score}/5)`}`
                          : attempt.parroted
                          ? "Repeated the coach — not graded toward mastery"
                          : attempt.score === null
                            ? "Not scored"
                            : `${attempt.score}/5`}
                      </p>
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
          </article>
        );
      })}

      {diagnosis && diagnosis.focuses.length > 0 ? (
        <article className="space-y-3 rounded-xl border border-light-blue/32 bg-canvas p-5" aria-label="What I would focus on">
          <h2 className="text-xs font-bold text-link">
            {diagnosis.focuses.length > 1 ? "What I would focus on (this session)" : "What I would focus on"}
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-ink">
            {Array.from(new Set(diagnosis.focuses.map((f) => f.reason).filter(Boolean))).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          {diagnosis.focuses.map((focus) => (
            <div key={focus.technique.id} className="space-y-1">
              <p className="text-sm leading-6 text-ink">
                I would focus on <span className="font-semibold">{focus.technique.name}</span>.
              </p>
              <p className="text-sm leading-6 text-ink">{focus.technique.reminder}</p>
            </div>
          ))}
        </article>
      ) : null}

      <DeliveryBandsCard
        delivery={delivery}
        emptyNote="Delivery is described right after a session ends."
      />

      <div className="flex flex-wrap justify-center gap-3">
        <Button as={Link} href={nextStepHref ?? `/study-plans/${planId}`} color="primary">
          {nextStepHref ? "Go to the next step" : "Continue the learning path"}
        </Button>
        <Button as={Link} href="/mastery" variant="light">
          View mastery
        </Button>
      </div>
    </section>
  );
}
