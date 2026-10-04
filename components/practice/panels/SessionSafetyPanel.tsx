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
      className="pointer-events-auto flex max-w-[min(100vw-2rem,22rem)] flex-col gap-2 rounded-xl border border-white/20 bg-[#0b1c2a]/92 px-3 py-2.5 text-left shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md"
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
        className="justify-start font-semibold"
        isLoading={isEnding}
        onPress={() => setConfirmOpen(true)}
      >
        End session
      </Button>

      {/*
        Static app copy. Never generated, never spoken by the character, never
        rendered in the transcript.
      */}
      <p className="text-[11px] leading-4 text-[#9eb6c6]">
        This is a practice conversation. The character stays in role the whole
        time. You can end it at any time with the control above.{" "}
        {SUPPORT_RESOURCE_NOTE}
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
