"use client";

/**
 * Courageous-conversation end controls (15-08, repositioned 2026-11-16).
 *
 * The avatar never breaks character (CONTEXT.md), so real-distress handling is
 * out-of-band: a visible End control and a static support note on the session
 * screen are required deliverables, not polish. They used to float over the
 * avatar's face; they now live in the session chrome instead:
 *
 * - The shell's End controls (stage-header icon and the labelled End button
 *   beside Pause) open `ConversationEndDialog`. They must never be gated,
 *   delayed, or made conditional on the conversation's state — paused
 *   included.
 * - `SessionSupportNote` is the always-visible line under the answer controls.
 *
 * The dialog offers both student endings, each with its own reason code:
 * - "student_closed_in_character": the student wrapped the conversation up with
 *   the character (recognize → offer → confirm, 15-01 Gap 1). How they close is
 *   part of what gets reviewed. The app never ends on inference alone.
 * - "student_left_session": the out-of-band stop.
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
import { LifeBuoy } from "lucide-react";
import { useId, useState } from "react";

/**
 * Institution-neutral support resource text. Edit this constant only — do not
 * touch the control logic when updating where students should go for help.
 */
export const SUPPORT_RESOURCE_NOTE =
  "If something in this practice is affecting you for real, pause and reach out " +
  "to someone you trust, or to your campus counseling / employee assistance " +
  "resources. This screen will still be here when you come back.";

export type ConversationEndOpts =
  | { reason: "student_closed_in_character"; source: "student" }
  | { reason: "student_left_session"; source: "student" };

export interface ConversationEndDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Finishes the session with the chosen student reason. */
  onEnd: (opts: ConversationEndOpts) => void | Promise<void>;
  /** True while the finish request is in flight. */
  isEnding?: boolean;
}

export function ConversationEndDialog({
  isOpen,
  onClose,
  onEnd,
  isEnding = false,
}: ConversationEndDialogProps) {
  const [choice, setChoice] = useState<ConversationEndOpts["reason"] | null>(
    null,
  );

  const finish = (reason: ConversationEndOpts["reason"]) => {
    setChoice(reason);
    void Promise.resolve(onEnd({ reason, source: "student" })).finally(() => {
      setChoice(null);
      onClose();
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={() => !isEnding && onClose()}>
      <ModalContent>
        <ModalHeader>End the conversation?</ModalHeader>
        <ModalBody className="gap-3">
          <p>
            If you wrapped it up with them, close it out — how you end it is
            part of what gets reviewed. Either way you&apos;ll get your report.
          </p>
          <p className="text-small text-muted">
            {SUPPORT_RESOURCE_NOTE}
          </p>
        </ModalBody>
        <ModalFooter className="flex-wrap">
          <Button variant="light" isDisabled={isEnding} onPress={onClose}>
            Keep talking
          </Button>
          <Button
            color="danger"
            variant="flat"
            isDisabled={isEnding && choice !== "student_left_session"}
            isLoading={isEnding && choice === "student_left_session"}
            onPress={() => finish("student_left_session")}
          >
            Stop now
          </Button>
          <Button
            color="primary"
            isDisabled={isEnding && choice !== "student_closed_in_character"}
            isLoading={isEnding && choice === "student_closed_in_character"}
            onPress={() => finish("student_closed_in_character")}
          >
            I closed it out
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/**
 * The always-visible support line. One sentence up front; the full resource
 * text expands in place (progressive disclosure) so it never crowds the
 * transcript or the avatar.
 */
export function SessionSupportNote() {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="mt-3 text-[13px] leading-[1.45] text-light-blue">
      <p className="flex flex-wrap items-center gap-x-1.5">
        <span>Practice only — they stay in role.</span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded underline underline-offset-2 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-true-blue"
        >
          <LifeBuoy size={13} aria-hidden="true" />
          Need support?
        </button>
      </p>
      {open ? (
        <p id={panelId} className="mt-1.5 max-w-[65ch]">
          {SUPPORT_RESOURCE_NOTE}
        </p>
      ) : null}
    </div>
  );
}
