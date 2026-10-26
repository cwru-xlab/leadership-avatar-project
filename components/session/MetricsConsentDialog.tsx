"use client";

import { Button } from "@heroui/button";
import {
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
} from "@heroui/modal";
import { addToast } from "@heroui/toast";
import { useState } from "react";

/**
 * REQ-36: the one-time, in-app explanation of what video/audio analysis
 * measures and retains. The browser's own camera/microphone permission
 * dialog is NOT informed consent about being ANALYSED — this dialog is.
 *
 * `isDismissable={false}` and no close button are deliberate: this is a
 * decision point the student must actively resolve, not a notice they can
 * click past.
 *
 * The component itself POSTs acceptance to `/api/metrics/consent` before
 * calling `onAccept` — an unrecorded acceptance must never let a measured
 * session start, or the account-level "remembered" promise silently breaks.
 * The parent is responsible for the GET check that decides whether to show
 * this dialog at all; this component only renders when told to.
 */
interface MetricsConsentDialogProps {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export default function MetricsConsentDialog({
  open,
  onAccept,
  onDecline,
}: MetricsConsentDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  async function handleAccept() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/metrics/consent", { method: "POST" });
      if (!res.ok) {
        throw new Error(`Consent POST failed: ${res.status}`);
      }
      onAccept();
    } catch (error) {
      console.error("Failed to record metrics consent:", error);
      addToast({
        title: "Could not save your choice — please try again",
        color: "danger",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal isOpen={open} isDismissable={false} hideCloseButton>
      <ModalContent>
        <ModalHeader>Before we measure your delivery</ModalHeader>
        <ModalBody>
          <ul className="list-disc space-y-2 pl-5 text-sm">
            <li>
              With your camera on, we measure how you present: whether your
              face is in frame, how you&apos;re framed and lit, and how
              steady your gaze is.
            </li>
            <li>
              We measure your speaking too: your pace, filler words, pauses,
              and how steady your volume is.
            </li>
            <li>
              Your video and audio are analysed as they happen and then
              discarded. Nothing is recorded, saved, or uploaded — only the
              numbers above are kept, on your own report.
            </li>
            <li>Only you can see your reports.</li>
          </ul>
          <p className="mt-3 text-sm">
            You can practice with your camera off at any time. Visual and
            Vocal simply won&apos;t be scored for that session.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" isDisabled={submitting} onPress={onDecline}>
            Not now
          </Button>
          <Button
            color="primary"
            isLoading={submitting}
            onPress={() => void handleAccept()}
          >
            I understand — continue
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
