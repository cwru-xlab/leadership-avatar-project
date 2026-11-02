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
import { Pencil, Trash2 } from "lucide-react";
import type { CaseStudy } from "@/types";
import LibraryCard, { LibraryBadge } from "@/components/practice/LibraryCard";
import { routes } from "@/lib/routes";

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
    // Launch on the engine session path (REQ-68 / plan 13-13). Edit/publish/
    // delete below stay on /case-play authoring routes.
    router.push(routes.caseStudy(scenario.id));
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
    router.push(routes.editCaseStudy(scenario.id));
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
        className="group h-full cursor-pointer rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-true-blue"
      >
        <LibraryCard
          actions={
            owned ? (
              <>
                <Button
                  size="sm"
                  variant="light"
                  className="text-ink"
                  startContent={<Pencil className="h-3.5 w-3.5" />}
                  onClick={handleEdit}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="light"
                  className="text-link"
                  isDisabled={isPublishing}
                  onClick={handleTogglePublish}
                >
                  {scenario.published ? "Unpublish" : "Publish"}
                </Button>
                <Button
                  size="sm"
                  variant="light"
                  className="ml-auto text-copper-deep"
                  startContent={<Trash2 className="h-3.5 w-3.5" />}
                  isDisabled={isDeleting}
                  onClick={handleDeleteClick}
                >
                  Delete
                </Button>
              </>
            ) : undefined
          }
          badges={
            owned ? (
              <>
                <LibraryBadge tone="brand">Yours</LibraryBadge>
                <LibraryBadge tone={scenario.published ? "good" : "neutral"}>
                  {scenario.published ? "Published" : "Private"}
                </LibraryBadge>
              </>
            ) : (
              <LibraryBadge>
                {scenario.createdBy ? `Shared by ${scenario.createdBy}` : "Shared by a classmate"}
              </LibraryBadge>
            )
          }
          characters={scenario.avatars.map((a) => ({ name: a.name, role: a.role }))}
          coverImage={scenario.coverImage}
          footer={`${characterCount} character${characterCount !== 1 ? "s" : ""}`}
          summary={scenario.backgroundInfo}
          title={scenario.name}
        />
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
                <p className="text-sm text-muted">
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
