"use client";

/**
 * Student's side of recognize → offer → confirm (15-01 Gap 1).
 *
 * The avatar recognizes a decisive close and offers in character without
 * emitting a marker. This control is always available rather than detecting
 * the avatar's offer with a classifier or regex over its text — runtime
 * detection of avatar output was rejected (CONTEXT.md) and is fragile.
 * The avatar's in-character offer is what prompts the student to use this;
 * the app never ends on inference alone.
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

export interface InCharacterClosePromptProps {
  /**
   * Finishes with source "student" and reason "student_closed_in_character".
   * Distinct from SessionSafetyPanel's student_left_session path.
   */
  onConfirmClose: (opts: {
    reason: "student_closed_in_character";
    source: "student";
  }) => void | Promise<void>;
  isClosing?: boolean;
}

export default function InCharacterClosePrompt({
  onConfirmClose,
  isClosing = false,
}: InCharacterClosePromptProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="pointer-events-auto mt-1">
      <Button
        size="sm"
        variant="bordered"
        className="border-white/25 bg-[#102a3a]/80 text-[#d7ebf5] backdrop-blur-md"
        isLoading={isClosing}
        onPress={() => setConfirmOpen(true)}
      >
        I&apos;m finished — close it out
      </Button>

      <Modal
        isOpen={confirmOpen}
        onClose={() => !isClosing && setConfirmOpen(false)}
      >
        <ModalContent>
          <ModalHeader>Close the conversation on your terms?</ModalHeader>
          <ModalBody>
            <p>
              Close the conversation on your terms. How you end it is part of
              what gets reviewed.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="light"
              isDisabled={isClosing}
              onPress={() => setConfirmOpen(false)}
            >
              Keep talking
            </Button>
            <Button
              color="primary"
              isLoading={isClosing}
              onPress={() => {
                void Promise.resolve(
                  onConfirmClose({
                    reason: "student_closed_in_character",
                    source: "student",
                  }),
                ).finally(() => setConfirmOpen(false));
              }}
            >
              Close it out
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
