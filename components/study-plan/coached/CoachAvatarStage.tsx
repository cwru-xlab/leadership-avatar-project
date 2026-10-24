"use client";

/**
 * Plan 22-06: the coach's video presence in a coached session.
 *
 * This is the SECOND avatar mount (22-AVATAR-MOUNT-DECISION.md): it reuses the
 * shared `InteractiveAvatarWrapper` primitive directly and deliberately does
 * not touch or import anything under the practice component tree.
 *
 * The parent mounts this ONLY after the student has consented to the work
 * (22-14), so `autoStart` is correct and no avatar speaks before consent.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import InteractiveAvatarWrapper, {
  type InteractiveAvatarRef,
} from "@/components/HeyGenAvatar/InteractiveAvatar";
import { StreamingAvatarSessionState } from "@/components/HeyGenAvatar/logic";
import type { StartAvatarRequest } from "@/types";

// Well inside any provider idle window; one request every 30s while mounted.
const KEEP_ALIVE_INTERVAL_MS = 30_000;

export interface CoachAvatarHandle {
  speak: (text: string) => void;
  waitForSpeechEnd: (maxMs: number) => Promise<void>;
  interrupt: () => void;
  stop: () => void;
  isReady: () => boolean;
}

interface CoachAvatarStageProps {
  coach: { name: string; avatarId: string; voiceId: string };
  onReady?: () => void;
  onError?: (message: string) => void;
}

const CoachAvatarStage = forwardRef<CoachAvatarHandle, CoachAvatarStageProps>(
  ({ coach, onReady, onError }, ref) => {
    const avatarRef = useRef<InteractiveAvatarRef>(null);
    const readyRef = useRef(false);
    const [failed, setFailed] = useState(false);

    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady;
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    const config = useMemo<StartAvatarRequest>(
      () => ({
        quality: "low",
        avatarName: coach.avatarId,
        knowledgeId: undefined,
        voice: { rate: 1.0, voiceId: coach.voiceId, emotion: undefined },
        language: "en",
      }),
      [coach.avatarId, coach.voiceId],
    ) as StartAvatarRequest;

    const handleStateChange = useCallback(
      (state: StreamingAvatarSessionState) => {
        if (state === StreamingAvatarSessionState.CONNECTED) {
          readyRef.current = true;
          setFailed(false);
          onReadyRef.current?.();
        } else if (state === StreamingAvatarSessionState.INACTIVE) {
          readyRef.current = false;
        }
      },
      [],
    );

    // Degraded mode on vendor failure (the shell keeps the conversation
    // usable as captions) — NOT a design alternative to the video coach.
    const handleTokenError = useCallback(() => {
      readyRef.current = false;
      setFailed(true);
      onErrorRef.current?.("The video coach couldn't connect.");
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        speak: (text: string) => avatarRef.current?.speak(text),
        waitForSpeechEnd: async (maxMs: number) => {
          await avatarRef.current?.waitForSpeechEnd(maxMs);
        },
        interrupt: () => avatarRef.current?.interrupt(),
        stop: () => avatarRef.current?.stopSession(),
        isReady: () => readyRef.current,
      }),
      [],
    );

    useEffect(() => {
      const timer = window.setInterval(() => {
        if (!readyRef.current) return;
        void avatarRef.current?.keepAlive().catch(() => {});
      }, KEEP_ALIVE_INTERVAL_MS);
      const avatar = avatarRef;
      return () => {
        window.clearInterval(timer);
        avatar.current?.stopSession();
      };
    }, []);

    return (
      <div
        className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/20 bg-black/80 shadow-xl"
        aria-label={`Live video of ${coach.name}`}
      >
        {failed ? (
          <p className="absolute inset-x-0 top-0 z-10 bg-black/70 px-3 py-2 text-center text-sm text-white">
            The video coach couldn&apos;t connect.
          </p>
        ) : null}
        <InteractiveAvatarWrapper
          ref={avatarRef}
          config={config}
          showHistory={false}
          autoStart
          cleanMode
          applyAvatarFraming
          onSessionStateChange={handleStateChange}
          onSessionTokenError={handleTokenError}
        />
        <span className="pointer-events-none absolute left-2 top-2 z-20 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
          {coach.name}
        </span>
      </div>
    );
  },
);
CoachAvatarStage.displayName = "CoachAvatarStage";

export default CoachAvatarStage;
