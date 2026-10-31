"use client";

/**
 * Engine session page for instance-less types (interview presets) and
 * wizard-authored types (`pitch-elevator`, instance.required + authoredInWizard).
 *
 * Hosts SetupWizard → PracticeSessionShell in ONE page with a step
 * transition (no navigation between them — matching today's interview
 * experience). Plan 13-11 owns `/practice/[type]/[instanceId]` for
 * pre-authored instances (case-study).
 *
 * Do not edit `app/interview/[type]/page.tsx` from here — that page stays
 * live until 13-13 so humans can compare the two shells side by side.
 *
 * 14-10 extension against 13-09: a type with instance.required AND
 * instance.authoredInWizard renders here — the instance is assembled from
 * wizard state at launch and posted to `/api/practice/session/start`.
 *
 * 16-08: networking (instance.required false) registers NetworkingPersonStep /
 * NetworkingGoalStep here; reuses InterviewerStep + SetupWizard camera gate.
 */

import type { InterviewCustomizationInput } from "@/lib/interview/customization";
import type { CameraMode } from "@/lib/metrics/types";
import type { InstanceConfig } from "@/lib/engine/types";
import type { StartAvatarRequest } from "@/types";

import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Spinner } from "@heroui/spinner";
import {
  Briefcase,
  CircleAlert,
  Clock3,
  LockKeyhole,
  Presentation,
  UsersRound,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import PracticeHero from "@/components/practice/PracticeHero";
import PracticeSessionShell from "@/components/practice/PracticeSessionShell";
import ProveItBrief from "@/components/study-plan/prove-it/ProveItBrief";
import { usePlanPrefill } from "@/components/study-plan/prove-it/usePlanPrefill";
import InterviewPaceGuidance from "@/components/practice/InterviewPaceGuidance";
import DeckTimerPanel from "@/components/practice/panels/DeckTimerPanel";
import DeckViewerPanel from "@/components/practice/panels/DeckViewerPanel";
import PitchTimerPanel from "@/components/practice/panels/PitchTimerPanel";
import SetupWizard, {
  type SetupStepNav,
} from "@/components/practice/SetupWizard";
import InterviewerStep, {
  type InterviewerOption,
} from "@/components/practice/steps/InterviewerStep";
import InterviewBackgroundReminderStep from "@/components/practice/steps/InterviewBackgroundReminderStep";
import ListenerKnowledgeStep, {
  type ListenerKnowledge,
} from "@/components/practice/steps/ListenerKnowledgeStep";
import NetworkingGoalStep from "@/components/practice/steps/NetworkingGoalStep";
import NetworkingPersonStep from "@/components/practice/steps/NetworkingPersonStep";
import PitchSubjectStep from "@/components/practice/steps/PitchSubjectStep";
import JobDescriptionStep from "@/components/practice/steps/JobDescriptionStep";
import ResumeStep from "@/components/practice/steps/ResumeStep";
import DeckUploadStep, {
  type DeckUploadValue,
} from "@/components/practice/steps/DeckUploadStep";
import NegotiationAskStep, {
  type NegotiationAskValue,
} from "@/components/practice/steps/NegotiationAskStep";
import FundingAskStep, {
  type FundingAskValue,
} from "@/components/practice/steps/FundingAskStep";
import BuyerProfileStep, {
  type BuyerProfileValue,
} from "@/components/practice/steps/BuyerProfileStep";
import TalkAudienceStep, {
  type TalkAudienceValue,
} from "@/components/practice/steps/TalkAudienceStep";
import SessionLengthStep, {
  type SessionLengthValue,
} from "@/components/practice/steps/SessionLengthStep";
import { resolveInterviewType } from "@/lib/interview/customization";
import { getEngineType } from "@/lib/engine/registry";
import { resolveSessionConfig } from "@/lib/engine/resolve";
import { useLayout } from "@/lib/layout-context";
import { getNetworkingCharacter } from "@/lib/networking/characters";
import { ELEVATOR_LISTENER_PERSONA } from "@/lib/pitch/elevator-prompts";
import { proposeDeckSeconds } from "@/lib/pitch/session-length";
import {
  getDeckMode,
  isDeckModeSlug,
  tagModeInput,
  type DeckModeInputs,
} from "@/lib/pitch/deck-modes";

type PagePhase = "wizard" | "session";

export default function PracticeTypePage() {
  const params = useParams<{ type: string }>();
  const router = useRouter();
  const { setFullScreen } = useLayout();

  const engineType = useMemo(() => getEngineType(params.type), [params.type]);
  const isPitchElevator = engineType?.slug === "pitch-elevator";
  // The ONE lookup that replaces every "is this slug a deck mode" branch —
  // getDeckMode() reads lib/pitch/deck-modes.ts's DECK_MODES table so a
  // sixth deck mode is a data row there, not an edit here.
  const deckMode = useMemo(() => getDeckMode(engineType?.slug), [engineType]);
  const isDeckMode = deckMode !== null;
  const isPitch = isPitchElevator || isDeckMode;
  const isNetworking = engineType?.slug === "networking";
  const authoredInWizard = Boolean(engineType?.instance.authoredInWizard);
  // All five deck modes declare the shared Phase 13 `interviewer` step
  // (InterviewerStep); pitch-elevator declares none and still depends on
  // the auto-pick fallback below. No slug comparison — a generic read of
  // the registered type's own setupSteps.
  const declaresInterviewerStep = Boolean(
    engineType?.setupSteps.some((step) => step.id === "interviewer"),
  );

  // Read-once-then-clear handoff from the picker (see app/interview/page.tsx),
  // guarded by a ref so React strict-mode's double-invoke of the mount effect
  // cannot read (and clear) the key twice. A parse failure is treated exactly
  // as absence — the wizard degrades to the preset's own defaults.
  const handoffReadRef = useRef(false);
  const [storedCustomization, setStoredCustomization] =
    useState<InterviewCustomizationInput | null>(null);
  const [handoffResolved, setHandoffResolved] = useState(false);

  useEffect(() => {
    if (handoffReadRef.current) return;
    handoffReadRef.current = true;
    if (
      isDeckModeSlug(params.type) ||
      params.type === "pitch-elevator" ||
      params.type === "networking"
    ) {
      setHandoffResolved(true);

      return;
    }
    const key = `interview:customization:${params.type}`;

    try {
      const raw = sessionStorage.getItem(key);

      sessionStorage.removeItem(key);
      if (raw) {
        setStoredCustomization(JSON.parse(raw) as InterviewCustomizationInput);
      }
    } catch {
      // Parse failure or storage unavailable: fall back to preset defaults.
    } finally {
      setHandoffResolved(true);
    }
  }, [params.type]);

  // Phase 23 prove-it prefill: INERT unless the URL carries ?fromPlan=&step=
  // (usePlanPrefill makes no request otherwise). When present, the server's
  // prefill seeds the same state the wizard steps write, nothing more.
  const planPrefill = usePlanPrefill();

  const interviewType = useMemo(
    () =>
      isPitch || isNetworking
        ? null
        : resolveInterviewType(params.type, storedCustomization),
    [params.type, storedCustomization, isPitch, isNetworking],
  );

  const isInterview = interviewType !== null;

  const [phase, setPhase] = useState<PagePhase>("wizard");
  // When exiting a session, reopen the wizard on a sensible step.
  const [wizardStepId, setWizardStepId] = useState<string | undefined>(
    undefined,
  );
  const [selectedInterviewer, setSelectedInterviewer] =
    useState<InterviewerOption | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [resumeFileName, setResumeFileName] = useState<string | undefined>();
  const [resumeId, setResumeId] = useState<string | null>(null);
  // Job posting (quick task 003 / issue #56). A pasted posting has text with a
  // null id; an uploaded one has both. `jobDescriptionText` is session-constant
  // and is resent byte-identically on every chat turn (REQ-73).
  const [jobDescriptionText, setJobDescriptionText] = useState("");
  const [jobDescriptionId, setJobDescriptionId] = useState<string | null>(null);
  const [jobDescriptionFileName, setJobDescriptionFileName] = useState<
    string | undefined
  >();
  const [cameraMode, setCameraMode] = useState<CameraMode>("OFF");
  const [reportId, setReportId] = useState<string | null>(null);

  // Elevator wizard state — keys match the type's setupSteps / InstanceConfig.
  const [pitchSubject, setPitchSubject] = useState("");
  const [listenerKnowledge, setListenerKnowledge] =
    useState<ListenerKnowledge | null>(null);

  // Deck-mode wizard state, shared by all five modes — keys match
  // setupSteps; fair band is server-only. `deckUpload` and `sessionLength`
  // are the two fields every deck mode has. The one mode-specific field
  // (ask/equity for the investor, or the new 19-06 inputs for the other
  // four) is collapsed into ONE state slot, keyed off
  // `deckMode.modeInputStepId`, so the number of state variables does not
  // grow with the number of modes.
  const [deckUpload, setDeckUpload] = useState<DeckUploadValue | null>(null);
  const [deckModeInput, setDeckModeInput] = useState<
    NegotiationAskValue | DeckModeInputs | null
  >(null);
  const [sessionLength, setSessionLength] = useState<SessionLengthValue | null>(
    null,
  );

  // Narrow the one collapsed slot back to its mode-specific shape. Only one
  // of these can be non-null for any given deckMode (negotiates XOR a
  // modeInputStepId), so the cast is safe: SetupWizard only ever mounts the
  // step matching this mode's own declared step id.
  const negotiationAskValue: NegotiationAskValue | null = deckMode?.negotiates
    ? (deckModeInput as NegotiationAskValue | null)
    : null;
  const modeInputValue: DeckModeInputs | null =
    deckMode && !deckMode.negotiates && deckMode.modeInputStepId
      ? (deckModeInput as DeckModeInputs | null)
      : null;
  const deckModeInputReady = !deckMode
    ? false
    : deckMode.negotiates
      ? negotiationAskValue !== null
      : deckMode.modeInputStepId === null
        ? true
        : modeInputValue !== null;

  // Networking wizard state (16-08) — character XOR brought-in persona, plus goal.
  const [networkingCharacterId, setNetworkingCharacterId] = useState<
    string | null
  >(null);
  const [networkingInstanceId, setNetworkingInstanceId] = useState<
    string | null
  >(null);
  const [networkingGoal, setNetworkingGoal] = useState("");
  /** Distilled sentence + display name for brought-in path (chat live prompt). */
  const [networkingBroughtInLive, setNetworkingBroughtInLive] = useState<{
    persona: string;
    displayName: string;
  } | null>(null);

  // Soft pitch-window timing, mirrored from PracticeSessionShell (13-10 ext).
  const [pitchTurnStartedAt, setPitchTurnStartedAt] = useState<number | null>(
    null,
  );
  const [pitchTimerPhase, setPitchTimerPhase] = useState<
    "pitching" | "followups"
  >("pitching");

  // Pitch-deck live session: furthest slide report + soft envelope timer.
  const [furthestSlide, setFurthestSlide] = useState(0);
  const [deckBudgetSeconds, setDeckBudgetSeconds] = useState<number | null>(
    null,
  );
  const [deckSessionStartedAt, setDeckSessionStartedAt] = useState<
    number | null
  >(null);

  const elevatorInstance: InstanceConfig | null = useMemo(() => {
    if (!isPitchElevator) return null;
    const subject = pitchSubject.trim();

    if (!subject || !listenerKnowledge) return null;

    return {
      kind: "pitch-elevator",
      pitchSubject: subject,
      listenerKnowledge,
    };
  }, [isPitchElevator, pitchSubject, listenerKnowledge]);

  // Client-side resolve for shell chrome only. Slide text and the hidden
  // fair band are NOT held here — startSession fetches text and injects the
  // band server-side (14-12). The negotiation fields and modeInputs are
  // spread in CONDITIONALLY so a non-negotiating mode's object literal
  // never contains askPriceUsd/askEquityPct at all (REQ-89 / P19-SC2).
  const deckInstanceForShell: InstanceConfig | null = useMemo(() => {
    if (
      !isDeckMode ||
      !deckMode ||
      !deckUpload ||
      !sessionLength ||
      !deckModeInputReady
    ) {
      return null;
    }

    return {
      kind: "pitch-deck",
      deckId: deckUpload.deckId,
      slideCount: deckUpload.slideCount,
      slideTexts: [],
      ...(deckMode.negotiates && negotiationAskValue
        ? {
            askPriceUsd: negotiationAskValue.askPriceUsd,
            askEquityPct: negotiationAskValue.askEquityPct,
          }
        : {}),
      ...(modeInputValue ? { modeInputs: modeInputValue } : {}),
      proposedSeconds:
        sessionLength.budgetSeconds ||
        proposeDeckSeconds(deckUpload.slideCount, deckMode.envelopeSeconds),
      // Server injects the hidden band at startSession — omitted on purpose.
    } as unknown as InstanceConfig;
  }, [
    isDeckMode,
    deckMode,
    deckUpload,
    sessionLength,
    deckModeInputReady,
    negotiationAskValue,
    modeInputValue,
  ]);

  const sessionConfig = useMemo(() => {
    if (isPitchElevator) {
      if (!elevatorInstance) return null;
      const resolved = resolveSessionConfig(params.type, {
        instance: elevatorInstance,
      });

      return resolved.ok ? resolved.config : null;
    }
    if (isDeckMode) {
      if (!deckInstanceForShell) return null;
      const resolved = resolveSessionConfig(params.type, {
        instance: deckInstanceForShell,
      });

      return resolved.ok ? resolved.config : null;
    }
    if (isNetworking) {
      const resolved = resolveSessionConfig(params.type, {});

      return resolved.ok ? resolved.config : null;
    }
    const resolved = resolveSessionConfig(params.type, {
      customization: storedCustomization,
    });

    return resolved.ok ? resolved.config : null;
  }, [
    params.type,
    storedCustomization,
    isPitchElevator,
    isDeckMode,
    isNetworking,
    elevatorInstance,
    deckInstanceForShell,
  ]);

  // Resent verbatim on every networking chat turn so liveSystemPrompt can
  // resolve the persona (characterId on extra, or brought-in distilled text).
  const networkingCustomization = useMemo(() => {
    if (!isNetworking) return null;
    if (networkingCharacterId) {
      return { characterId: networkingCharacterId };
    }
    if (networkingBroughtInLive) {
      return {
        distilledPersona: networkingBroughtInLive.persona,
        personaDisplayName: networkingBroughtInLive.displayName,
      };
    }

    return null;
  }, [isNetworking, networkingCharacterId, networkingBroughtInLive]);

  // When the student picks a saved brought-in persona, load its distilled
  // sentence for the live chat path (session start already has instanceId).
  useEffect(() => {
    if (!isNetworking || !networkingInstanceId || networkingCharacterId) {
      if (!networkingInstanceId) setNetworkingBroughtInLive(null);

      return;
    }
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(
          `/api/networking/persona/${networkingInstanceId}`,
          { cache: "no-store" },
        );
        const data = (await response.json().catch(() => ({}))) as {
          persona?: string;
          displayName?: string;
        };

        if (cancelled || !response.ok) return;
        if (
          typeof data.persona === "string" &&
          typeof data.displayName === "string"
        ) {
          setNetworkingBroughtInLive({
            persona: data.persona,
            displayName: data.displayName,
          });
        }
      } catch {
        // Launch still works for startSession; chat will fail closed without live text.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isNetworking, networkingInstanceId, networkingCharacterId]);

  useEffect(() => {
    const info = planPrefill.info;
    if (!info || info.typeSlug !== params.type) return;
    const prefill = info.prefill;
    if (prefill.kind === "interview") {
      setStoredCustomization(prefill.customization);
      // Reused from the source session (user-scoped server-side): the same
      // values the resume / job-posting steps would have written.
      if (prefill.resume) {
        setResumeId(prefill.resume.resumeId);
        setResumeText(prefill.resume.resumeText);
        setResumeFileName("Resume from your earlier session");
      }
      if (prefill.jobDescription) {
        setJobDescriptionId(prefill.jobDescription.jobDescriptionId);
        setJobDescriptionText(prefill.jobDescription.jobDescriptionText);
        setJobDescriptionFileName("Job posting from your earlier session");
      }
    } else if (prefill.kind === "networking") {
      setNetworkingCharacterId(prefill.characterId);
      setNetworkingInstanceId(prefill.personaId);
      setNetworkingGoal(prefill.goal);
    } else if (prefill.kind === "pitch-elevator") {
      setPitchSubject(prefill.pitchSubject);
      setListenerKnowledge(prefill.listenerKnowledge);
    }
  }, [planPrefill.info, params.type]);

  // Fallback auto-pick for a pitch type that declares NO `interviewer` step
  // (today, only pitch-elevator — its type record is read-only this phase
  // and the session render gate below requires `selectedInterviewer`, so it
  // cannot start without this). Every type that DOES declare the step
  // (all five deck modes) is owned entirely by InterviewerStep, which does
  // strictly more than this effect: same catalog fetch, same
  // interviewers[0] default, PLUS it surfaces a catalog error that this
  // effect silently swallows. Gated generically on the declared steps, no
  // slug, so for no single type are both selection paths live.
  useEffect(() => {
    if (!isPitch || declaresInterviewerStep || selectedInterviewer) return;
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/interview/interviewers", {
          cache: "no-store",
        });
        const data = (await response.json().catch(() => ({}))) as {
          interviewers?: InterviewerOption[];
        };

        if (cancelled || !data.interviewers?.length) return;
        setSelectedInterviewer(data.interviewers[0]);
      } catch {
        // Session can still run typed-only if the catalog is unavailable.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPitch, declaresInterviewerStep, selectedInterviewer]);

  useEffect(() => {
    setFullScreen(phase === "session");

    return () => setFullScreen(false);
  }, [setFullScreen, phase]);

  const avatarConfig: StartAvatarRequest | null = selectedInterviewer
    ? {
        quality: "low",
        avatarName: selectedInterviewer.avatarId,
        voice: {
          voiceId: selectedInterviewer.voice.id,
          rate: 1.05,
        },
        language: "en",
      }
    : null;

  if (!handoffResolved || !planPrefill.resolved) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-canvas">
        <Spinner color="primary" />
      </main>
    );
  }

  // Unknown slug, or a type that requires a pre-authored instance (those live
  // at /practice/[type]/[instanceId] — plan 13-11). Wizard-authored types
  // (authoredInWizard) are allowed here even when required is true.
  const typeAvailable =
    !!engineType &&
    (!engineType.instance.required || authoredInWizard) &&
    (isPitch || isNetworking || (!!interviewType && !!sessionConfig));

  // During the pitch wizard, sessionConfig needs the assembled instance — allow
  // the wizard to render before both fields are filled.
  if (!typeAvailable || !engineType) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-canvas p-6 text-ink">
        <Card className="max-w-lg border border-line shadow-none">
          <CardBody className="items-start gap-4 p-8">
            <CircleAlert className="text-link" size={28} />
            <h1 className="font-display font-medium text-3xl">
              That practice type is not available.
            </h1>
            <p className="text-muted">
              Choose a practice session from your Leadership Avatar workspace.
            </p>
            <Button color="primary" onPress={() => router.push("/")}>
              Back to practice
            </Button>
          </CardBody>
        </Card>
      </main>
    );
  }

  const pageDescription = interviewType?.description ?? engineType.description;
  const pageMinutes =
    interviewType?.targetMinutes ?? engineType.limits.targetMinutes;
  const reportTypeSlug = interviewType?.slug ?? engineType.slug;
  const networkingCharacter = networkingCharacterId
    ? getNetworkingCharacter(networkingCharacterId)
    : null;
  // Deck-mode reports still say "Your investor" / "A prospective customer" —
  // the mode's fixed listener label, never the picked avatar's catalog
  // name. Adding the avatar picker changes which FACE and VOICE play the
  // listener, never who the listener is (Phase 14 behavior unchanged).
  const listenerDisplayName = isPitchElevator
    ? listenerKnowledge === "blind"
      ? "Your listener"
      : ELEVATOR_LISTENER_PERSONA.name
    : isDeckMode && deckMode
      ? deckMode.listenerDisplayName
      : isNetworking
        ? networkingCharacter?.displayName ||
          networkingBroughtInLive?.displayName ||
          selectedInterviewer?.name ||
          ""
        : storedCustomization?.personaDisplayName?.trim() ||
          selectedInterviewer?.name ||
          "";

  if (
    phase === "session" &&
    selectedInterviewer &&
    avatarConfig &&
    reportId &&
    sessionConfig
  ) {
    const windowSeconds = sessionConfig.timeBudget.firstTurnWindowSeconds ?? 60;
    const deckBudget =
      deckBudgetSeconds ??
      sessionLength?.budgetSeconds ??
      sessionConfig.timeBudget.totalSeconds ??
      1200;

    return (
      <PracticeSessionShell
        autoFinishOnAvatarEnd={isPitch}
        avatarConfig={avatarConfig}
        answerControlsSupplement={
          isInterview ? <InterviewPaceGuidance variant="live" /> : undefined
        }
        cameraMode={cameraMode}
        customization={
          isPitch
            ? undefined
            : isNetworking
              ? networkingCustomization
              : storedCustomization
        }
        defaultReportTitle={
          isPitchElevator
            ? pitchSubject.trim()
              ? `Elevator pitch · ${pitchSubject.trim().slice(0, 60)}`
              : "Elevator pitch"
            : isDeckMode && deckMode
              ? deckUpload
                ? `${deckMode.cardTitle} · ${deckUpload.slideCount} slides`
                : deckMode.cardTitle
              : isNetworking
                ? networkingGoal.trim()
                  ? `Networking · ${networkingGoal.trim().slice(0, 60)}`
                  : "Networking practice"
                : listenerDisplayName
                  ? `Interview · with ${listenerDisplayName}`
                  : "Practice interview"
        }
        extraChatBody={
          isPitch
            ? {
                reportId,
                ...(isDeckMode ? { revealedSlideIndex: furthestSlide } : {}),
              }
            : isInterview
              ? // Spread into the TOP LEVEL of the chat body by the shell's
                // existing `...extraChatBody` — which is exactly where the
                // chat route reads it, so the shell needs no edit (decision 4).
                { jobDescriptionText }
              : undefined
        }
        interviewerAvatarId={selectedInterviewer.avatarId}
        interviewerName={listenerDisplayName}
        language="en"
        mediaLayout={isDeckMode ? "deck-primary" : "avatar-primary"}
        reportId={reportId}
        resumeFileName={isPitch || isNetworking ? undefined : resumeFileName}
        resumeId={isPitch || isNetworking ? null : resumeId}
        resumeText={isPitch || isNetworking ? "" : resumeText}
        sessionConfig={sessionConfig}
        sessionPanel={
          isPitchElevator ? (
            <PitchTimerPanel
              phase={pitchTimerPhase}
              turnStartedAt={pitchTurnStartedAt}
              windowSeconds={windowSeconds}
            />
          ) : isDeckMode && deckUpload && deckSessionStartedAt != null ? (
            <>
              <div className="pointer-events-auto absolute right-3 top-[4.25rem] z-30 sm:right-5 sm:top-[4.75rem]">
                <DeckTimerPanel
                  budgetSeconds={deckBudget}
                  sessionStartedAt={deckSessionStartedAt}
                />
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
                <DeckViewerPanel
                  deckId={deckUpload.deckId}
                  layout="stage"
                  audienceLabel={deckMode?.listenerLine.toLowerCase()}
                  slides={deckUpload.slides}
                  onFurthestChange={setFurthestSlide}
                />
              </div>
            </>
          ) : undefined
        }
        sessionPanelClassName={
          isDeckMode
            ? "pointer-events-auto absolute inset-0 z-10 flex flex-col gap-2 px-3 pb-[9.5rem] pt-16 sm:px-5 sm:pb-28 sm:pt-[4.5rem]"
            : undefined
        }
        onExit={() => {
          setWizardStepId(
            isPitchElevator
              ? "pitch-subject"
              : isDeckMode
                ? "deck-upload"
                : isNetworking
                  ? "networking-person"
                  : "resume",
          );
          setPhase("wizard");
          setReportId(null);
          setPitchTurnStartedAt(null);
          setPitchTimerPhase("pitching");
          setFurthestSlide(0);
          setDeckBudgetSeconds(null);
          setDeckSessionStartedAt(null);
          setFullScreen(false);
        }}
        onFinish={(finishedReportId) => {
          setFullScreen(false);
          router.push(`/practice/${reportTypeSlug}/report/${finishedReportId}`);
        }}
        onOpeningTurnTimingChange={
          isPitchElevator
            ? ({ turnStartedAt, phase: nextPhase }) => {
                setPitchTurnStartedAt(turnStartedAt);
                setPitchTimerPhase(nextPhase);
              }
            : undefined
        }
      />
    );
  }

  return (
    // overflow-x-clip, not overflow-hidden: `hidden` makes this a scroll
    // container, which silently breaks `position: sticky` for descendants —
    // the interviewer step's action bar depends on it. `clip` still contains
    // the hero's decorative bleed without that side effect.
    <div className="flex flex-col gap-6 overflow-x-clip">
      <PracticeHero
        backHref={isDeckMode ? "/practice/pitches/deck" : isPitch ? "/practice/pitches" : isInterview ? "/interview" : "/"}
        backLabel={isDeckMode ? "Pitch with a deck" : isPitch ? "Pitch practice" : isInterview ? "Interview practice" : "Practice"}
        description={pageDescription}
        facts={[
          {
            icon: Clock3,
            label: isPitchElevator
              ? "30–60 s"
              : isDeckMode && deckMode
                ? formatEnvelopeRange(deckMode.envelopeSeconds)
                : `${pageMinutes ?? "—"} min`,
          },
          {
            icon: UsersRound,
            label:
              isDeckMode && deckMode
                ? `${deckMode.listenerDisplayName} · ${deckMode.wizardStudioStat}`
                : isPitchElevator
                  ? "Live listener"
                  : isNetworking
                    ? "Live contact"
                    : "Live interviewer",
          },
          {
            icon: LockKeyhole,
            label: isPitchElevator
              ? "Private subject"
              : isDeckMode
                ? "Private deck"
                : isNetworking
                  ? "Private goal"
                  : "Private resume",
          },
        ]}
        icon={isPitch ? Presentation : isNetworking ? UsersRound : Briefcase}
        title={
          isPitchElevator
            ? "Elevator pitch"
            : isDeckMode && deckMode
              ? deckMode.wizardHeadline
              : isNetworking
                ? "Networking practice"
                : interviewType
                  ? `${interviewType.label}`
                  : "Interview practice"
        }
      />

      <div className="flex flex-col gap-6">
        {planPrefill.info ? <ProveItBrief info={planPrefill.info} /> : null}
        <SetupWizard
          createReportOnLaunch
          supplementalContent={
            isInterview ? <InterviewPaceGuidance variant="setup" /> : undefined
          }
          buildStartPayload={async () => {
            if (isPitchElevator) {
              return {
                instance: elevatorInstance,
                interviewerAvatarId: selectedInterviewer?.avatarId,
                interviewerName: listenerDisplayName,
                language: "en",
              };
            }
            if (isDeckMode && deckMode) {
              if (!deckUpload || !sessionLength || !deckModeInputReady) {
                throw new Error(
                  "Finish uploading your deck, this mode's required inputs, and the session length before starting.",
                );
              }
              // Slide text is fetched at launch from the owner-only manifest —
              // never held in wizard state for the whole flow (14-12).
              const manifestRes = await fetch(
                `/api/practice/deck/${deckUpload.deckId}`,
                { cache: "no-store" },
              );
              const manifest = (await manifestRes.json().catch(() => ({}))) as {
                slides?: Array<{ text?: unknown }>;
                error?: string;
              };

              if (!manifestRes.ok || !Array.isArray(manifest.slides)) {
                throw new Error(
                  manifest.error ||
                    "We could not load your deck. Go back and re-upload it.",
                );
              }
              const slideTexts = manifest.slides.map((slide) =>
                typeof slide.text === "string" ? slide.text : "",
              );
              const proposedSeconds = proposeDeckSeconds(
                deckUpload.slideCount,
                deckMode.envelopeSeconds,
              );

              // Hidden investor band is injected server-side only (14-12) —
              // never sent from this page under any circumstances. The
              // negotiation fields and modeInputs are spread in
              // CONDITIONALLY so a non-negotiating mode's payload never
              // contains askPriceUsd/askEquityPct at all (REQ-89 / P19-SC2).
              return {
                instance: {
                  kind: "pitch-deck",
                  deckId: deckUpload.deckId,
                  slideCount: deckUpload.slideCount,
                  slideTexts,
                  ...(deckMode.negotiates && negotiationAskValue
                    ? {
                        askPriceUsd: negotiationAskValue.askPriceUsd,
                        askEquityPct: negotiationAskValue.askEquityPct,
                      }
                    : {}),
                  ...(modeInputValue ? { modeInputs: modeInputValue } : {}),
                  proposedSeconds,
                } as unknown as InstanceConfig,
                timeBudgetOverrideSeconds: sessionLength.budgetSeconds,
                interviewerAvatarId: selectedInterviewer?.avatarId,
                interviewerName: listenerDisplayName,
                language: "en",
              };
            }
            if (isNetworking) {
              return {
                instanceId: networkingInstanceId,
                customization: {
                  characterId: networkingCharacterId,
                  goal: networkingGoal.trim(),
                },
                interviewerAvatarId: selectedInterviewer?.avatarId,
                interviewerName: selectedInterviewer?.name,
                language: "en",
              };
            }

            return {
              customization: storedCustomization,
              interviewerAvatarId: selectedInterviewer?.avatarId,
              interviewerName:
                storedCustomization?.personaDisplayName?.trim() ||
                selectedInterviewer?.name,
              resumeId,
              resumeText,
              jobDescriptionId,
              jobDescriptionText,
              language: "en",
            };
          }}
          initialStepId={wizardStepId}
          progressAriaLabel={
            isPitchElevator
              ? "Elevator pitch setup progress"
              : isDeckMode && deckMode
                ? `${deckMode.cardTitle} setup progress`
                : isNetworking
                  ? "Networking setup progress"
                  : "Interview setup progress"
          }
          renderStep={(stepId: string, nav: SetupStepNav) => {
            if (stepId === "deck-upload") {
              return (
                <DeckUploadStep
                  deck={deckUpload}
                  nav={nav}
                  onChange={setDeckUpload}
                />
              );
            }
            if (stepId === "negotiation-ask") {
              return (
                <NegotiationAskStep
                  ask={negotiationAskValue}
                  nav={nav}
                  onChange={setDeckModeInput}
                />
              );
            }
            if (stepId === "funding-ask" && deckMode) {
              return (
                <FundingAskStep
                  nav={nav}
                  value={modeInputValue as FundingAskValue | null}
                  onChange={(next: FundingAskValue | null) =>
                    setDeckModeInput(
                      next ? tagModeInput(deckMode.slug, next) : null,
                    )
                  }
                />
              );
            }
            if (stepId === "buyer-profile" && deckMode) {
              return (
                <BuyerProfileStep
                  nav={nav}
                  value={modeInputValue as BuyerProfileValue | null}
                  onChange={(next: BuyerProfileValue | null) =>
                    setDeckModeInput(
                      next ? tagModeInput(deckMode.slug, next) : null,
                    )
                  }
                />
              );
            }
            if (stepId === "talk-audience" && deckMode) {
              return (
                <TalkAudienceStep
                  nav={nav}
                  value={modeInputValue as TalkAudienceValue | null}
                  onChange={(next: TalkAudienceValue | null) =>
                    setDeckModeInput(
                      next ? tagModeInput(deckMode.slug, next) : null,
                    )
                  }
                />
              );
            }
            if (stepId === "session-length" && deckMode) {
              // D19-1: the slider uses THIS mode's envelope — the same range
              // the type's adjustableRangeSeconds clamps to on the server.
              return (
                <SessionLengthStep
                  nav={nav}
                  sessionLength={sessionLength}
                  slideCount={deckUpload?.slideCount ?? null}
                  envelopeSeconds={deckMode.envelopeSeconds}
                  onChange={setSessionLength}
                />
              );
            }
            if (stepId === "pitch-subject") {
              return (
                <PitchSubjectStep
                  nav={nav}
                  pitchSubject={pitchSubject}
                  onChange={setPitchSubject}
                />
              );
            }
            if (stepId === "listener-knowledge") {
              return (
                <ListenerKnowledgeStep
                  listenerKnowledge={listenerKnowledge}
                  nav={nav}
                  onSelect={setListenerKnowledge}
                />
              );
            }
            if (stepId === "networking-person") {
              return (
                <NetworkingPersonStep
                  characterId={networkingCharacterId}
                  instanceId={networkingInstanceId}
                  nav={nav}
                  onChange={({ characterId, instanceId, broughtInLive }) => {
                    setNetworkingCharacterId(characterId);
                    setNetworkingInstanceId(instanceId);
                    if (broughtInLive) {
                      setNetworkingBroughtInLive(broughtInLive);
                    } else if (characterId || !instanceId) {
                      setNetworkingBroughtInLive(null);
                    }
                    // instanceId without broughtInLive → useEffect fetches persona
                  }}
                />
              );
            }
            if (stepId === "networking-goal") {
              return (
                <NetworkingGoalStep
                  goal={networkingGoal}
                  nav={nav}
                  onChange={setNetworkingGoal}
                />
              );
            }
            if (stepId === "interviewer") {
              return (
                <InterviewerStep
                  nav={nav}
                  selectedInterviewerId={selectedInterviewer?.avatarId ?? null}
                  onSelect={setSelectedInterviewer}
                  {...(isPitch
                    ? {
                        heading: "Choose who you'll pitch to.",
                        roleLabel: deckMode?.listenerLine ?? "Pitch listener",
                      }
                    : {})}
                />
              );
            }
            if (stepId === "job-description") {
              return (
                <JobDescriptionStep
                  nav={nav}
                  jobDescriptionFileName={jobDescriptionFileName}
                  jobDescriptionId={jobDescriptionId}
                  jobDescriptionText={jobDescriptionText}
                  onJobDescriptionChange={(next) => {
                    setJobDescriptionId(next.jobDescriptionId);
                    setJobDescriptionText(next.jobDescriptionText);
                    setJobDescriptionFileName(next.jobDescriptionFileName);
                  }}
                />
              );
            }
            if (stepId === "resume") {
              return (
                <ResumeStep
                  nav={nav}
                  resumeFileName={resumeFileName}
                  resumeId={resumeId}
                  onResumeChange={(next) => {
                    setResumeId(next.resumeId);
                    setResumeText(next.resumeText);
                    setResumeFileName(next.resumeFileName);
                  }}
                />
              );
            }
            if (stepId === "background-reminder" && interviewType) {
              return (
                <InterviewBackgroundReminderStep
                  hasResume={Boolean(resumeId)}
                  industry={interviewType.defaultIndustry}
                  interviewerName={listenerDisplayName || "Your interviewer"}
                  nav={nav}
                  roleTitle={interviewType.defaultRoleTitle}
                />
              );
            }

            return null;
          }}
          steps={engineType.setupSteps}
          typeSlug={engineType.slug}
          onBackFromStart={() => router.push("/")}
          onLaunch={({
            reportId: launchedId,
            cameraMode: locked,
            timeBudgetSeconds: launchedBudget,
          }) => {
            setReportId(launchedId);
            planPrefill.linkReport(launchedId);
            setCameraMode(locked);
            setPitchTurnStartedAt(null);
            setPitchTimerPhase("pitching");
            setFurthestSlide(0);
            setDeckBudgetSeconds(
              typeof launchedBudget === "number" ? launchedBudget : null,
            );
            setDeckSessionStartedAt(Date.now());
            setPhase("session");
          }}
        />
      </div>
    </div>
  );
}

/** Render a mode's [min, max] second envelope as "15–25 min". */
function formatEnvelopeRange([minSeconds, maxSeconds]: readonly [
  number,
  number,
]): string {
  return `${Math.round(minSeconds / 60)}–${Math.round(maxSeconds / 60)} min`;
}
