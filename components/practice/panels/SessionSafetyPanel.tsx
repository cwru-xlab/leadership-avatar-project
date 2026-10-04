"use client";

/**
 * Always-visible out-of-band session affordances for difficult-conversation.
 *
 * This control exists because the avatar never breaks character (CONTEXT.md).
 * It is the out-of-band path and must never be gated, delayed, or made
 * conditional on the conversation's state.
 *
 * Static app copy. Never generated, never spoken by the character, never
 * rendered in the transcript.
 */

import { Button } from "@heroui/button";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/modal";
import { useState } from "react";

/**
 * Institution-neutral support resource text. Edit this constant only — do not
 * touch the panel logic when updating where students should go for help.
 */
export const SUPPORT_RESOURCE_NOTE =
  "If something in this practice is affecting you for real, pause and reach out " +
  "to someone you trust, or to your campus counseling / employee assistance " +
  "resources. This screen will still be here when you come back.";

export interface SessionSafetyPanelProps {
  /**
   * Finishes the session. This panel always passes
   * source "student" and reason "student_left_session".
   * Must work mid-avatar-turn — the shell is responsible for interrupting.
   */
  onEndSession: (opts: {
    reason: "student_left_session";
    source: "student";
  }) => void | Promise<void>;
  /** True while the finish request is in flight. */
  isEnding?: boolean;
}

export default function SessionSafetyPanel({
  onEndSession,
  isEnding = false,
}: SessionSafetyPanelProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <aside
      className="pointer-events-auto flex w-full flex-col gap-1.5 rounded-xl border border-white/20 bg-[#0b1c2a]/92 px-2.5 py-2 text-left shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md"
      aria-label="Session safety controls"
    >
      {/*
        This control exists because the avatar never breaks character (CONTEXT.md).
        It is the out-of-band path and must never be gated, delayed, or made
        conditional on the conversation's state.
      */}
      <Button
        size="sm"
        color="danger"
        variant="flat"
        className="h-8 min-h-8 justify-start font-semibold"
        isLoading={isEnding}
        onPress={() => setConfirmOpen(true)}
      >
        End session
      </Button>

      {/*
        Static app copy. Never generated, never spoken by the character, never
        rendered in the transcript. Always visible (not a tooltip) — kept
        compact so it can sit in the avatar chrome without covering the face.
      */}
      <p className="text-[10px] leading-[1.35] text-[#9eb6c6]">
        Practice only — the character stays in role. End anytime with the
        control above. {SUPPORT_RESOURCE_NOTE}
      </p>

      <Modal
        isOpen={confirmOpen}
        onClose={() => !isEnding && setConfirmOpen(false)}
      >
        <ModalContent>
          <ModalHeader>End this session now?</ModalHeader>
          <ModalBody>
            <p>You&apos;ll still get your report.</p>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="light"
              isDisabled={isEnding}
              onPress={() => setConfirmOpen(false)}
            >
              Keep going
            </Button>
            <Button
              color="danger"
              isLoading={isEnding}
              onPress={() => {
                void Promise.resolve(
                  onEndSession({
                    reason: "student_left_session",
                    source: "student",
                  }),
                ).finally(() => setConfirmOpen(false));
              }}
            >
              End session
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </aside>
  );
}
