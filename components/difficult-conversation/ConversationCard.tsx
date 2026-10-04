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
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
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
import { MessageCircleWarning, Pencil, Trash2 } from "lucide-react";

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
      <Card className="h-full hover:shadow-lg transition-all duration-200 overflow-hidden">
        <div className="relative h-44 bg-gradient-to-br from-primary-500 to-primary-700">
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

          {owned && (
            <div className="absolute top-0 left-0 right-0 p-4 flex flex-wrap gap-1.5">
              {conversation.published ? (
                <Chip size="sm" color="success" variant="solid">
                  Published
                </Chip>
              ) : (
                <Chip size="sm" color="default" variant="solid">
                  Private
                </Chip>
              )}
            </div>
          )}

          <div className="absolute bottom-0 left-0 right-0 p-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center flex-shrink-0">
                <MessageCircleWarning className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-white font-semibold text-lg truncate drop-shadow-md">
                {conversation.title}
              </h3>
            </div>
          </div>
        </div>

        <CardBody className="px-4 py-3.5 gap-2">
          <p className="text-sm text-default-700">
            <span className="font-medium">{conversation.avatarRole}</span>
            {conversation.studentRole ? (
              <span className="text-default-500">
                {" "}
                · You: {conversation.studentRole}
              </span>
            ) : null}
          </p>

          {conversation.situation ? (
            <p className="text-sm text-default-600 line-clamp-2 leading-relaxed">
              {conversation.situation}
            </p>
          ) : null}

          <p className="text-xs text-default-400">
            Starting difficulty: {difficultyLabel}
          </p>

          {needsChange && (
            <Link
              href={editHref}
              className="text-xs text-warning-600 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Not published — needs a change
            </Link>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" color="primary" onPress={handlePractice}>
              Practice
            </Button>

            {owned && (
              <>
                <Button
                  size="sm"
                  variant="flat"
                  startContent={<Pencil className="w-3.5 h-3.5" />}
                  onPress={() => router.push(editHref)}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="flat"
                  color={conversation.published ? "warning" : "primary"}
                  isDisabled={isPublishing}
                  onClick={handleTogglePublish}
                >
                  {conversation.published ? "Unpublish" : "Publish"}
                </Button>
                <Button
                  size="sm"
                  variant="flat"
                  color="danger"
                  startContent={<Trash2 className="w-3.5 h-3.5" />}
                  isDisabled={isDeleting}
                  onClick={handleDeleteClick}
                >
                  Delete
                </Button>
              </>
            )}
          </div>
        </CardBody>
      </Card>

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
