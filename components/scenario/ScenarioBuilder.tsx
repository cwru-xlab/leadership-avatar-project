"use client";

/**
 * REQ-26 (locked decision): guided, ONE STEP AT A TIME authoring —
 * situation -> characters -> criteria -> review & save. Never a single
 * admin-style form with every field on screen, and never any button that
 * would produce a first draft on the student's behalf.
 *
 * Step machinery (a `BuilderStep` union, one step rendered at a time, a
 * progress strip above the fields) is modeled on the `SetupStep` pattern in
 * `app/interview/[type]/page.tsx`, so the visual language matches what
 * students already learned there.
 *
 * REQ-28: Save is a distinct, final step. A successful save always returns
 * the student to `/case-play` (never straight into a live session at
 * `/case-play/[caseId]`), where the new scenario is immediately startable.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Input, Textarea } from "@heroui/input";
import { Card, CardBody } from "@heroui/card";
import { addToast } from "@heroui/toast";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from "lucide-react";
import AvatarPickerGrid from "@/components/scenario/AvatarPickerGrid";
import { SCENARIO_LIMITS, validateScenarioInput } from "@/lib/scenario/validation";
import type { CaseAvatar, CaseStudy } from "@/types";

type BuilderStep = "situation" | "characters" | "criteria" | "review";

const STEPS: { id: BuilderStep; number: string; label: string }[] = [
  { id: "situation", number: "01", label: "Situation" },
  { id: "characters", number: "02", label: "Characters" },
  { id: "criteria", number: "03", label: "Criteria" },
  { id: "review", number: "04", label: "Review & save" },
];

interface FieldErrors {
  [field: string]: string;
}

function makeBlankCharacter(): CaseAvatar {
  return {
    id: crypto.randomUUID(),
    name: "",
    role: "",
    additionalInfo: "",
    profileId: undefined,
  };
}

type ScenarioBuilderProps =
  | { mode: "create" }
  | { mode: "edit"; caseId: string; initial: CaseStudy };

export default function ScenarioBuilder(props: ScenarioBuilderProps) {
  const router = useRouter();

  const [step, setStep] = useState<BuilderStep>("situation");
  const [name, setName] = useState(props.mode === "edit" ? props.initial.name : "");
  const [backgroundInfo, setBackgroundInfo] = useState(
    props.mode === "edit" ? props.initial.backgroundInfo : ""
  );
  const [evaluationPrompt, setEvaluationPrompt] = useState(
    props.mode === "edit" ? props.initial.evaluationPrompt ?? "" : ""
  );
  const [avatars, setAvatars] = useState<CaseAvatar[]>(
    props.mode === "edit" && props.initial.avatars.length > 0
      ? props.initial.avatars
      : [makeBlankCharacter()]
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);

  const hasDraftContent =
    name.trim().length > 0 ||
    backgroundInfo.trim().length > 0 ||
    evaluationPrompt.trim().length > 0 ||
    avatars.some((a) => a.name.trim() || a.role.trim() || a.profileId);

  const situationValid =
    name.trim().length >= SCENARIO_LIMITS.NAME_MIN &&
    backgroundInfo.trim().length >= SCENARIO_LIMITS.BACKGROUND_MIN;

  const charactersValid = avatars.some(
    (a) => a.profileId && a.name.trim() && a.role.trim()
  );

  const criteriaValid = evaluationPrompt.trim().length >= SCENARIO_LIMITS.EVALUATION_MIN;

  const updateCharacter = (id: string, updates: Partial<CaseAvatar>) => {
    setAvatars((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
  };

  const addCharacter = () => {
    setAvatars((prev) => [...prev, makeBlankCharacter()]);
  };

  const removeCharacter = (id: string) => {
    setAvatars((prev) => (prev.length > 1 ? prev.filter((a) => a.id !== id) : prev));
  };

  const handleCancel = () => {
    if (hasDraftContent) {
      const confirmed = window.confirm(
        "Discard this scenario draft? Nothing has been saved yet."
      );
      if (!confirmed) return;
    }
    router.push("/case-play");
  };

  const stepOwningField = (field: string): BuilderStep => {
    if (field === "name" || field === "backgroundInfo") return "situation";
    if (field.startsWith("avatars")) return "characters";
    if (field === "evaluationPrompt") return "criteria";
    return "review";
  };

  const handleSave = async () => {
    const result = validateScenarioInput({
      name,
      backgroundInfo,
      evaluationPrompt,
      avatars,
    });

    if (!result.ok) {
      const errors: FieldErrors = {};
      let firstField: string | null = null;
      for (const error of result.errors) {
        if (!errors[error.field]) errors[error.field] = error.message;
        if (!firstField) firstField = error.field;
      }
      setFieldErrors(errors);
      if (firstField) setStep(stepOwningField(firstField));
      return;
    }

    setFieldErrors({});
    setIsSaving(true);
    try {
      const endpoint =
        props.mode === "edit" ? "/api/scenario/edit" : "/api/scenario/add";
      const body =
        props.mode === "edit"
          ? { id: props.caseId, ...result.value }
          : { ...result.value };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        errors?: { field: string; message: string }[];
      };

      if (!response.ok) {
        if (data.errors?.length) {
          const errors: FieldErrors = {};
          let firstField: string | null = null;
          for (const error of data.errors) {
            if (!errors[error.field]) errors[error.field] = error.message;
            if (!firstField) firstField = error.field;
          }
          setFieldErrors(errors);
          if (firstField) setStep(stepOwningField(firstField));
        } else {
          addToast({
            title: "Could not save this scenario",
            description: data.error,
            color: "danger",
          });
        }
        return;
      }

      addToast({
        title:
          props.mode === "edit" ? "Scenario updated" : "Scenario saved",
        color: "success",
      });
      router.push("/case-play");
    } catch {
      addToast({
        title: "Could not save this scenario",
        description: "Check your connection and try again.",
        color: "danger",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div>
      <div className="mb-8 flex items-center gap-2" aria-label="Scenario builder progress">
        {STEPS.map((s, index) => (
          <div key={s.id} className="flex flex-1 items-center gap-2">
            <div
              className={`flex items-center gap-2 text-xs font-semibold ${
                s.id === step
                  ? "text-[#08718d]"
                  : index < stepIndex
                    ? "text-[#327b68]"
                    : "text-[#78909b]"
              }`}
            >
              <span
                className={`grid h-6 w-6 place-items-center rounded-full border text-[10px] ${
                  s.id === step
                    ? "border-[#08718d] bg-[#08718d] text-white"
                    : index < stepIndex
                      ? "border-[#74bba8] bg-[#e5f5ee]"
                      : "border-[#b8cbd3]"
                }`}
              >
                {index < stepIndex ? <Check size={13} /> : s.number}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {index < STEPS.length - 1 && <div className="h-px flex-1 bg-[#ccdce3]" />}
          </div>
        ))}
      </div>

      {step === "situation" && (
        <section aria-labelledby="situation-heading">
          <p className="text-sm font-semibold text-[#0a7391]">Step 1 of 4</p>
          <h2 id="situation-heading" className="mt-1 font-serif text-3xl tracking-[-0.03em]">
            Set the situation.
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#58727f]">
            This is the background every character in the roleplay already knows —
            what has happened, what is at stake, and where the conversation begins.
          </p>

          <div className="mt-7 grid max-w-2xl gap-6">
            <Input
              label="Scenario name"
              placeholder="e.g. Turning around a missed deadline"
              value={name}
              onValueChange={setName}
              isInvalid={!!fieldErrors.name}
              errorMessage={fieldErrors.name}
            />
            <div>
              <Textarea
                label="Situation"
                placeholder="Describe what's happening and what each character already knows..."
                minRows={8}
                value={backgroundInfo}
                onValueChange={setBackgroundInfo}
                isInvalid={!!fieldErrors.backgroundInfo}
                errorMessage={fieldErrors.backgroundInfo}
              />
              <p className="mt-2 text-xs text-[#78909b]">
                {backgroundInfo.trim().length} / {SCENARIO_LIMITS.BACKGROUND_MIN} characters
                minimum
              </p>
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <Button
              color="primary"
              size="lg"
              isDisabled={!situationValid}
              endContent={<ArrowRight size={17} />}
              onPress={() => setStep("characters")}
            >
              Continue
            </Button>
          </div>
        </section>
      )}

      {step === "characters" && (
        <section aria-labelledby="characters-heading">
          <p className="text-sm font-semibold text-[#0a7391]">Step 2 of 4</p>
          <h2 id="characters-heading" className="mt-1 font-serif text-3xl tracking-[-0.03em]">
            Add your characters.
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#58727f]">
            Each character needs an avatar, a name, and a role. What you write in
            &quot;private briefing&quot; is known only to that character — the student
            practicing this scenario will never see it.
          </p>

          <div className="mt-7 grid gap-6">
            {avatars.map((avatar, index) => (
              <Card key={avatar.id} className="border border-[#d4e2e9] shadow-none">
                <CardBody className="gap-5 p-6">
                  <div className="flex items-center justify-between">
                    <p className="font-serif text-xl">Character {index + 1}</p>
                    <Button
                      size="sm"
                      variant="light"
                      color="danger"
                      isDisabled={avatars.length <= 1}
                      startContent={<Trash2 size={15} />}
                      onPress={() => removeCharacter(avatar.id)}
                    >
                      Remove
                    </Button>
                  </div>

                  <AvatarPickerGrid
                    value={avatar.profileId ?? null}
                    onChange={(profileId) => updateCharacter(avatar.id, { profileId })}
                  />

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Input
                      label="Character name"
                      value={avatar.name}
                      onValueChange={(value) => updateCharacter(avatar.id, { name: value })}
                      isInvalid={!!fieldErrors[`avatars[${index}].name`]}
                      errorMessage={fieldErrors[`avatars[${index}].name`]}
                    />
                    <Input
                      label="Role"
                      placeholder="e.g. Direct report"
                      value={avatar.role}
                      onValueChange={(value) => updateCharacter(avatar.id, { role: value })}
                      isInvalid={!!fieldErrors[`avatars[${index}].role`]}
                      errorMessage={fieldErrors[`avatars[${index}].role`]}
                    />
                  </div>

                  <Textarea
                    label="Private briefing (only this character knows this)"
                    placeholder="What this character believes, wants, or is hiding..."
                    minRows={3}
                    value={avatar.additionalInfo}
                    onValueChange={(value) =>
                      updateCharacter(avatar.id, { additionalInfo: value })
                    }
                  />
                </CardBody>
              </Card>
            ))}
          </div>

          <div className="mt-5">
            <Button variant="flat" startContent={<Plus size={16} />} onPress={addCharacter}>
              Add another character
            </Button>
          </div>

          <div className="mt-8 flex justify-between gap-3">
            <Button variant="light" onPress={() => setStep("situation")}>
              Back
            </Button>
            <Button
              color="primary"
              size="lg"
              isDisabled={!charactersValid}
              endContent={<ArrowRight size={17} />}
              onPress={() => setStep("criteria")}
            >
              Continue
            </Button>
          </div>
        </section>
      )}

      {step === "criteria" && (
        <section aria-labelledby="criteria-heading">
          <p className="text-sm font-semibold text-[#0a7391]">Step 3 of 4</p>
          <h2 id="criteria-heading" className="mt-1 font-serif text-3xl tracking-[-0.03em]">
            Set your criteria.
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#58727f]">
            Every run of this scenario is already graded on conversational
            adequacy and emotional intelligence by a standard rubric. What you
            write here is applied IN ADDITION to that rubric — it does not
            replace it. Note: visual and vocal delivery are not yet measured by
            this system.
          </p>

          <div className="mt-7 max-w-2xl">
            <Textarea
              label="Additional criteria"
              placeholder="What should a strong response to this scenario look like?"
              minRows={8}
              value={evaluationPrompt}
              onValueChange={setEvaluationPrompt}
              isInvalid={!!fieldErrors.evaluationPrompt}
              errorMessage={fieldErrors.evaluationPrompt}
            />
            <p className="mt-2 text-xs text-[#78909b]">
              {evaluationPrompt.trim().length} / {SCENARIO_LIMITS.EVALUATION_MIN} characters
              minimum
            </p>
          </div>

          <div className="mt-8 flex justify-between gap-3">
            <Button variant="light" onPress={() => setStep("characters")}>
              Back
            </Button>
            <Button
              color="primary"
              size="lg"
              isDisabled={!criteriaValid}
              endContent={<ArrowRight size={17} />}
              onPress={() => setStep("review")}
            >
              Continue
            </Button>
          </div>
        </section>
      )}

      {step === "review" && (
        <section aria-labelledby="review-heading">
          <p className="text-sm font-semibold text-[#0a7391]">Step 4 of 4</p>
          <h2 id="review-heading" className="mt-1 font-serif text-3xl tracking-[-0.03em]">
            Review &amp; save.
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#58727f]">
            Check everything below, then save. Saving does not start a
            practice run — you&apos;ll launch it from your scenario list.
          </p>

          <div className="mt-7 grid max-w-2xl gap-5">
            <Card className="border border-[#d4e2e9] shadow-none">
              <CardBody className="gap-2 p-6">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0a7391]">
                  Situation
                </p>
                <p className="font-serif text-xl">{name || "Untitled scenario"}</p>
                <p className="whitespace-pre-wrap text-sm leading-6 text-[#526c7b]">
                  {backgroundInfo}
                </p>
              </CardBody>
            </Card>

            <Card className="border border-[#d4e2e9] shadow-none">
              <CardBody className="gap-3 p-6">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0a7391]">
                  Characters ({avatars.length})
                </p>
                {avatars.map((avatar) => (
                  <div key={avatar.id} className="border-t border-[#e0eaee] pt-3 first:border-0 first:pt-0">
                    <p className="font-semibold text-[#183947]">
                      {avatar.name || "Unnamed character"}{" "}
                      <span className="font-normal text-[#78909b]">· {avatar.role}</span>
                    </p>
                  </div>
                ))}
              </CardBody>
            </Card>

            <Card className="border border-[#d4e2e9] shadow-none">
              <CardBody className="gap-2 p-6">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0a7391]">
                  Criteria
                </p>
                <p className="whitespace-pre-wrap text-sm leading-6 text-[#526c7b]">
                  {evaluationPrompt}
                </p>
              </CardBody>
            </Card>
          </div>

          <div className="mt-8 flex justify-between gap-3">
            <Button variant="light" onPress={() => setStep("criteria")}>
              Back
            </Button>
            <Button
              color="primary"
              size="lg"
              isDisabled={isSaving}
              endContent={<ArrowRight size={17} />}
              onPress={() => void handleSave()}
            >
              {isSaving ? "Saving..." : "Save scenario"}
            </Button>
          </div>
        </section>
      )}

      <div className="mt-10 border-t border-[#e0eaee] pt-6">
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[#78909b] transition-colors hover:text-[#0a7391] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0a7391]"
          onClick={handleCancel}
        >
          <ArrowLeft size={16} /> Cancel and return to scenarios
        </button>
      </div>
    </div>
  );
}
