"use client";

/**
 * THE ONE camera-mode consent gate for every engine-backed practice type
 * (REQ-70), and for coached sessions (Phase 22 G3). Lives in the shared
 * session chrome (`components/session/`, 22-SHARED-SHELL-DECISION.md) so both
 * the practice wizard and the coached shell use this single copy.
 *
 * `CameraBlockReason` and `CAMERA_BLOCK_COPY` previously lived verbatim in both
 * `app/interview/[type]/page.tsx` and `app/case-play/[caseId]/page.tsx`. That
 * duplication is exactly what REQ-70 removes — new interaction types must
 * import from here rather than hand-copy the block screen a third time.
 *
 * Plans 13-11 and 13-13 delete the two legacy copies once those pages route
 * through this step.
 */

import MetricsConsentDialog from "@/components/session/MetricsConsentDialog";
import StepTracker from "@/components/shell/StepTracker";
import type { CameraMode } from "@/lib/metrics/types";
import { requestCameraStream } from "@/lib/metrics/visual-capture";
import { Button } from "@heroui/button";
import {
  ArrowRight,
  Camera,
  CameraOff,
  Check,
  CircleAlert,
  Headphones,
  ScanFace,
  Sun,
} from "lucide-react";
import { type ReactNode, useState } from "react";

export type CameraBlockReason = "DENIED" | "NOT_FOUND" | "UNAVAILABLE";

export const CAMERA_BLOCK_COPY: Record<
  CameraBlockReason,
  { heading: string; body: string }
> = {
  DENIED: {
    heading: "We can't access your camera",
    body: "Your browser is blocking camera access for this site. Allow it in your browser's site settings, then try again.",
  },
  NOT_FOUND: {
    heading: "We can't access your camera",
    body: "We couldn't find a camera on this device.",
  },
  UNAVAILABLE: {
    heading: "We can't access your camera",
    body: "Your camera is in use by another app. Close it and try again.",
  },
};

export interface CameraConsentStepProps {
  /** 1-based step index for the "Step N of M" chrome (verbatim from today). */
  stepNumber: number;
  totalSteps: number;
  onBack: () => void;
  /**
   * Called once the camera-mode decision is locked and any ON-path probe has
   * succeeded (or the student chose OFF / declined consent). The wizard owns
   * posting to `/api/practice/session/start` and transitioning to session.
   */
  onLaunch: (cameraMode: CameraMode) => void;
  /** True while the parent wizard is posting the start request. */
  launching?: boolean;
  /**
   * Primary CTA label. Interview presets use "Start interview"; case-study
   * uses "Start" to match today's case-play intro (REQ-69).
   */
  launchLabel?: string;
  /**
   * The noun in "This choice is locked once the {sessionNoun} starts".
   * Defaults to "interview" so every practice type renders exactly as it did
   * before this step moved into the shared session chrome; a coached session
   * passes "session".
   */
  sessionNoun?: string;
  /**
   * Line under "Practice with my camera on". Defaults to the practice copy,
   * byte-identical; a coached session passes its own (it feeds a summary, not
   * a scored report).
   */
  cameraOnDescription?: ReactNode;
  /** Line under "Camera off". Defaults to the practice copy, byte-identical. */
  cameraOffDescription?: ReactNode;
  /** False when the host (the setup wizard) already shows step progress. */
  showProgress?: boolean;
}

export default function CameraConsentStep({
  stepNumber,
  totalSteps,
  onBack,
  onLaunch,
  launching = false,
  launchLabel = "Start interview",
  sessionNoun = "interview",
  cameraOnDescription = "Visual and Vocal will be scored.",
  showProgress = true,
  cameraOffDescription = (
    <>
      I&apos;ll practice without being measured. Visual and Vocal
      won&apos;t be scored this time.
    </>
  ),
}: CameraConsentStepProps) {
  // Camera-mode decision, made BEFORE the session and LOCKED — see
  // 10-CONTEXT.md "Camera mode is locked at session start".
  //
  // Defaults to ON so the camera-on card carries the highlight on load, which
  // is the nudge issue #49 asks for: students read the highlighted card as the
  // recommended one. This moves the HIGHLIGHT only — it does not pre-grant the
  // measured path. A student who has never consented still meets
  // `MetricsConsentDialog` before any camera opens, declining still launches
  // OFF, and `resolveCameraMode` in lib/engine/session.ts independently forces
  // OFF without a stored consent regardless of what the client sends (10-05).
  const [cameraMode, setCameraMode] = useState<CameraMode>("ON");
  const [consentAccepted, setConsentAccepted] = useState<boolean | null>(null);
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [cameraBlock, setCameraBlock] = useState<CameraBlockReason | null>(null);
  const [probing, setProbing] = useState(false);

  // Probe camera access (permission + availability), then immediately stop
  // the probe's own tracks — this is a check, not the session stream; the
  // shell requests its own stream once the avatar has connected (10-09
  // Task 2). Leaving this stream live would hold the camera LED on through
  // the rest of the wizard.
  const probeCamera = async () => {
    setProbing(true);
    setCameraBlock(null);
    try {
      const result = await requestCameraStream();
      if (result.ok) {
        result.stream.getTracks().forEach((track) => track.stop());
        onLaunch("ON");
        return;
      }
      setCameraBlock(result.reason);
    } finally {
      setProbing(false);
    }
  };

  const beginCameraOnFlow = async () => {
    setCameraMode("ON");
    if (consentAccepted) {
      await probeCamera();
      return;
    }
    try {
      const res = await fetch("/api/metrics/consent", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        acceptedAt?: string | null;
      };
      if (data.acceptedAt) {
        setConsentAccepted(true);
        await probeCamera();
        return;
      }
    } catch {
      // Treat a failed consent check the same as "not yet accepted" — show
      // the dialog rather than silently starting a measured session.
    }
    setShowConsentDialog(true);
  };

  const handleConsentAccept = () => {
    setShowConsentDialog(false);
    setConsentAccepted(true);
    void probeCamera();
  };

  const handleConsentDecline = () => {
    setShowConsentDialog(false);
    setCameraMode("OFF");
    onLaunch("OFF");
  };

  const chooseCameraOff = () => {
    setCameraMode("OFF");
    setCameraBlock(null);
    onLaunch("OFF");
  };

  const busy = probing || launching;

  const choiceClass = (selected: boolean) =>
    `flex w-full items-center gap-3.5 rounded-xl border p-4 text-left transition-colors duration-150 ease-out focus-visible:outline-true-blue disabled:cursor-not-allowed disabled:opacity-70 ${
      selected ? "border-2 border-true-blue bg-light-blue/22" : "border-line bg-white hover:border-true-blue/50"
    }`;

  return (
    <>
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-5" aria-labelledby="camera-heading">
        {/* Progress through the setup steps; a wizard that draws its own
            tracker turns this one off. */}
        {showProgress ? (
          <div className="w-full max-w-md self-end">
            <StepTracker
              ariaLabel={`Step ${stepNumber} of ${totalSteps}`}
              current={stepNumber - 1}
              labels={Array.from({ length: totalSteps }, (_, i) =>
                i === stepNumber - 1 ? "Camera" : i < stepNumber - 1 ? (i === 0 ? "Brief" : `Step ${i + 1}`) : "Practice",
              )}
            />
          </div>
        ) : null}

        <div className="grid items-stretch gap-6 lg:grid-cols-[1.1fr_1fr]">
          {/* The stage. No camera opens here: consent comes first, and the
              session asks for its own stream once the avatar connects. */}
          <div className="relative grid min-h-[300px] place-items-center overflow-hidden rounded-xl bg-ink lg:min-h-[420px]">
            <svg aria-hidden className="w-1/2 max-w-[260px] opacity-60" viewBox="0 0 200 160">
              <circle className="fill-light-blue/35" cx="100" cy="62" r="34" />
              <path className="fill-light-blue/25" d="M30 160c4-40 34-58 70-58s66 18 70 58z" />
            </svg>
            <div className="absolute inset-x-4 bottom-4 flex flex-col gap-2 rounded-xl bg-white/[0.08] p-4 text-[13.5px] text-white">
              {[
                { icon: Sun, text: "Face a light source" },
                { icon: ScanFace, text: "Center yourself in the frame" },
                { icon: Headphones, text: "Headphones help the avatar hear you" },
              ].map(({ icon: Icon, text }) => (
                <span key={text} className="flex items-center gap-2.5">
                  <Icon aria-hidden className="text-light-blue" size={16} />
                  {text}
                </span>
              ))}
            </div>
            <span className="absolute left-4 top-4 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
              Your camera turns on only when the {sessionNoun} starts
            </span>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <h2 id="camera-heading" className="font-display text-[28px] font-medium leading-[1.15] text-cwru-blue md:text-[30px]">
                Practice with your camera on?
              </h2>
              <p className="text-[15px] leading-6 text-muted">
                This choice is locked once the {sessionNoun} starts — you
                can&apos;t switch it part-way, in either direction.
              </p>
            </div>

            {cameraBlock ? (
              <div role="alert" className="flex flex-col gap-4 rounded-xl border border-copper/40 bg-copper/[0.08] p-5 text-ink">
                <div className="flex items-start gap-3">
                  <CircleAlert size={22} className="mt-0.5 shrink-0 text-copper-deep" />
                  <div>
                    <h3 className="font-semibold">{CAMERA_BLOCK_COPY[cameraBlock].heading}</h3>
                    <p className="mt-1 text-sm leading-6">{CAMERA_BLOCK_COPY[cameraBlock].body}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="bordered" isLoading={busy} onPress={() => void probeCamera()}>
                    Try again
                  </Button>
                  <Button color="primary" onPress={chooseCameraOff}>
                    Continue with my camera off
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  aria-pressed={cameraMode === "ON"}
                  onClick={() => void beginCameraOnFlow()}
                  disabled={busy}
                  className={choiceClass(cameraMode === "ON")}
                >
                  <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${cameraMode === "ON" ? "bg-cwru-blue text-white" : "bg-canvas text-cwru-blue"}`}>
                    <Camera size={22} />
                  </span>
                  <span className="flex flex-1 flex-col">
                    <span className="text-[15.5px] font-bold text-ink">Practice with my camera on</span>
                    <span className="text-[13.5px] leading-5 text-muted">{cameraOnDescription}</span>
                  </span>
                  <SelectedMark selected={cameraMode === "ON"} />
                </button>
                <button
                  type="button"
                  aria-pressed={cameraMode === "OFF"}
                  onClick={chooseCameraOff}
                  disabled={busy}
                  className={choiceClass(cameraMode === "OFF")}
                >
                  <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${cameraMode === "OFF" ? "bg-cwru-blue text-white" : "bg-canvas text-cwru-blue"}`}>
                    <CameraOff size={22} />
                  </span>
                  <span className="flex flex-1 flex-col">
                    <span className="text-[15.5px] font-bold text-ink">Camera off</span>
                    <span className="text-[13.5px] leading-5 text-muted">{cameraOffDescription}</span>
                  </span>
                  <SelectedMark selected={cameraMode === "OFF"} />
                </button>

                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
                  <Button className="font-semibold text-link" variant="light" onPress={onBack}>
                    Back
                  </Button>
                  <Button
                    className="h-11 rounded-lg px-5 font-bold"
                    color="primary"
                    isLoading={busy}
                    endContent={<ArrowRight size={17} />}
                    onPress={() =>
                      cameraMode === "ON"
                        ? void beginCameraOnFlow()
                        : chooseCameraOff()
                    }
                  >
                    {launchLabel}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <MetricsConsentDialog
        open={showConsentDialog}
        onAccept={handleConsentAccept}
        onDecline={handleConsentDecline}
      />
    </>
  );
}

function SelectedMark({ selected }: { selected: boolean }) {
  return selected ? (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-true-blue text-white">
      <Check aria-hidden size={14} strokeWidth={3} />
    </span>
  ) : (
    <span aria-hidden className="size-6 shrink-0 rounded-full border-2 border-line" />
  );
}
