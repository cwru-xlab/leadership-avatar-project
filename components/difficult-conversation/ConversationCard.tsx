"use client";

/**
 * Provenance-first card for the /conversations catalog. Owner actions
 * (edit / publish / delete) render ONLY when `conversation.isMine` is true —
 * a classmate's card exposes exactly one action: Practice.
 *
 * Never renders the character's private stance. Check state is shown only on
 * the owner's own cards, and only as a quiet "needs a change" marker when
 * rejected.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import { addToast } from "@heroui/toast";
import { ArrowRight, MessageCircleWarning, Pencil, Trash2, UserRound } from "lucide-react";

export type ConversationDiscoveryCard = {
  id: string;
  title: string;
  avatarRole: string;
  studentRole: string;
  situation: string;
  difficulty: string;
  published: boolean;
  updatedAt: string;
  isMine: boolean;
  lastCheckStatus?: "passed" | "rejected" | "unavailable" | null;
};

interface ConversationCardProps {
  conversation: ConversationDiscoveryCard;
  onChanged: () => void;
}

const DIFFICULTY_LABELS: Record<string, string> = {
  receptive: "Receptive",
  guarded: "Guarded",
  hostile: "Hostile",
};

export default function ConversationCard({
  conversation,
  onChanged,
}: ConversationCardProps) {
  const router = useRouter();
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  const practiceHref = `/practice/difficult-conversation/${conversation.id}`;
  const editHref = `/conversations/${conversation.id}`;
  const owned = conversation.isMine;
  const needsChange =
    owned && conversation.lastCheckStatus === "rejected" && !conversation.published;

  const handlePractice = () => {
    router.push(practiceHref);
  };

  const handleTogglePublish = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPublishing) return;
    setIsPublishing(true);
    const nextPublished = !conversation.published;
    try {
      const response = await fetch("/api/difficult-conversation/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: conversation.id, published: nextPublished }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        reason?: string;
        fix?: string;
        blocked?: string;
      };
      if (!response.ok) {
        if (response.status === 422) {
          addToast({
            title: "This can't be published yet",
            description: data.fix || data.reason || data.error,
            color: "warning",
          });
          router.push(editHref);
          return;
        }
        if (response.status === 503) {
          addToast({
            title: "Couldn't run the safety check",
            description:
              "Nothing is wrong with your scenario. Try publishing again in a minute.",
            color: "warning",
          });
          return;
        }
        addToast({
          title: "Could not update this conversation",
          description: data.error,
          color: "danger",
        });
        return;
      }
      addToast({
        title: nextPublished
          ? "Anyone can now find and play this conversation"
          : "This conversation is private again",
        color: "success",
      });
      onChanged();
    } catch {
      addToast({
        title: "Could not update this conversation",
        description: "Check your connection and try again.",
        color: "danger",
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpen();
  };

  const handleConfirmDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      const response = await fetch("/api/difficult-conversation/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: conversation.id }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        addToast({
          title: "Could not delete this conversation",
          description: data.error,
          color: "danger",
        });
        return;
      }
      addToast({ title: "Conversation deleted", color: "success" });
      onChanged();
    } catch {
      addToast({
        title: "Could not delete this conversation",
        description: "Check your connection and try again.",
        color: "danger",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const difficultyLabel =
    DIFFICULTY_LABELS[conversation.difficulty] ?? conversation.difficulty;

  return (
    <>
      <article className="flex h-full flex-col gap-3 rounded-2xl border border-line bg-white p-[18px] transition-colors duration-150 ease-out hover:border-true-blue/50">
        <div className="flex items-start gap-3">
          <span className="relative shrink-0">
            <span className="grid size-[52px] place-items-center rounded-full bg-cwru-blue text-white">
              <UserRound aria-hidden size={24} strokeWidth={1.75} />
            </span>
            <span className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full bg-white text-cwru-blue shadow-[0_0_0_2px_white]">
              <MessageCircleWarning aria-hidden size={14} strokeWidth={2} />
            </span>
          </span>
          <p className="flex min-w-0 flex-1 flex-col text-[12.5px] leading-snug text-muted">
            <span>
              <span className="font-semibold text-ink">They:</span> {conversation.avatarRole}
            </span>
            {conversation.studentRole ? (
              <span>
                <span className="font-semibold text-ink">You:</span> {conversation.studentRole}
              </span>
            ) : null}
          </p>
          {owned && (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${
                conversation.published ? "bg-level-4/16 text-ink" : "bg-canvas text-muted"
              }`}
            >
              {conversation.published ? "Published" : "Private"}
            </span>
          )}
        </div>

        <h3 className="font-display text-[19px] font-medium leading-tight text-cwru-blue">
          {conversation.title}
        </h3>

        {conversation.situation ? (
          <p className="line-clamp-2 text-[13.5px] leading-5 text-muted">{conversation.situation}</p>
        ) : null}

        {needsChange && (
          <Link
            href={editHref}
            className="text-xs font-semibold text-copper hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            Not published — needs a change
          </Link>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 pt-1">
          <DifficultyMeter difficulty={conversation.difficulty} label={difficultyLabel} />
          <button
            className="inline-flex items-center gap-1 text-sm font-bold text-true-blue hover:underline"
            type="button"
            onClick={handlePractice}
          >
            Practice <ArrowRight aria-hidden size={15} strokeWidth={2.5} />
          </button>
        </div>

        {owned && (
          <div className="flex flex-wrap gap-1 border-t border-line pt-2.5">
            <Button
              size="sm"
              variant="light"
              className="text-ink"
              startContent={<Pencil className="h-3.5 w-3.5" />}
              onPress={() => router.push(editHref)}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="light"
              className="text-true-blue"
              isDisabled={isPublishing}
              onClick={handleTogglePublish}
            >
              {conversation.published ? "Unpublish" : "Publish"}
            </Button>
            <Button
              size="sm"
              variant="light"
              className="ml-auto text-copper"
              startContent={<Trash2 className="h-3.5 w-3.5" />}
              isDisabled={isDeleting}
              onClick={handleDeleteClick}
            >
              Delete
            </Button>
          </div>
        )}
      </article>

      <Modal
        isDismissable={!isDeleting}
        isOpen={isOpen}
        onOpenChange={onOpenChange}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                Delete this conversation?
              </ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-600">
                  Your past reports for it are kept.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button
                  variant="light"
                  onPress={onClose}
                  isDisabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  color="danger"
                  isDisabled={isDeleting}
                  onPress={async () => {
                    await handleConfirmDelete();
                    onClose();
                  }}
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}

const DIFFICULTY_STEPS: Record<string, { filled: number; color: string }> = {
  receptive: { filled: 1, color: "bg-level-4" },
  guarded: { filled: 2, color: "bg-level-2" },
  hostile: { filled: 3, color: "bg-copper" },
};

/** Starting difficulty as three bars and its word; color is never the only signal. */
function DifficultyMeter({ difficulty, label }: { difficulty: string; label: string }) {
  const step = DIFFICULTY_STEPS[difficulty];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted" title="Starting difficulty">
      {step ? (
        <span aria-hidden className="flex gap-1">
          {[1, 2, 3].map((n) => (
            <span key={n} className={`h-1.5 w-4 rounded-full ${n <= step.filled ? step.color : "bg-line"}`} />
          ))}
        </span>
      ) : null}
      <span>
        <span className="sr-only">Starting difficulty: </span>
        {label}
      </span>
    </span>
  );
}
