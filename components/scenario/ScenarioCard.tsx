"use client";

/**
 * Provenance-first scenario card for the /case-play "Practice scenarios"
 * section. Visual shell matches components/case-card.tsx (cover image,
 * gradient overlay, name-over-image, grid sizing) so both /case-play
 * sections read as one page. Owner actions (edit/publish/delete) render
 * ONLY when `owned` is true — a card belonging to a classmate exposes
 * none of them: no copy affordance, no adult-supervisor visibility, no
 * class-section scoping, nothing beyond what a peer student should see.
 */

import { useState } from "react";
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
import { Briefcase, Pencil, Trash2 } from "lucide-react";
import type { CaseStudy } from "@/types";

interface ScenarioCardProps {
  scenario: CaseStudy;
  owned: boolean;
  onPlay: (id: string) => void;
  onChanged: () => void;
}

export default function ScenarioCard({
  scenario,
  owned,
  onPlay,
  onChanged,
}: ScenarioCardProps) {
  const router = useRouter();
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  const handleCardClick = () => {
    onPlay(scenario.id);
  };

  const handleCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleCardClick();
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/case-play/${scenario.id}/edit`);
  };

  const handleTogglePublish = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPublishing) return;
    setIsPublishing(true);
    const nextPublished = !scenario.published;
    try {
      const response = await fetch("/api/scenario/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: scenario.id, published: nextPublished }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        addToast({
          title: "Could not update this scenario",
          description: data.error,
          color: "danger",
        });
        return;
      }
      addToast({
        title: nextPublished
          ? "Every student can now find this scenario"
          : "This scenario is private again",
        color: "success",
      });
      onChanged();
    } catch {
      addToast({
        title: "Could not update this scenario",
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
      const response = await fetch("/api/scenario/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: scenario.id }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        if (response.status === 409) {
          addToast({
            title: "Unpublish this scenario first",
            description:
              data.error ??
              "This scenario is published, so it must be unpublished before it can be deleted.",
            color: "warning",
          });
        } else {
          addToast({
            title: "Could not delete this scenario",
            description: data.error,
            color: "danger",
          });
        }
        return;
      }
      addToast({ title: "Scenario deleted", color: "success" });
      onChanged();
    } catch {
      addToast({
        title: "Could not delete this scenario",
        description: "Check your connection and try again.",
        color: "danger",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const characterCount = scenario.avatars.length;

  return (
    <>
      {/*
        Plain div wrapper instead of HeroUI's `Card isPressable` (which renders
        a native <button>). The owner action buttons below (Edit/Publish/
        Delete) also render native <button>s, and <button> cannot legally
        contain <button> — that produced a hydration error. This div
        reproduces isPressable's interactive affordances (cursor, press-scale,
        tap-highlight, keyboard activation) by hand instead.
      */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleCardClick}
        onKeyDown={handleCardKeyDown}
        className="h-full cursor-pointer active:scale-[0.97] tap-highlight-transparent transition-transform outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-large"
      >
        <Card className="h-full hover:shadow-lg transition-all duration-200 overflow-hidden group">
          <div
            className="relative h-52 bg-gradient-to-br from-primary-500 to-primary-700"
            style={
              scenario.coverImage
                ? {
                    backgroundImage: `url(${scenario.coverImage})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : undefined
            }
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

            <div className="absolute top-0 left-0 right-0 p-4 flex flex-wrap gap-1.5">
              {owned ? (
                <>
                  <Chip size="sm" color="primary" variant="solid">
                    Yours
                  </Chip>
                  {scenario.published ? (
                    <Chip size="sm" color="success" variant="solid">
                      Published
                    </Chip>
                  ) : (
                    <Chip size="sm" color="default" variant="solid">
                      Private
                    </Chip>
                  )}
                </>
              ) : (
                <Chip size="sm" color="secondary" variant="solid">
                  {scenario.createdBy
                    ? `Shared by ${scenario.createdBy}`
                    : "Shared by a classmate"}
                </Chip>
              )}
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center flex-shrink-0">
                  <Briefcase className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-white font-semibold text-lg truncate drop-shadow-md">
                  {scenario.name}
                </h3>
              </div>
            </div>
          </div>

          <CardBody className="px-4 py-3.5 gap-2">
            <p className="text-sm text-default-600 line-clamp-2 leading-relaxed">
              {scenario.backgroundInfo}
            </p>
            <p className="text-xs text-default-400">
              {characterCount} character{characterCount !== 1 ? "s" : ""}
            </p>

            {owned && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  variant="flat"
                  startContent={<Pencil className="w-3.5 h-3.5" />}
                  onClick={handleEdit}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="flat"
                  color={scenario.published ? "warning" : "primary"}
                  isDisabled={isPublishing}
                  onClick={handleTogglePublish}
                >
                  {scenario.published ? "Unpublish" : "Publish"}
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
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Modal
        isDismissable={!isDeleting}
        isOpen={isOpen}
        onOpenChange={onOpenChange}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                Delete this scenario?
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
