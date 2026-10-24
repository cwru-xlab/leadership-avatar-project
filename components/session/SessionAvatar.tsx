"use client";

/**
 * The avatar stage every live session mounts (Phase 22 G4,
 * 22-SHARED-SHELL-DECISION.md): the shared `InteractiveAvatarWrapper` with the
 * exact props the practice shell has always passed it, plus the keep-alive
 * effect moved verbatim from `components/practice/PracticeSessionShell.tsx`.
 *
 * Callers pass `onSessionStateChange` and act on CONNECTED themselves — the
 * practice shell starts its opening turn and visual capture there, and the
 * coached shell starts its coach's opening turn there, the same way.
 */

import { type RefObject, forwardRef, useEffect } from "react";

import InteractiveAvatarWrapper, {
  type InteractiveAvatarRef,
} from "@/components/HeyGenAvatar/InteractiveAvatar";
import type { StreamingAvatarSessionState } from "@/components/HeyGenAvatar/logic";
import type { HeygenSessionError } from "@/lib/heygen-client";
import type { StartAvatarRequest } from "@/types";

// Well inside any provider idle window, and cheap: one request a minute at most.
export const KEEP_ALIVE_INTERVAL_MS = 30_000;

export interface SessionAvatarProps {
  config: StartAvatarRequest;
  onSessionStateChange?: (state: StreamingAvatarSessionState) => void;
  /** Fired when no session token can be obtained (vendor/config failure). */
  onSessionTokenError?: (error: HeygenSessionError) => void;
}

export const SessionAvatar = forwardRef<InteractiveAvatarRef, SessionAvatarProps>(
  ({ config, onSessionStateChange, onSessionTokenError }, ref) => (
    <InteractiveAvatarWrapper
      ref={ref}
      config={config}
      showHistory={false}
      autoStart
      cleanMode
      applyAvatarFraming
      onSessionStateChange={onSessionStateChange}
      onSessionTokenError={onSessionTokenError}
    />
  ),
);
SessionAvatar.displayName = "SessionAvatar";

/**
 * The provider reaps idle sessions, and nothing else in the app pings it —
 * `keepAlive` existed on the session hook but had no callers, so a session
 * died well short of the 20-minute interview target. Ping while `active`
 * (practice: connected and unpaused); a paused session is deliberately being
 * abandoned or resumed soon, and a failed ping is not worth interrupting the
 * session over.
 */
export function useAvatarKeepAlive(
  avatarRef: RefObject<InteractiveAvatarRef | null>,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => {
      void avatarRef.current?.keepAlive().catch(() => {});
    }, KEEP_ALIVE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [avatarRef, active]);
}

export default SessionAvatar;
