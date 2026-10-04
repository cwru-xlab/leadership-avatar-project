"use client";

/**
 * Generic pre-session setup wizard (REQ-70).
 *
 * Owns step machinery, progress chrome, back/forward, the shared camera
 * consent gate, and (by default) the POST to `/api/practice/session/start`.
 * A type declares its steps via `InteractionTypeConfig.setupSteps`; each
 * step supplies its own render function. No type-specific branching lives
 * here — type-specific branching belongs in a step component, not this file.
 */

import CameraConsentStep from "@/components/practice/steps/CameraConsentStep";
import type { SetupStepDeclaration } from "@/lib/engine/types";
import type { CameraMode } from "@/lib/metrics/types";
import type { InteractionLog } from "@/types";
import { addToast } from "@heroui/toast";
import { Check } from "lucide-react";
import {
  Fragment,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from "react";

/** Result handed to the page after a successful (or bridged) launch. */
export interface SetupLaunchResult {
  reportId: string;
  cameraMode: CameraMode;
  /** Present for case-study — the S3 InteractionLog the client keeps writing. */
  log?: InteractionLog;
}

/**
 * Body fields the page contributes to POST /api/practice/session/start.
 * The wizard always adds `typeSlug` and `cameraMode` (the API's field name
 * for the student's locked choice — server resolves it as cameraModeRequest).
 */
export type PracticeStartPayload = Record<string, unknown>;

export interface SetupWizardProps {
  typeSlug: string;
  /** Type-declared steps (camera is appended by this component). */
  steps: SetupStepDeclaration[];
  /**
   * Map from step id → render function. Receives navigation helpers so a
   * step can advance, go back, or skip (optional steps).
   */
  renderStep: (stepId: string, nav: SetupStepNav) => ReactNode;
  /**
   * Builds the start-route body from the locked camera mode. Called only
   * when `createReportOnLaunch` is true (the default).
   */
  buildStartPayload?: (cameraMode: CameraMode) => PracticeStartPayload;
  /**
   * Called with `{reportId, cameraMode}` after launch. When
   * `createReportOnLaunch` is false, `reportId` is empty and the page/shell
   * is expected to create the report (InterviewSessionShell bridge until
   * plan 13-10).
   */
  onLaunch: (result: SetupLaunchResult) => void;
  /**
   * When true (default), POST `/api/practice/session/start` before calling
   * `onLaunch`. Set false while the existing InterviewSessionShell still
   * owns `ensureReport` so we do not leave orphan IN_PROGRESS rows.
   */
  createReportOnLaunch?: boolean;
  /** Accessible label for the progress row. */
  progressAriaLabel?: string;
  /**
   * Step id to open on mount (e.g. `"resume"` when returning from a session
   * via onExit — matching today's interview page). Ignored if unknown.
   */
  initialStepId?: string;
  /** Camera-gate primary CTA — forwarded to CameraConsentStep. */
  launchLabel?: string;
}

export interface SetupStepNav {
  /** Advance to the next declared step (or camera if this is the last). */
  goNext: () => void;
  /** Return to the previous declared step. */
  goBack: () => void;
  /** 1-based index among visible wizard steps (declared + camera). */
  stepNumber: number;
  /** Total visible steps including the camera gate. */
  totalSteps: number;
  /** Whether this step was declared `optional`. */
  optional: boolean;
}

const CAMERA_STEP_ID = "camera";

export default function SetupWizard({
  typeSlug,
  steps,
  renderStep,
  buildStartPayload,
  onLaunch,
  createReportOnLaunch = true,
  progressAriaLabel = "Interview setup progress",
  initialStepId,
  launchLabel,
}: SetupWizardProps) {
  const allSteps = useMemo(
    () => [
      ...steps,
      { id: CAMERA_STEP_ID, label: "Camera" } satisfies SetupStepDeclaration,
    ],
    [steps],
  );

  const initialIndex = useMemo(() => {
    if (!initialStepId) return 0;
    const idx = allSteps.findIndex((step) => step.id === initialStepId);
    return idx >= 0 ? idx : 0;
  }, [allSteps, initialStepId]);

  const [stepIndex, setStepIndex] = useState(initialIndex);
  const [launching, setLaunching] = useState(false);

  const current = allSteps[stepIndex] ?? allSteps[0];
  const totalSteps = allSteps.length;
  const stepNumber = stepIndex + 1;
  const isCamera = current?.id === CAMERA_STEP_ID;

  const goNext = useCallback(() => {
    setStepIndex((i) => Math.min(i + 1, allSteps.length - 1));
  }, [allSteps.length]);

  const goBack = useCallback(() => {
    setStepIndex((i) => Math.max(i - 1, 0));
  }, []);

  const handleCameraLaunch = useCallback(
    async (cameraMode: CameraMode) => {
      if (!createReportOnLaunch) {
        onLaunch({ reportId: "", cameraMode });
        return;
      }

      if (!buildStartPayload) {
        addToast({
          title: "Unable to start the session",
          description: "Missing start payload.",
          color: "danger",
        });
        return;
      }

      setLaunching(true);
      try {
        const body = {
          ...buildStartPayload(cameraMode),
          typeSlug,
          cameraMode,
        };
        const res = await fetch("/api/practice/session/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json().catch(() => ({}))) as {
          reportId?: string;
          cameraMode?: CameraMode;
          log?: InteractionLog;
          error?: string;
        };
        if (!res.ok || !data.reportId) {
          throw new Error(data.error || "Unable to start the session.");
        }
        onLaunch({
          reportId: data.reportId,
          cameraMode: data.cameraMode ?? cameraMode,
          log: data.log,
        });
      } catch (error) {
        addToast({
          title: "Unable to start the session",
          description: error instanceof Error ? error.message : undefined,
          color: "danger",
        });
      } finally {
        setLaunching(false);
      }
    },
    [buildStartPayload, createReportOnLaunch, onLaunch, typeSlug],
  );

  return (
    <div>
      <div className="mb-8 flex items-center gap-2" aria-label={progressAriaLabel}>
        {allSteps.map((step, index) => {
          const active = index === stepIndex;
          const complete = index < stepIndex;
          const number = String(index + 1).padStart(2, "0");
          return (
            <Fragment key={step.id}>
              {index > 0 && <div className="h-px flex-1 bg-[#ccdce3]" />}
              <ProgressItem
                active={active}
                complete={complete}
                number={number}
                label={step.label}
              />
            </Fragment>
          );
        })}
      </div>

      {isCamera ? (
        <CameraConsentStep
          stepNumber={stepNumber}
          totalSteps={totalSteps}
          onBack={goBack}
          onLaunch={(mode) => void handleCameraLaunch(mode)}
          launching={launching}
          launchLabel={launchLabel}
        />
      ) : (
        renderStep(current.id, {
          goNext,
          goBack,
          stepNumber,
          totalSteps,
          optional: Boolean(current.optional),
        })
      )}
    </div>
  );
}

function ProgressItem({
  active,
  complete,
  number,
  label,
}: {
  active: boolean;
  complete: boolean;
  number: string;
  label: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 text-xs font-semibold ${active ? "text-[#08718d]" : complete ? "text-[#327b68]" : "text-[#78909b]"}`}
    >
      <span
        className={`grid h-6 w-6 place-items-center rounded-full border text-[10px] ${active ? "border-[#08718d] bg-[#08718d] text-white" : complete ? "border-[#74bba8] bg-[#e5f5ee]" : "border-[#b8cbd3]"}`}
      >
        {complete ? <Check size={13} /> : number}
      </span>
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}
