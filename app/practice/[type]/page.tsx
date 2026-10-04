"use client";

/**
 * Engine session page for instance-less types (interview presets + networking).
 *
 * Hosts SetupWizard → PracticeSessionShell in ONE page with a step
 * transition (no navigation between them — matching today's interview
 * experience). Plan 13-11 owns `/practice/[type]/[instanceId]`.
 *
 * Do not edit `app/interview/[type]/page.tsx` from here — that page stays
 * live until 13-13 so humans can compare the two shells side by side.
 *
 * Networking registration (16-08): wires NetworkingPersonStep /
 * NetworkingGoalStep against the registry's setupSteps; reuses InterviewerStep
 * and SetupWizard's CameraConsentStep. No networking-specific picker or
 * consent gate.
 */

import type { InterviewCustomizationInput } from "@/lib/interview/customization";
import type { CameraMode } from "@/lib/metrics/types";
import type { StartAvatarRequest } from "@/types";

import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Spinner } from "@heroui/spinner";
import {
  ArrowLeft,
  CircleAlert,
  Clock3,
  LockKeyhole,
  UsersRound,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import PracticeSessionShell from "@/components/practice/PracticeSessionShell";
import SetupWizard, {
  type SetupStepNav,
} from "@/components/practice/SetupWizard";
import InterviewerStep, {
  type InterviewerOption,
} from "@/components/practice/steps/InterviewerStep";
import NetworkingGoalStep from "@/components/practice/steps/NetworkingGoalStep";
import NetworkingPersonStep from "@/components/practice/steps/NetworkingPersonStep";
import ResumeStep from "@/components/practice/steps/ResumeStep";
import { resolveInterviewType } from "@/lib/interview/customization";
import { getEngineType } from "@/lib/engine/registry";
import { resolveSessionConfig } from "@/lib/engine/resolve";
import { useLayout } from "@/lib/layout-context";

type PagePhase = "wizard" | "session";

export default function PracticeTypePage() {
  const params = useParams<{ type: string }>();
  const router = useRouter();
  const { setFullScreen } = useLayout();

  const engineType = useMemo(() => getEngineType(params.type), [params.type]);
  const isNetworking = engineType?.slug === "networking";

  // Read-once-then-clear handoff from the picker (see app/interview/page.tsx),
  // guarded by a ref so React strict-mode's double-invoke of the mount effect
  // cannot read (and clear) the key twice. A parse failure is treated exactly
  // as absence — the wizard degrades to the preset's own defaults.
  // Networking does not use this interview customization handoff.
  const handoffReadRef = useRef(false);
  const [storedCustomization, setStoredCustomization] =
    useState<InterviewCustomizationInput | null>(null);
  const [handoffResolved, setHandoffResolved] = useState(false);

  useEffect(() => {
    if (handoffReadRef.current) return;
    handoffReadRef.current = true;
    if (params.type === "networking") {
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

  const interviewType = useMemo(
    () =>
      isNetworking
        ? null
        : resolveInterviewType(params.type, storedCustomization),
    [params.type, storedCustomization, isNetworking],
  );

  const sessionConfig = useMemo(() => {
    const resolved = resolveSessionConfig(params.type, {
      customization: isNetworking ? undefined : storedCustomization,
    });

    return resolved.ok ? resolved.config : null;
  }, [params.type, storedCustomization, isNetworking]);

  const [phase, setPhase] = useState<PagePhase>("wizard");
  // When exiting a session, reopen the wizard on the resume step — same as
  // today's `setStep("resume")` on InterviewSessionShell onExit.
  const [wizardStepId, setWizardStepId] = useState<string | undefined>(
    undefined,
  );
  const [selectedInterviewer, setSelectedInterviewer] =
    useState<InterviewerOption | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [resumeFileName, setResumeFileName] = useState<string | undefined>();
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>("OFF");
  const [reportId, setReportId] = useState<string | null>(null);
  // Networking wizard state (16-08) — character XOR brought-in persona, plus goal.
  const [networkingCharacterId, setNetworkingCharacterId] = useState<
    string | null
  >(null);
  const [networkingInstanceId, setNetworkingInstanceId] = useState<
    string | null
  >(null);
  const [networkingGoal, setNetworkingGoal] = useState("");

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

  if (!handoffResolved) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#f5f8fa]">
        <Spinner color="primary" />
      </main>
    );
  }

  // Unknown slug OR a type that requires an instance (those live at
  // /practice/[type]/[instanceId] — plan 13-11). Networking is instance-
  // optional and registered here; interview presets still need interviewType.
  const typeAvailable =
    !!engineType &&
    !engineType.instance.required &&
    !!sessionConfig &&
    (isNetworking || !!interviewType);

  if (!typeAvailable || !engineType || !sessionConfig) {
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

  const pageDescription = interviewType?.description ?? engineType.description;
  const pageMinutes =
    interviewType?.targetMinutes ?? engineType.limits.targetMinutes;
  const reportTypeSlug = interviewType?.slug ?? engineType.slug;

  if (phase === "session" && selectedInterviewer && avatarConfig && reportId) {
    return (
      <PracticeSessionShell
        avatarConfig={avatarConfig}
        cameraMode={cameraMode}
        customization={storedCustomization}
        interviewerAvatarId={selectedInterviewer.avatarId}
        interviewerName={
          storedCustomization?.personaDisplayName?.trim() ||
          selectedInterviewer.name
        }
        language="en"
        reportId={reportId}
        resumeFileName={resumeFileName}
        resumeId={resumeId}
        resumeText={resumeText}
        sessionConfig={sessionConfig}
        onExit={() => {
          setWizardStepId(isNetworking ? "networking-person" : "resume");
          setPhase("wizard");
          setReportId(null);
          setFullScreen(false);
        }}
        onFinish={(finishedReportId) => {
          setFullScreen(false);
          router.push(`/practice/${reportTypeSlug}/report/${finishedReportId}`);
        }}
      />
    );
  }

  return (
    <main className="min-h-[100dvh] overflow-hidden bg-[#f5f8fa] text-[#102331]">
      <div className="relative isolate overflow-hidden border-b border-[#d8e6ec] bg-[#eaf5f8]">
        <div className="absolute -right-24 top-[-150px] h-96 w-96 rounded-full bg-[#a9ddeb]/60 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-5 pb-12 pt-7 sm:px-8 sm:pb-16">
          <button
            className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[#47616f] transition-colors hover:text-[#0a7391] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0a7391]"
            type="button"
            onClick={() => router.push("/")}
          >
            <ArrowLeft size={16} /> Back to practice
          </button>
          <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_290px] lg:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0a7391]">
                {isNetworking ? "Networking studio" : "Interview studio"}
              </p>
              <h1 className="mt-3 max-w-3xl font-serif text-4xl leading-[0.98] tracking-[-0.045em] text-[#102331] sm:text-6xl">
                {isNetworking
                  ? "Practice the conversation before it counts."
                  : "A focused space to practice how you lead."}
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[#4e6977]">
                {pageDescription}
              </p>
            </div>
            <div className="grid gap-3 rounded-2xl border border-[#c8dde5] bg-white/80 p-5 shadow-sm backdrop-blur-sm sm:grid-cols-3 lg:grid-cols-1">
              <Stat
                icon={<Clock3 size={18} />}
                label="Practice"
                value={`${pageMinutes} min`}
              />
              <Stat
                icon={<UsersRound size={18} />}
                label={isNetworking ? "Contact" : "Interviewer"}
                value="Live avatar"
              />
              <Stat
                icon={<LockKeyhole size={18} />}
                label={isNetworking ? "Goal" : "Resume"}
                value="Private"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-12">
        <SetupWizard
          createReportOnLaunch
          buildStartPayload={() =>
            isNetworking
              ? {
                  instanceId: networkingInstanceId,
                  customization: {
                    characterId: networkingCharacterId,
                    goal: networkingGoal.trim(),
                  },
                  interviewerAvatarId: selectedInterviewer?.avatarId,
                  interviewerName: selectedInterviewer?.name,
                  language: "en",
                }
              : {
                  customization: storedCustomization,
                  interviewerAvatarId: selectedInterviewer?.avatarId,
                  interviewerName:
                    storedCustomization?.personaDisplayName?.trim() ||
                    selectedInterviewer?.name,
                  resumeId,
                  resumeText,
                  language: "en",
                }
          }
          initialStepId={wizardStepId}
          progressAriaLabel={
            isNetworking
              ? "Networking setup progress"
              : "Interview setup progress"
          }
          renderStep={(stepId: string, nav: SetupStepNav) => {
            if (stepId === "networking-person") {
              return (
                <NetworkingPersonStep
                  characterId={networkingCharacterId}
                  instanceId={networkingInstanceId}
                  nav={nav}
                  onChange={({ characterId, instanceId }) => {
                    setNetworkingCharacterId(characterId);
                    setNetworkingInstanceId(instanceId);
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

            return null;
          }}
          steps={engineType.setupSteps}
          typeSlug={engineType.slug}
          onLaunch={({ reportId: launchedId, cameraMode: locked }) => {
            setReportId(launchedId);
            setCameraMode(locked);
            setPhase("session");
          }}
        />
      </div>
    </main>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[#52707d]">
      <span className="text-[#0a7391]">{icon}</span>
      <div>
        <p className="text-sm font-semibold text-[#183947]">{value}</p>
        <p className="text-xs">{label}</p>
      </div>
    </div>
  );
}
