"use client";

import { CircleAlert } from "lucide-react";

/**
 * A non-blocking, non-distracting pill that appears while the student's face
 * is not being detected and FOLDS AWAY (not unmounts) when it is picked up
 * again. CONTEXT.md's verbatim word is "folds away" - an unmount is a
 * disappear, not a fold, and would also lose the transition, so this
 * component is always mounted and only its classes change.
 *
 * `pointer-events-none` so it can never intercept a click meant for the
 * session controls. `role="status"` + `aria-live="polite"` so it announces
 * without stealing focus - never `role="alert"`, which interrupts.
 *
 * This component shows NO live scoring and NO coaching - only the fact of
 * detection and the honest consequence (the Visual score is affected),
 * matching REQ-41's real behavior in `lib/metrics/coverage.ts`.
 *
 * `detail` overrides the consequence line. Practice omits it and gets
 * `PRACTICE_FACE_BANNER_DETAIL` (the Visual score is affected); coached mode
 * scores nothing live, so it passes its own honest consequence instead.
 */
export const PRACTICE_FACE_BANNER_DETAIL =
  "Move back into frame — this affects your Visual score.";

export interface FaceDetectionBannerProps {
  visible: boolean;
  /** The consequence line under the headline. Defaults to the practice copy. */
  detail?: string;
}

export function FaceDetectionBanner({
  visible,
  detail = PRACTICE_FACE_BANNER_DETAIL,
}: FaceDetectionBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        "fixed left-1/2 top-4 z-40 -translate-x-1/2 pointer-events-none overflow-hidden rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2 text-amber-900 shadow-md transition-all duration-300 " +
        (visible
          ? "max-h-16 opacity-100 translate-y-0"
          : "max-h-0 opacity-0 -translate-y-2 border-0 px-0 py-0")
      }
    >
      <div className="flex items-center gap-2">
        <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-medium">
            We can&apos;t see your face right now
          </span>
          <span className="text-xs text-amber-800">{detail}</span>
        </div>
      </div>
    </div>
  );
}

export default FaceDetectionBanner;
