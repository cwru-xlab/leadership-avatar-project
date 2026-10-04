"use client";

/**
 * Engine session page for instance-less types (the four interview presets).
 *
 * Hosts SetupWizard → InterviewSessionShell in ONE page with a step
 * transition (no navigation between them — matching today's interview
 * experience). Plan 13-10 swaps InterviewSessionShell for
 * PracticeSessionShell; plan 13-11 owns `/practice/[type]/[instanceId]`.
 *
 * Do not edit `app/interview/[type]/page.tsx` from here — that page stays
 * live until 13-13 so humans can compare the two wizards side by side.
 */

import InterviewSessionShell from "@/components/interview/InterviewSessionShell";
import SetupWizard, {
  type SetupStepNav,
} from "@/components/practice/SetupWizard";
import InterviewerStep, {
  type InterviewerOption,
} from "@/components/practice/steps/InterviewerStep";
import ResumeStep from "@/components/practice/steps/ResumeStep";
import type { InterviewCustomizationInput } from "@/lib/interview/customization";
import { resolveInterviewType } from "@/lib/interview/customization";
import { getEngineType } from "@/lib/engine/registry";
import { useLayout } from "@/lib/layout-context";
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
import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type PagePhase = "wizard" | "session";

export default function PracticeTypePage() {
  const params = useParams<{ type: string }>();
  const router = useRouter();
  const { setFullScreen } = useLayout();

  const engineType = useMemo(
    () => getEngineType(params.type),
    [params.type],
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
    () => resolveInterviewType(params.type, storedCustomization),
    [params.type, storedCustomization],
  );

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
  // /practice/[type]/[instanceId] — plan 13-11). Handled, never crashed.
  if (!engineType || engineType.instance.required || !interviewType) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#f5f8fa] p-6 text-[#102331]">
        <Card className="max-w-lg border border-[#d4e2e9] shadow-none">
          <CardBody className="items-start gap-4 p-8">
            <CircleAlert className="text-[#0a7391]" size={28} />
            <h1 className="font-serif text-3xl">
              That interview type is not available.
            </h1>
            <p className="text-[#526c7b]">
              Choose a practice interview from your Leadership Avatar workspace.
            </p>
            <Button color="primary" onPress={() => router.push("/")}>
              Back to practice
            </Button>
          </CardBody>
        </Card>
      </main>
    );
  }

  if (
    phase === "session" &&
    selectedInterviewer &&
    avatarConfig
  ) {
    return (
      <InterviewSessionShell
        interviewType={interviewType}
        customization={storedCustomization}
        interviewerName={
          storedCustomization?.personaDisplayName?.trim() ||
          selectedInterviewer.name
        }
        interviewerAvatarId={selectedInterviewer.avatarId}
        avatarConfig={avatarConfig}
        cameraMode={cameraMode}
        resumeText={resumeText}
        resumeFileName={resumeFileName}
        resumeId={resumeId}
        language="en"
        onExit={() => {
          setWizardStepId("resume");
          setPhase("wizard");
          setFullScreen(false);
        }}
        onFinish={(reportId) => {
          setFullScreen(false);
          // Report URL stays on the legacy path until plan 13-12/13-13;
          // only the wizard URL is sanctioned to change in this plan.
          router.push(`/interview/${interviewType.slug}/report/${reportId}`);
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
            type="button"
            className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[#47616f] transition-colors hover:text-[#0a7391] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0a7391]"
            onClick={() => router.push("/")}
          >
            <ArrowLeft size={16} /> Back to practice
          </button>
          <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_290px] lg:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0a7391]">
                Interview studio
              </p>
              <h1 className="mt-3 max-w-3xl font-serif text-4xl leading-[0.98] tracking-[-0.045em] text-[#102331] sm:text-6xl">
                A focused space to practice how you lead.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[#4e6977]">
                {interviewType.description}
              </p>
            </div>
            <div className="grid gap-3 rounded-2xl border border-[#c8dde5] bg-white/80 p-5 shadow-sm backdrop-blur-sm sm:grid-cols-3 lg:grid-cols-1">
              <Stat
                icon={<Clock3 size={18} />}
                value={`${interviewType.targetMinutes} min`}
                label="Practice"
              />
              <Stat
                icon={<UsersRound size={18} />}
                value="Live avatar"
                label="Interviewer"
              />
              <Stat
                icon={<LockKeyhole size={18} />}
                value="Private"
                label="Resume"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-12">
        <SetupWizard
          typeSlug={engineType.slug}
          steps={engineType.setupSteps}
          initialStepId={wizardStepId}
          // Bridge: InterviewSessionShell still owns ensureReport via the
          // legacy interview start route. Posting here would orphan a second
          // IN_PROGRESS row. Plan 13-10 flips createReportOnLaunch to true
          // when PracticeSessionShell consumes the wizard's reportId.
          createReportOnLaunch={false}
          onLaunch={({ cameraMode: locked }) => {
            setCameraMode(locked);
            setPhase("session");
          }}
          renderStep={(stepId: string, nav: SetupStepNav) => {
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
                  resumeId={resumeId}
                  resumeFileName={resumeFileName}
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
