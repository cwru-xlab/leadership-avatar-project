"use client";

/**
 * THE ONE camera-mode consent gate for every engine-backed practice type
 * (REQ-70).
 *
 * `CameraBlockReason` and `CAMERA_BLOCK_COPY` previously lived verbatim in both
 * `app/interview/[type]/page.tsx` and `app/case-play/[caseId]/page.tsx`. That
 * duplication is exactly what REQ-70 removes — new interaction types must
 * import from here rather than hand-copy the block screen a third time.
 *
 * Plans 13-11 and 13-13 delete the two legacy copies once those pages route
 * through this step.
 */

import MetricsConsentDialog from "@/components/metrics/MetricsConsentDialog";
import type { CameraMode } from "@/lib/metrics/types";
import { requestCameraStream } from "@/lib/metrics/visual-capture";
import { Button } from "@heroui/button";
import { ArrowRight, Camera, CameraOff, CircleAlert } from "lucide-react";
import { useState } from "react";

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
}

export default function CameraConsentStep({
  stepNumber,
  totalSteps,
  onBack,
  onLaunch,
  launching = false,
}: CameraConsentStepProps) {
  // Camera-mode decision, made BEFORE the session and LOCKED — see
  // 10-CONTEXT.md "Camera mode is locked at session start". Default OFF
  // deliberately: the measured path must be an affirmative choice, and the
  // server independently forces OFF without consent regardless (10-05).
  const [cameraMode, setCameraMode] = useState<CameraMode>("OFF");
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

  return (
    <>
      <section className="mx-auto max-w-3xl" aria-labelledby="camera-heading">
        <div className="rounded-2xl border border-[#d4e2e9] bg-white p-6 shadow-[0_12px_32px_rgba(30,68,85,0.07)] sm:p-9">
          <div className="flex items-start gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e0f3f9] text-[#08718d]">
              <Camera size={21} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#0a7391]">
                Step {stepNumber} of {totalSteps}
              </p>
              <h2
                id="camera-heading"
                className="mt-1 font-serif text-3xl tracking-[-0.03em]"
              >
                Practice with your camera on?
              </h2>
              <p className="mt-3 max-w-xl text-[15px] leading-7 text-[#58727f]">
                This choice is locked once the interview starts — you
                can&apos;t switch it part-way, in either direction.
              </p>
            </div>
          </div>

          {cameraBlock ? (
            <div className="mt-7 rounded-2xl border border-danger-200 bg-danger-50 p-6 text-danger-900">
              <div className="flex items-start gap-3">
                <CircleAlert size={22} className="mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-semibold">
                    {CAMERA_BLOCK_COPY[cameraBlock].heading}
                  </h3>
                  <p className="mt-1 text-sm leading-6">
                    {CAMERA_BLOCK_COPY[cameraBlock].body}
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  variant="flat"
                  isLoading={busy}
                  onPress={() => void probeCamera()}
                >
                  Try again
                </Button>
                <Button color="primary" onPress={chooseCameraOff}>
                  Continue with my camera off
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-7 grid gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  aria-pressed={cameraMode === "ON"}
                  onClick={() => void beginCameraOnFlow()}
                  disabled={busy}
                  className={`flex flex-col items-start gap-3 rounded-2xl border p-5 text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0a7391] ${cameraMode === "ON" ? "border-[#0a7391] bg-[#edf9fc] shadow-[0_12px_28px_rgba(16,104,133,0.14)]" : "border-[#d4e2e9] bg-white hover:border-[#82bdcf] hover:shadow-md"} disabled:cursor-not-allowed disabled:opacity-70`}
                >
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e0f3f9] text-[#08718d]">
                    <Camera size={19} />
                  </span>
                  <span className="font-serif text-xl">
                    Practice with my camera on
                  </span>
                  <span className="text-sm leading-6 text-[#58727f]">
                    Visual and Vocal will be scored.
                  </span>
                </button>
                <button
                  type="button"
                  aria-pressed={cameraMode === "OFF"}
                  onClick={chooseCameraOff}
                  disabled={busy}
                  className={`flex flex-col items-start gap-3 rounded-2xl border p-5 text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0a7391] ${cameraMode === "OFF" ? "border-[#0a7391] bg-[#edf9fc] shadow-[0_12px_28px_rgba(16,104,133,0.14)]" : "border-[#d4e2e9] bg-white hover:border-[#82bdcf] hover:shadow-md"} disabled:cursor-not-allowed disabled:opacity-70`}
                >
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eef2f4] text-[#526c7b]">
                    <CameraOff size={19} />
                  </span>
                  <span className="font-serif text-xl">Camera off</span>
                  <span className="text-sm leading-6 text-[#58727f]">
                    I&apos;ll practice without being measured. Visual and Vocal
                    won&apos;t be scored this time.
                  </span>
                </button>
              </div>

              <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-[#e0eaee] pt-6">
                <Button variant="light" onPress={onBack}>
                  Back
                </Button>
                <Button
                  color="primary"
                  isLoading={busy}
                  endContent={<ArrowRight size={17} />}
                  onPress={() =>
                    cameraMode === "ON"
                      ? void beginCameraOnFlow()
                      : chooseCameraOff()
                  }
                >
                  Start interview
                </Button>
              </div>
            </>
          )}
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
