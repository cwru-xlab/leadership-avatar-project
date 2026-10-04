"use client";

/**
 * Engine session page for types with `instance.required: true`
 * (case-study and difficult-conversation).
 *
 * Case-study: SetupWizard (InstanceIntroStep → CameraConsentStep) then
 * PracticeSessionShell via CaseStudySessionView.
 *
 * Difficult-conversation: ConversationBriefingStep →
 * ConversationDifficultyStep → CameraConsentStep, then the shell with
 * SessionSafetyPanel + InCharacterClosePrompt in the existing sessionPanel
 * slot (consumed from 14-10 / parallel Phase 14 — not a second mechanism).
 */

import PracticeSessionShell, {
  type SessionFinishFn,
} from "@/components/practice/PracticeSessionShell";
import SetupWizard, {
  type SetupStepNav,
} from "@/components/practice/SetupWizard";
import InCharacterClosePrompt from "@/components/practice/panels/InCharacterClosePrompt";
import SessionSafetyPanel from "@/components/practice/panels/SessionSafetyPanel";
import ConversationBriefingStep from "@/components/practice/steps/ConversationBriefingStep";
import ConversationDifficultyStep from "@/components/practice/steps/ConversationDifficultyStep";
import InstanceIntroStep from "@/components/practice/steps/InstanceIntroStep";
import { getEngineType } from "@/lib/engine/registry";
import { resolveSessionConfig } from "@/lib/engine/resolve";
import type { DifficultConversationInstance } from "@/lib/engine/types";
import { useLayout } from "@/lib/layout-context";
import type { DifficultyBand } from "@/lib/difficult-conversation/types";
import type { CameraMode } from "@/lib/metrics/types";
import type { CaseStudy, InteractionLog, StartAvatarRequest } from "@/types";
import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Spinner } from "@heroui/spinner";
import { addToast } from "@heroui/toast";
import { ArrowLeft, CircleAlert } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type PagePhase = "wizard" | "session";

export default function PracticeInstancePage() {
  const params = useParams<{ type: string; instanceId: string }>();
  const router = useRouter();
  const { setFullScreen } = useLayout();

  const typeSlug = params.type;
  const instanceId = params.instanceId;

  const engineType = useMemo(() => getEngineType(typeSlug), [typeSlug]);
  const isDifficultConversation =
    engineType?.slug === "difficult-conversation";

  const [caseData, setCaseData] = useState<CaseStudy | null>(null);
  const [dcInstance, setDcInstance] =
    useState<DifficultConversationInstance | null>(null);
  const [dcTitle, setDcTitle] = useState("");
  const [difficulty, setDifficulty] = useState<DifficultyBand | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [avatarPortraits, setAvatarPortraits] = useState<
    Record<string, string | undefined>
  >({});

  const [phase, setPhase] = useState<PagePhase>("wizard");
  const [cameraMode, setCameraMode] = useState<CameraMode>("OFF");
  const [reportId, setReportId] = useState<string | null>(null);
  const [interactionLog, setInteractionLog] = useState<InteractionLog | null>(
    null,
  );
  const [ending, setEnding] = useState(false);
  const sessionFinishRef = useRef<SessionFinishFn | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        if (typeSlug === "difficult-conversation") {
          const res = await fetch(
            `/api/difficult-conversation/play?id=${encodeURIComponent(instanceId)}`,
          );
          if (!res.ok) throw new Error("Conversation not found");
          const data = (await res.json()) as {
            instance: DifficultConversationInstance;
            title: string;
          };
          if (cancelled) return;
          setDcInstance(data.instance);
          setDcTitle(data.title);
          setDifficulty(data.instance.difficulty);
          setCaseData(null);
        } else {
          const res = await fetch(
            `/api/case/get?id=${encodeURIComponent(instanceId)}`,
          );
          if (!res.ok) throw new Error("Case not found");
          const data = await res.json();
          if (cancelled) return;
          setCaseData(data.caseStudy as CaseStudy);
          setDcInstance(null);
        }
      } catch (err) {
        console.error("Failed to load instance:", err);
        if (!cancelled) {
          setLoadError(
            typeSlug === "difficult-conversation"
              ? "This conversation is not available."
              : "This scenario is not available.",
          );
          addToast({
            title:
              typeSlug === "difficult-conversation"
                ? "Failed to load conversation"
                : "Failed to load case",
            color: "danger",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [instanceId, typeSlug]);

  // Portrait fetch — case-study only (profile-linked avatars).
  useEffect(() => {
    if (!caseData?.avatars) return;
    const withProfiles = caseData.avatars.filter((a) => a.profileId);
    if (withProfiles.length === 0) return;
    let cancelled = false;
    Promise.all(
      withProfiles.map(async (avatar) => {
        try {
          const res = await fetch(
            `/api/profile/get?id=${encodeURIComponent(avatar.profileId!)}`,
          );
          if (!res.ok) return null;
          const data = await res.json();
          const portrait = data.profile?.portrait as string | undefined;
          if (portrait) return { id: avatar.id, portrait };
        } catch {
          /* ignore */
        }
        return null;
      }),
    ).then((results) => {
      if (cancelled) return;
      const next: Record<string, string | undefined> = {};
      for (const r of results) {
        if (r) next[r.id] = r.portrait;
      }
      setAvatarPortraits(next);
    });
    return () => {
      cancelled = true;
    };
  }, [caseData]);

  const effectiveDifficulty: DifficultyBand =
    difficulty ?? dcInstance?.difficulty ?? "guarded";

  const sessionConfig = useMemo(() => {
    if (isDifficultConversation && dcInstance) {
      const resolved = resolveSessionConfig(typeSlug, {
        instance: { ...dcInstance, difficulty: effectiveDifficulty },
      });
      return resolved.ok ? resolved.config : null;
    }
    if (!caseData) return null;
    const resolved = resolveSessionConfig(typeSlug, {
      instance: {
        kind: "case-study",
        caseId: caseData.id,
        caseName: caseData.name,
        background: caseData.backgroundInfo,
        avatars: caseData.avatars.map((a) => ({
          name: a.name,
          role: a.role,
          additionalInfo: a.additionalInfo,
        })),
        criteria: caseData.evaluationPrompt ?? null,
      },
    });
    return resolved.ok ? resolved.config : null;
  }, [
    caseData,
    dcInstance,
    effectiveDifficulty,
    isDifficultConversation,
    typeSlug,
  ]);

  const dcAvatarConfig: StartAvatarRequest | null = useMemo(() => {
    if (!dcInstance?.avatarId || !dcInstance.voiceId) return null;
    return {
      quality: "low",
      avatarName: dcInstance.avatarId,
      voice: {
        voiceId: dcInstance.voiceId,
        rate: 1.05,
      },
      language: "en",
    };
  }, [dcInstance]);

  useEffect(() => {
    setFullScreen(phase === "session");
    return () => setFullScreen(false);
  }, [setFullScreen, phase]);

  // Unknown slug, or a type that does not take an instance (those live at
  // /practice/[type]). Handled, never crashed.
  if (!engineType || !engineType.instance.required) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#f5f8fa] p-6 text-[#102331]">
        <Card className="max-w-lg border border-[#d4e2e9] shadow-none">
          <CardBody className="items-start gap-4 p-8">
            <CircleAlert className="text-[#0a7391]" size={28} />
            <h1 className="font-serif text-3xl">
              That practice type is not available.
            </h1>
            <p className="text-[#526c7b]">
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

  if (loading) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#f5f8fa]">
        <Spinner
          color="primary"
          label={
            isDifficultConversation
              ? "Loading conversation..."
              : "Loading case..."
          }
        />
      </main>
    );
  }

  if (isDifficultConversation) {
    if (!dcInstance || loadError || !sessionConfig || !dcAvatarConfig) {
      return (
        <main className="mx-auto max-w-4xl px-5 py-12 text-center text-[#102331]">
          <p className="mb-4 text-lg text-danger">
            {loadError ?? "Conversation not found"}
          </p>
          <Button
            onPress={() => router.push("/conversations")}
            startContent={<ArrowLeft className="h-4 w-4" />}
          >
            Back to Conversations
          </Button>
        </main>
      );
    }

    const briefingFields = {
      role: dcInstance.role,
      studentRole: dcInstance.studentRole,
      situation: dcInstance.situation,
      sharedBackstory: dcInstance.sharedBackstory,
      studentObjective: dcInstance.studentObjective,
      stakes: dcInstance.stakes,
    };

    const finishWith = async (opts: {
      reason: string;
      source: "student" | "avatar";
    }) => {
      setEnding(true);
      try {
        await sessionFinishRef.current?.(opts);
      } finally {
        setEnding(false);
      }
    };

    if (phase === "session" && reportId) {
      return (
        <PracticeSessionShell
          sessionConfig={sessionConfig}
          reportId={reportId}
          cameraMode={cameraMode}
          avatarConfig={dcAvatarConfig}
          interviewerName={dcInstance.role}
          interviewerAvatarId={dcInstance.avatarId}
          language="en"
          hideDefaultEndControl
          autoFinishOnAvatarEnd
          sessionFinishRef={sessionFinishRef}
          sessionPanel={
            <div className="flex w-full flex-col items-stretch gap-1">
              <SessionSafetyPanel
                isEnding={ending}
                onEndSession={finishWith}
              />
              <InCharacterClosePrompt
                isClosing={ending}
                onConfirmClose={finishWith}
              />
            </div>
          }
          onExit={() => {
            setPhase("wizard");
            setReportId(null);
            setFullScreen(false);
          }}
          onFinish={(finishedReportId) => {
            setFullScreen(false);
            router.push(
              `/practice/difficult-conversation/report/${finishedReportId}`,
            );
          }}
        />
      );
    }

    return (
      <main className="min-h-[100dvh] overflow-hidden bg-[#f5f8fa] text-[#102331]">
        <div className="relative isolate overflow-hidden border-b border-[#d8e6ec] bg-[#eaf5f8]">
          <div className="absolute -right-24 top-[-150px] h-96 w-96 rounded-full bg-[#a9ddeb]/60 blur-3xl" />
          <div className="relative mx-auto max-w-6xl px-5 pb-10 pt-7 sm:px-8">
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[#47616f] transition-colors hover:text-[#0a7391] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0a7391]"
              onClick={() => router.push("/conversations")}
            >
              <ArrowLeft size={16} /> Back to Conversations
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-12">
          <SetupWizard
            typeSlug={engineType.slug}
            steps={engineType.setupSteps}
            createReportOnLaunch
            progressAriaLabel="Conversation setup progress"
            launchLabel="Start conversation"
            buildStartPayload={() => ({
              instanceId: dcInstance.conversationId,
              difficulty: effectiveDifficulty,
              language: "en",
              interviewerAvatarId: dcInstance.avatarId,
              interviewerName: dcInstance.role,
            })}
            onLaunch={({ reportId: launchedId, cameraMode: locked }) => {
              setReportId(launchedId);
              setCameraMode(locked);
              setPhase("session");
            }}
            renderStep={(stepId: string, nav: SetupStepNav) => {
              if (stepId === "conversation-briefing") {
                return (
                  <ConversationBriefingStep
                    nav={nav}
                    title={dcTitle}
                    briefing={briefingFields}
                  />
                );
              }
              if (stepId === "conversation-difficulty") {
                return (
                  <ConversationDifficultyStep
                    nav={nav}
                    difficulty={difficulty}
                    defaultDifficulty={dcInstance.difficulty}
                    onSelect={setDifficulty}
                  />
                );
              }
              return null;
            }}
          />
        </div>
      </main>
    );
  }

  // ---- case-study path (unchanged shape) ----
  if (!caseData || loadError || !sessionConfig) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-12 text-center text-[#102331]">
        <p className="mb-4 text-lg text-danger">
          {loadError ?? "Case not found"}
        </p>
        <Button
          onPress={() => router.push("/case-play")}
          startContent={<ArrowLeft className="h-4 w-4" />}
        >
          Back to Cases
        </Button>
      </main>
    );
  }

  // Playability: student-authored only (ownerId). Admin cases stay on /case-play.
  if (!caseData.ownerId) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-12 text-center text-[#102331]">
        <p className="mb-4 text-lg text-danger">
          This scenario is not available.
        </p>
        <Button
          onPress={() => router.push("/case-play")}
          startContent={<ArrowLeft className="h-4 w-4" />}
        >
          Back to Cases
        </Button>
      </main>
    );
  }

  if (phase === "session" && reportId && interactionLog) {
    return (
      <PracticeSessionShell
        sessionConfig={sessionConfig}
        reportId={reportId}
        cameraMode={cameraMode}
        caseStudy={caseData}
        interactionLog={interactionLog}
        language="en"
        onExit={() => {
          setPhase("wizard");
          setReportId(null);
          setInteractionLog(null);
          setFullScreen(false);
        }}
        onFinish={(finishedReportId) => {
          setFullScreen(false);
          router.push(`/practice/case-study/report/${finishedReportId}`);
        }}
      />
    );
  }

  return (
    <main className="min-h-[100dvh] overflow-hidden bg-[#f5f8fa] text-[#102331]">
      <div className="relative isolate overflow-hidden border-b border-[#d8e6ec] bg-[#eaf5f8]">
        <div className="absolute -right-24 top-[-150px] h-96 w-96 rounded-full bg-[#a9ddeb]/60 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-5 pb-10 pt-7 sm:px-8">
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[#47616f] transition-colors hover:text-[#0a7391] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0a7391]"
            onClick={() => router.push("/case-play")}
          >
            <ArrowLeft size={16} /> Back to Cases
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-12">
        <SetupWizard
          typeSlug={engineType.slug}
          steps={engineType.setupSteps}
          createReportOnLaunch
          progressAriaLabel="Scenario setup progress"
          launchLabel="Start"
          buildStartPayload={() => ({
            instanceId: caseData.id,
            language: "en",
          })}
          onLaunch={({
            reportId: launchedId,
            cameraMode: locked,
            log,
          }) => {
            if (!log) {
              addToast({
                title: "Unable to start the session",
                description: "Missing interaction log from session start.",
                color: "danger",
              });
              return;
            }
            setReportId(launchedId);
            setCameraMode(locked);
            setInteractionLog(log);
            setPhase("session");
          }}
          renderStep={(stepId: string, nav: SetupStepNav) => {
            if (stepId === "intro") {
              return (
                <InstanceIntroStep
                  nav={nav}
                  name={caseData.name}
                  background={caseData.backgroundInfo}
                  avatars={caseData.avatars}
                  avatarPortraits={avatarPortraits}
                  continueLabel="Continue"
                />
              );
            }
            return null;
          }}
        />
      </div>
    </main>
  );
}
