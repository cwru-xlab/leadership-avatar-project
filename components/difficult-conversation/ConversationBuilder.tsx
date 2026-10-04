"use client";

/**
 * Six-field authoring form for difficult conversations — structurally identical
 * to a seeded record. Client and server share validateDifficultConversationInput
 * so field limits and wording never disagree. Publish renders reason+fix on
 * 422 and a distinct try-again panel on 503 — editing is the only remedy.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Input, Textarea } from "@heroui/input";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { addToast } from "@heroui/toast";
import { Lock } from "lucide-react";
import AvatarPickerGrid from "@/components/scenario/AvatarPickerGrid";
import { validateDifficultConversationInput } from "@/lib/difficult-conversation/validation";
import {
  DC_LIMITS,
  DIFFICULTY_BANDS,
  type DifficultyBand,
  type DifficultConversationRecord,
} from "@/lib/difficult-conversation/types";

type FieldErrors = Record<string, string>;

type PublishPanel =
  | null
  | { kind: "success" }
  | {
      kind: "rejected";
      reason: string;
      fix: string;
      demoted?: boolean;
    }
  | { kind: "unavailable"; demoted?: boolean };

const DIFFICULTY_HELP: Record<DifficultyBand, string> = {
  receptive: "Defensive but reachable — will soften when you are clear and fair.",
  guarded: "Deflects and needs to be pinned down — the middle band.",
  hostile: "Counter-attacks and states a hard bottom line late.",
};

type ConversationBuilderProps =
  | { mode: "create" }
  | { mode: "edit"; initial: DifficultConversationRecord };

function blankState() {
  return {
    title: "",
    studentRole: "",
    avatarRole: "",
    situation: "",
    sharedBackstory: "",
    hiddenPosition: "",
    studentObjective: "",
    stakes: "",
    difficulty: "guarded" as DifficultyBand,
    avatarId: "",
    voiceId: "",
  };
}

function fromRecord(record: DifficultConversationRecord) {
  return {
    title: record.title,
    studentRole: record.studentRole,
    avatarRole: record.avatarRole,
    situation: record.situation,
    sharedBackstory: record.sharedBackstory,
    hiddenPosition: record.hiddenPosition,
    studentObjective: record.studentObjective,
    stakes: record.stakes,
    difficulty: record.difficulty,
    avatarId: record.avatarId,
    voiceId: record.voiceId,
  };
}

export default function ConversationBuilder(props: ConversationBuilderProps) {
  const router = useRouter();
  const initial =
    props.mode === "edit" ? fromRecord(props.initial) : blankState();

  const [title, setTitle] = useState(initial.title);
  const [studentRole, setStudentRole] = useState(initial.studentRole);
  const [avatarRole, setAvatarRole] = useState(initial.avatarRole);
  const [situation, setSituation] = useState(initial.situation);
  const [sharedBackstory, setSharedBackstory] = useState(
    initial.sharedBackstory
  );
  const [hiddenPosition, setHiddenPosition] = useState(initial.hiddenPosition);
  const [studentObjective, setStudentObjective] = useState(
    initial.studentObjective
  );
  const [stakes, setStakes] = useState(initial.stakes);
  const [difficulty, setDifficulty] = useState<DifficultyBand>(
    initial.difficulty
  );
  const [avatarId, setAvatarId] = useState(initial.avatarId);
  const [voiceId, setVoiceId] = useState(initial.voiceId);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(
    props.mode === "edit" ? props.initial.id : null
  );
  const [published, setPublished] = useState(
    props.mode === "edit" ? props.initial.published : false
  );
  const [justCreated, setJustCreated] = useState(false);
  const [publishPanel, setPublishPanel] = useState<PublishPanel>(null);
  const [publishConfirm, setPublishConfirm] = useState<string | null>(null);

  const payload = () => ({
    title,
    studentRole,
    avatarRole,
    situation,
    sharedBackstory,
    hiddenPosition,
    studentObjective,
    stakes,
    difficulty,
    avatarId,
    voiceId,
  });

  const applyFieldErrors = (
    errors: { field: string; message: string }[]
  ): void => {
    const next: FieldErrors = {};
    for (const error of errors) {
      if (!next[error.field]) next[error.field] = error.message;
    }
    setFieldErrors(next);
  };

  const handleSave = async () => {
    const clientErrors = validateDifficultConversationInput(payload());
    if (clientErrors.length > 0) {
      applyFieldErrors(clientErrors);
      return;
    }
    setFieldErrors({});
    setIsSaving(true);
    setPublishPanel(null);
    setPublishConfirm(null);

    try {
      const isEdit = Boolean(recordId);
      const endpoint = isEdit
        ? "/api/difficult-conversation/edit"
        : "/api/difficult-conversation/add";
      const body = isEdit ? { id: recordId, ...payload() } : payload();

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = (await response.json().catch(() => ({}))) as {
        id?: string;
        published?: boolean;
        demoted?: boolean;
        error?: string;
        errors?: { field: string; message: string }[];
        category?: string;
        reason?: string;
        fix?: string;
        blocked?: string;
        message?: string;
        stillPlayable?: boolean;
      };

      if (!response.ok) {
        if (data.errors?.length) {
          applyFieldErrors(data.errors);
          return;
        }

        // Published edit that failed the pre-publish check — changes saved,
        // demoted. Surface the honest panel.
        if (response.status === 422 && data.demoted) {
          setPublished(false);
          setPublishPanel({
            kind: "rejected",
            reason: data.reason || "This scenario did not pass the safety check.",
            fix: data.fix || "Edit the text that caused the problem, then publish again.",
            demoted: true,
          });
          addToast({
            title: "Changes saved — unpublished for now",
            color: "warning",
          });
          return;
        }

        if (response.status === 503 && data.demoted) {
          setPublished(false);
          setPublishPanel({ kind: "unavailable", demoted: true });
          addToast({
            title: "Changes saved — unpublished for now",
            color: "warning",
          });
          return;
        }

        addToast({
          title: "Could not save this conversation",
          description: data.error || data.message,
          color: "danger",
        });
        return;
      }

      const id = data.id || recordId;
      if (id) setRecordId(id);
      if (typeof data.published === "boolean") {
        setPublished(data.published);
      }

      if (!isEdit) {
        setJustCreated(true);
        addToast({ title: "Conversation saved", color: "success" });
      } else {
        addToast({ title: "Conversation updated", color: "success" });
      }
    } catch {
      addToast({
        title: "Could not save this conversation",
        description: "Check your connection and try again.",
        color: "danger",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async (nextPublished: boolean) => {
    if (!recordId || isPublishing) return;
    setIsPublishing(true);
    setPublishPanel(null);
    setPublishConfirm(null);

    try {
      const response = await fetch("/api/difficult-conversation/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: recordId, published: nextPublished }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        published?: boolean;
        blocked?: string;
        category?: string;
        reason?: string;
        fix?: string;
        message?: string;
        error?: string;
        stillPlayable?: boolean;
      };

      if (response.status === 200) {
        setPublished(Boolean(data.published));
        if (nextPublished) {
          setPublishConfirm(
            "Published. Anyone can find and play it. You stay its owner."
          );
          setPublishPanel({ kind: "success" });
        } else {
          setPublishConfirm("Unpublished. Only you can find it now.");
          setPublishPanel(null);
        }
        return;
      }

      if (response.status === 422) {
        setPublished(false);
        setPublishPanel({
          kind: "rejected",
          reason:
            data.reason || "This scenario did not pass the safety check.",
          fix:
            data.fix ||
            "Edit the text that caused the problem, then publish again.",
        });
        return;
      }

      if (response.status === 503) {
        setPublished(false);
        setPublishPanel({ kind: "unavailable" });
        return;
      }

      addToast({
        title: "Could not update publish state",
        description: data.error || data.message,
        color: "danger",
      });
    } catch {
      addToast({
        title: "Could not update publish state",
        description: "Check your connection and try again.",
        color: "danger",
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const practiceHref = recordId
    ? `/practice/difficult-conversation/${recordId}`
    : null;

  const err = (field: string) => fieldErrors[field];

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="space-y-2">
        <Input
          label="Title"
          description="What do you call this situation?"
          value={title}
          onValueChange={setTitle}
          isInvalid={Boolean(err("title"))}
          errorMessage={err("title")}
          maxLength={DC_LIMITS.TITLE_MAX + 20}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Who you are"
          description="Your role in this conversation."
          value={studentRole}
          onValueChange={setStudentRole}
          isInvalid={Boolean(err("studentRole"))}
          errorMessage={err("studentRole")}
        />
        <Input
          label="Who they are"
          description="The avatar's role — who you are talking to."
          value={avatarRole}
          onValueChange={setAvatarRole}
          isInvalid={Boolean(err("avatarRole"))}
          errorMessage={err("avatarRole")}
        />
      </div>

      <Textarea
        label="The situation"
        description="Shown to whoever plays it — the setup both sides walk into."
        value={situation}
        onValueChange={setSituation}
        minRows={4}
        isInvalid={Boolean(err("situation"))}
        errorMessage={err("situation")}
      />

      <Textarea
        label="What you both already know"
        description="Facts both sides have. The player sees this before they start."
        value={sharedBackstory}
        onValueChange={setSharedBackstory}
        minRows={4}
        isInvalid={Boolean(err("sharedBackstory"))}
        errorMessage={err("sharedBackstory")}
      />

      <div className="rounded-xl border-2 border-warning-300 bg-warning-50/40 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-warning-700" />
          <Chip size="sm" color="warning" variant="flat">
            Hidden from the player
          </Chip>
        </div>
        <Textarea
          label="What they privately think"
          description="The player never sees this. It is what the character believes, wants and will not volunteer: their excuse, their counter-argument, their bottom line. This is what makes the conversation hard."
          value={hiddenPosition}
          onValueChange={setHiddenPosition}
          minRows={5}
          isInvalid={Boolean(err("hiddenPosition"))}
          errorMessage={err("hiddenPosition")}
          classNames={{
            inputWrapper: "bg-white",
          }}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Textarea
          label="The player's goal"
          description="What the student is trying to achieve in this conversation."
          value={studentObjective}
          onValueChange={setStudentObjective}
          minRows={3}
          isInvalid={Boolean(err("studentObjective"))}
          errorMessage={err("studentObjective")}
        />
        <Textarea
          label="What is at stake"
          description="What happens if the conversation goes badly."
          value={stakes}
          onValueChange={setStakes}
          minRows={3}
          isInvalid={Boolean(err("stakes"))}
          errorMessage={err("stakes")}
        />
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-default-700">
            Starting difficulty
          </p>
          <p className="text-xs text-default-500 mt-1">
            The record&apos;s default band. The live session never shows which
            band is active.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {DIFFICULTY_BANDS.map((band) => {
            const selected = difficulty === band;
            return (
              <button
                key={band}
                type="button"
                onClick={() => setDifficulty(band)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  selected
                    ? "border-primary bg-primary-50"
                    : "border-default-200 bg-white hover:border-default-400"
                }`}
              >
                <span className="font-medium capitalize text-sm">{band}</span>
                <span className="block text-xs text-default-500 mt-1">
                  {DIFFICULTY_HELP[band]}
                </span>
              </button>
            );
          })}
        </div>
        {err("difficulty") && (
          <p className="text-sm text-danger">{err("difficulty")}</p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-default-700">
          The character&apos;s avatar
        </p>
        <p className="text-xs text-default-500">
          Pick who they look and sound like. Avatar and voice stay paired.
        </p>
        <AvatarPickerGrid
          value={avatarId || null}
          onChange={({ avatarId: nextAvatar, voiceId: nextVoice }) => {
            setAvatarId(nextAvatar);
            setVoiceId(nextVoice);
          }}
        />
        {(err("avatarId") || err("voiceId")) && (
          <p className="text-sm text-danger">
            {err("avatarId") || err("voiceId")}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button color="primary" isLoading={isSaving} onPress={() => void handleSave()}>
          {recordId ? "Save changes" : "Save"}
        </Button>
        <Button variant="light" onPress={() => router.push("/conversations")}>
          Back to conversations
        </Button>
      </div>

      {/* Post-create: practise immediately or publish deliberately */}
      {justCreated && recordId && practiceHref && (
        <Card className="border border-success-200 bg-success-50/40 shadow-none">
          <CardBody className="gap-4 p-6">
            <div>
              <h3 className="font-semibold text-default-900">Saved — private</h3>
              <p className="text-sm text-default-600 mt-1">
                Practise it now, or publish it when you are ready. Nothing was
                published automatically.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                as={Link}
                href={practiceHref}
                color="primary"
              >
                Practise it now
              </Button>
              <Button
                color="secondary"
                variant="flat"
                isLoading={isPublishing}
                onPress={() => void handlePublish(true)}
              >
                Publish it
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Publish control — edit mode, or create after the post-save choice */}
      {recordId && (props.mode === "edit" || !justCreated) && (
        <Card className="border border-default-200 shadow-none">
          <CardBody className="gap-4 p-6">
            <div>
              <h3 className="font-semibold text-default-900">Publish</h3>
              <p className="text-sm text-default-600 mt-1">
                Anyone can find and play it. You stay its owner and can change
                or unpublish it at any time.
              </p>
              <p className="text-sm text-default-500 mt-2">
                Current state:{" "}
                <span className="font-medium">
                  {published ? "Published" : "Private"}
                </span>
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {published ? (
                <Button
                  color="warning"
                  variant="flat"
                  isLoading={isPublishing}
                  onPress={() => void handlePublish(false)}
                >
                  Unpublish
                </Button>
              ) : (
                <Button
                  color="primary"
                  isLoading={isPublishing}
                  onPress={() => void handlePublish(true)}
                >
                  Publish
                </Button>
              )}
              {practiceHref && (
                <Button as={Link} href={practiceHref} variant="flat">
                  Practise privately
                </Button>
              )}
            </div>

            {publishConfirm && (
              <p className="text-sm text-success-700">{publishConfirm}</p>
            )}
          </CardBody>
        </Card>
      )}

      {publishPanel?.kind === "rejected" && (
        <Card className="border border-warning-300 bg-warning-50 shadow-none">
          <CardBody className="gap-3 p-6">
            {publishPanel.demoted && (
              <p className="text-sm font-medium text-default-800">
                Your changes were saved. This scenario has been unpublished
                until the problem below is fixed.
              </p>
            )}
            <h3 className="font-semibold text-default-900">
              This can&apos;t be published yet
            </h3>
            <p className="text-sm text-default-700">{publishPanel.reason}</p>
            <p className="text-sm font-medium text-default-900">
              What to change: {publishPanel.fix}
            </p>
            <p className="text-sm text-default-600">
              Your scenario is saved, and you can still practise it yourself
              right now.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Button
                color="primary"
                variant="flat"
                onPress={() => {
                  setPublishPanel(null);
                  document
                    .querySelector<HTMLElement>("textarea, input")
                    ?.focus();
                }}
              >
                Edit the text
              </Button>
              {practiceHref && (
                <Button as={Link} href={practiceHref} variant="flat">
                  Practise it privately
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {publishPanel?.kind === "unavailable" && (
        <Card className="border border-default-300 bg-default-50 shadow-none">
          <CardBody className="gap-3 p-6">
            {publishPanel.demoted && (
              <p className="text-sm font-medium text-default-800">
                Your changes were saved. This scenario has been unpublished
                until we can run the safety check again.
              </p>
            )}
            <h3 className="font-semibold text-default-900">
              We couldn&apos;t run the safety check just now
            </h3>
            <p className="text-sm text-default-700">
              Nothing is wrong with your scenario. Try publishing again in a
              minute.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Button
                color="primary"
                isLoading={isPublishing}
                onPress={() => void handlePublish(true)}
              >
                Retry
              </Button>
              {practiceHref && (
                <Button as={Link} href={practiceHref} variant="flat">
                  Practise privately
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
