"use client";

/**
 * Networking person-choice step: built-in character grid OR bring-someone-in
 * (paste / write / generate-then-edit) with server-served attestation.
 *
 * Decision 8 scoping: attestation is shown on the bring-in branch only.
 * Built-in characters are fictional code records — no attestation applies.
 *
 * The disabled "Use this person" button is a courtesy. The real gate is
 * consumeAttestation server-side (16-05); do not "simplify" by trusting
 * the client checkbox alone.
 *
 * Ephemeral: paste, hint, and generated description live only in React state
 * for the life of this step — never browser storage, URL params, or analytics.
 */

import type { SetupStepNav } from "@/components/practice/SetupWizard";

import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Checkbox } from "@heroui/checkbox";
import { Chip } from "@heroui/chip";
import { Input, Textarea } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import {
  ArrowRight,
  Check,
  CircleAlert,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  distillWithAttestation,
  fetchAttestationWording,
  generateDescription,
  isWizardClientError,
  listSavedPersonas,
  recordAttestationTick,
  saveBroughtInPersona,
  type PersonaSource,
  type SavedPersonaListItem,
} from "@/lib/networking/wizard-client";
import { MAX_HINT_LENGTH } from "@/lib/networking/person-generation";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/interview/persona-distill";
import { listNetworkingCharacters } from "@/lib/networking/characters";

type Branch = "character" | "bring-in" | null;
type InputMode = "pasted" | "written" | "generated";

export interface NetworkingPersonStepProps {
  nav: SetupStepNav;
  characterId: string | null;
  instanceId: string | null;
  onChange: (next: {
    characterId: string | null;
    instanceId: string | null;
    /** Present after distill/save or saved-persona select — seeds live chat. */
    broughtInLive?: { persona: string; displayName: string } | null;
  }) => void;
}

const CHARACTERS = listNetworkingCharacters();

export default function NetworkingPersonStep({
  nav,
  characterId,
  instanceId,
  onChange,
}: NetworkingPersonStepProps) {
  const [branch, setBranch] = useState<Branch>(
    characterId ? "character" : instanceId ? "bring-in" : null,
  );
  const [inputMode, setInputMode] = useState<InputMode>("pasted");
  // ONE shared description field across Paste / Write / Generate modes.
  // The field's CURRENT VALUE is what gets distilled — never a separate
  // "original generated" string held aside (16-CONTEXT.md decision 2).
  const [description, setDescription] = useState("");
  const [hint, setHint] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [distilledPreview, setDistilledPreview] = useState<string | null>(null);

  const [attestationWording, setAttestationWording] = useState<string | null>(
    null,
  );
  const [wordingVersion, setWordingVersion] = useState<string | null>(null);
  const [wordingLoading, setWordingLoading] = useState(true);
  const [wordingError, setWordingError] = useState<string | null>(null);
  const [attested, setAttested] = useState(false);

  const [savedPersonas, setSavedPersonas] = useState<SavedPersonaListItem[]>(
    [],
  );
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedError, setSavedError] = useState<string | null>(null);
  // Bumped when the bring-in branch opens so the mount-style fetch re-runs.
  const [bringInEpoch, setBringInEpoch] = useState(0);

  const canAdvance = Boolean(characterId || instanceId);

  const loadWording = useCallback(async () => {
    setWordingLoading(true);
    setWordingError(null);
    const result = await fetchAttestationWording();

    setWordingLoading(false);
    if (isWizardClientError(result)) {
      setAttestationWording(null);
      setWordingVersion(null);
      setWordingError(result.message);

      return;
    }
    setAttestationWording(result.wording);
    setWordingVersion(result.wordingVersion);
  }, []);

  const loadSaved = useCallback(async () => {
    setSavedLoading(true);
    setSavedError(null);
    const result = await listSavedPersonas();

    setSavedLoading(false);
    if (isWizardClientError(result)) {
      setSavedPersonas([]);
      setSavedError(result.message);

      return;
    }
    setSavedPersonas(result);
  }, []);

  // Match InterviewerStep: async fetch on mount / epoch, setState only after await.
  useEffect(() => {
    if (branch !== "bring-in") return;

    let isCurrent = true;

    const load = async () => {
      const [wordingResult, savedResult] = await Promise.all([
        fetchAttestationWording(),
        listSavedPersonas(),
      ]);

      if (!isCurrent) return;

      if (isWizardClientError(wordingResult)) {
        setAttestationWording(null);
        setWordingVersion(null);
        setWordingError(wordingResult.message);
      } else {
        setAttestationWording(wordingResult.wording);
        setWordingVersion(wordingResult.wordingVersion);
        setWordingError(null);
      }
      setWordingLoading(false);

      if (isWizardClientError(savedResult)) {
        setSavedPersonas([]);
        setSavedError(savedResult.message);
      } else {
        setSavedPersonas(savedResult);
        setSavedError(null);
      }
      setSavedLoading(false);
    };

    void load();

    return () => {
      isCurrent = false;
    };
  }, [branch, bringInEpoch]);

  const selectBranch = (next: Branch) => {
    setBranch(next);
    setActionError(null);
    setDistilledPreview(null);
    if (next === "character") {
      // Switching to character clears any brought-in instance.
      if (instanceId) onChange({ characterId: null, instanceId: null });
    } else if (next === "bring-in") {
      // Switching to bring-in clears any character selection.
      if (characterId) onChange({ characterId: null, instanceId: null });
      setWordingLoading(true);
      setSavedLoading(true);
      setBringInEpoch((n) => n + 1);
    }
  };

  const selectCharacter = (id: string) => {
    // No attestation on this branch — characters are fictional (decision 8).
    onChange({ characterId: id, instanceId: null });
    setDistilledPreview(null);
    setActionError(null);
  };

  const selectSavedPersona = (personaId: string) => {
    // Already attested at save time — relaunch without re-pasting (decision 7).
    // List DTO omits persona text — page fetches GET /persona/:id for live chat.
    onChange({
      characterId: null,
      instanceId: personaId,
      broughtInLive: null,
    });
    setDistilledPreview(null);
    setActionError(null);
  };

  const handleGenerate = async () => {
    if (!hint.trim() || generating) return;
    setGenerating(true);
    setActionError(null);
    const result = await generateDescription(hint.trim());

    setGenerating(false);
    if (isWizardClientError(result)) {
      setActionError(result.message);

      return;
    }
    // Drop into the SAME editable field — edits here are what distill sees.
    setDescription(result.description);
  };

  const handleStaleWording = async (message: string) => {
    setAttested(false);
    setActionError(message);
    await loadWording();
  };

  const handleUsePerson = async () => {
    if (!description.trim() || !attested || !wordingVersion || submitting) {
      return;
    }

    setSubmitting(true);
    setActionError(null);

    // ORDER: tick → distill (spends tick) → save (requires spent tick).
    const tick = await recordAttestationTick(wordingVersion);

    if (isWizardClientError(tick)) {
      setSubmitting(false);
      setActionError(tick.message);

      return;
    }
    if ("staleWording" in tick) {
      setSubmitting(false);
      await handleStaleWording(
        "The agreement was updated. Please read it again and tick the box.",
      );

      return;
    }

    const attestationId = tick.attestationId;
    // Distill the TEXTAREA'S CURRENT VALUE — not a separate generated original.
    const distilled = await distillWithAttestation({
      profileText: description,
      attestationId,
    });

    if (isWizardClientError(distilled)) {
      setSubmitting(false);
      setActionError(distilled.message);
      setAttested(false);

      return;
    }

    if (!distilled.ok) {
      setSubmitting(false);
      if (distilled.reason === "stale-wording") {
        await handleStaleWording(
          "The agreement was updated. Please read it again and tick the box.",
        );

        return;
      }
      if (distilled.reason === "expired") {
        setAttested(false);
        setActionError("Your agreement expired. Please tick the box again.");

        return;
      }
      setAttested(false);
      setActionError(distilled.message || "Please try again.");

      return;
    }

    const nameToSave =
      displayName.trim() ||
      distilled.displayName.trim() ||
      "Networking contact";
    const source: PersonaSource = inputMode;

    const saved = await saveBroughtInPersona({
      persona: distilled.persona,
      displayName: nameToSave.slice(0, MAX_DISPLAY_NAME_LENGTH),
      source,
      attestationId: distilled.attestationId,
    });

    setSubmitting(false);

    if (isWizardClientError(saved)) {
      setActionError(saved.message);
      setAttested(false);

      return;
    }

    setDisplayName(nameToSave.slice(0, MAX_DISPLAY_NAME_LENGTH));
    setDistilledPreview(distilled.persona);
    onChange({
      characterId: null,
      instanceId: saved.personaId,
      broughtInLive: {
        persona: distilled.persona,
        displayName: nameToSave.slice(0, MAX_DISPLAY_NAME_LENGTH),
      },
    });
    void loadSaved();
  };

  const placeholderForMode =
    inputMode === "pasted"
      ? "Paste a LinkedIn About section or similar public profile text…"
      : inputMode === "written"
        ? "Describe the person in your own words — role, background, how they tend to talk…"
        : "Edit the generated description before continuing…";

  const useDisabled =
    !description.trim() ||
    !attested ||
    !wordingVersion ||
    submitting ||
    wordingLoading;

  return (
    <section aria-labelledby="networking-person-heading">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#0a7391]">
            Step {nav.stepNumber} of {nav.totalSteps}
          </p>
          <h2
            className="mt-1 font-serif text-3xl tracking-[-0.03em]"
            id="networking-person-heading"
          >
            Who are you meeting?
          </h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-[#58727f]">
          Pick a built-in character, or bring in someone real. You choose the
          face and voice on the next steps.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          aria-pressed={branch === "character"}
          className={`rounded-2xl border p-6 text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0a7391] ${
            branch === "character"
              ? "border-[#0a7391] bg-[#edf9fc] shadow-[0_12px_28px_rgba(16,104,133,0.14)]"
              : "border-[#d4e2e9] bg-white hover:border-[#82bdcf] hover:shadow-md"
          }`}
          type="button"
          onClick={() => selectBranch("character")}
        >
          <Users className="mb-3 text-[#0a7391]" size={22} />
          <h3 className="font-serif text-2xl">Pick someone to practice with</h3>
          <p className="mt-2 text-sm leading-6 text-[#58727f]">
            Five fictional professionals — no pasting, no authoring.
          </p>
        </button>

        <button
          aria-pressed={branch === "bring-in"}
          className={`rounded-2xl border p-6 text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0a7391] ${
            branch === "bring-in"
              ? "border-[#0a7391] bg-[#edf9fc] shadow-[0_12px_28px_rgba(16,104,133,0.14)]"
              : "border-[#d4e2e9] bg-white hover:border-[#82bdcf] hover:shadow-md"
          }`}
          type="button"
          onClick={() => selectBranch("bring-in")}
        >
          <UserPlus className="mb-3 text-[#0a7391]" size={22} />
          <h3 className="font-serif text-2xl">Bring in someone real</h3>
          <p className="mt-2 text-sm leading-6 text-[#58727f]">
            Paste, write, or generate a description — then confirm the
            agreement.
          </p>
        </button>
      </div>

      {branch === "character" && (
        <div className="mt-8">
          {/*
            No attestation on this branch. NETWORKING_CHARACTERS are fictional
            code records (16-CONTEXT.md decision 8). Attestation is for
            third-party paste on the bring-in path only.
          */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {CHARACTERS.map((character) => {
              const selected = character.id === characterId;

              return (
                <button
                  key={character.id}
                  aria-pressed={selected}
                  className={`relative min-h-48 rounded-2xl border p-5 text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0a7391] ${
                    selected
                      ? "border-[#0a7391] bg-[#edf9fc] shadow-[0_12px_28px_rgba(16,104,133,0.14)]"
                      : "border-[#d4e2e9] bg-white hover:border-[#82bdcf] hover:shadow-md"
                  }`}
                  type="button"
                  onClick={() => selectCharacter(character.id)}
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      <Chip size="sm" variant="flat">
                        {character.seniority}
                      </Chip>
                      <Chip size="sm" variant="flat">
                        {character.field}
                      </Chip>
                    </div>
                    {selected && (
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-[#79d4b1] text-[#0b3029]">
                        <Check size={15} />
                      </span>
                    )}
                  </div>
                  <h3 className="font-serif text-2xl">
                    {character.displayName}
                  </h3>
                  <p className="mt-1 text-sm font-medium text-[#0a7391]">
                    {character.headline}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[#58727f]">
                    {character.blurb}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {branch === "bring-in" && (
        <div className="mt-8 space-y-6">
          <div className="rounded-2xl border border-[#d4e2e9] bg-white p-5 sm:p-6">
            <h3 className="font-serif text-xl">Saved people</h3>
            <p className="mt-1 text-sm text-[#58727f]">
              Relaunch without re-pasting. No share or publish options — these
              stay yours.
            </p>
            {savedLoading ? (
              <div className="mt-4 grid min-h-20 place-items-center">
                <Spinner color="primary" size="sm" />
              </div>
            ) : savedError ? (
              <Card className="mt-4 border border-danger-200 bg-danger-50 shadow-none">
                <CardBody className="gap-2 p-4 text-danger-800">
                  <p className="text-sm">{savedError}</p>
                  <Button
                    size="sm"
                    variant="flat"
                    onPress={() => void loadSaved()}
                  >
                    Try again
                  </Button>
                </CardBody>
              </Card>
            ) : savedPersonas.length === 0 ? (
              <p className="mt-4 text-sm text-[#6a8491]">
                No saved people yet. Bring someone in below.
              </p>
            ) : (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {savedPersonas.map((persona) => {
                  const selected = persona.personaId === instanceId;

                  return (
                    <li key={persona.personaId}>
                      <button
                        aria-pressed={selected}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0a7391] ${
                          selected
                            ? "border-[#0a7391] bg-[#edf9fc]"
                            : "border-[#d4e2e9] bg-[#f7fbfc] hover:border-[#82bdcf]"
                        }`}
                        type="button"
                        onClick={() => selectSavedPersona(persona.personaId)}
                      >
                        <div>
                          <p className="font-medium text-[#183947]">
                            {persona.displayName}
                          </p>
                          <p className="text-xs text-[#6a8491]">
                            {persona.source} ·{" "}
                            {new Date(persona.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        {selected && (
                          <Check
                            className="shrink-0 text-[#0a7391]"
                            size={18}
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-[#d4e2e9] bg-white p-5 sm:p-6">
            <div
              aria-label="How to describe this person"
              className="inline-flex rounded-xl border border-[#d4e2e9] bg-[#f7fbfc] p-1"
              role="tablist"
            >
              {(
                [
                  ["pasted", "Paste"],
                  ["written", "Write"],
                  ["generated", "Generate"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  aria-selected={inputMode === mode}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a7391] ${
                    inputMode === mode
                      ? "bg-white text-[#0a7391] shadow-sm"
                      : "text-[#526c7b] hover:text-[#183947]"
                  }`}
                  role="tab"
                  type="button"
                  onClick={() => {
                    setInputMode(mode);
                    setActionError(null);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {inputMode === "generated" && (
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
                <Input
                  className="flex-1"
                  classNames={{
                    inputWrapper:
                      "border border-[#d4e2e9] bg-[#f7fbfc] shadow-none",
                  }}
                  label="Hint"
                  labelPlacement="outside"
                  maxLength={MAX_HINT_LENGTH}
                  placeholder="e.g. senior product manager at a B2B SaaS company"
                  value={hint}
                  onValueChange={setHint}
                />
                <Button
                  color="primary"
                  isDisabled={!hint.trim() || generating}
                  isLoading={generating}
                  startContent={
                    !generating ? <Sparkles size={16} /> : undefined
                  }
                  variant="flat"
                  onPress={() => void handleGenerate()}
                >
                  Generate
                </Button>
              </div>
            )}

            <div className="mt-5">
              <Textarea
                aria-label="Person description"
                classNames={{
                  inputWrapper:
                    "border border-[#d4e2e9] bg-[#f7fbfc] shadow-none data-[hover=true]:bg-[#f7fbfc]",
                }}
                maxRows={12}
                minRows={5}
                placeholder={placeholderForMode}
                value={description}
                onValueChange={setDescription}
              />
            </div>

            <div className="mt-4">
              <Input
                classNames={{
                  inputWrapper:
                    "border border-[#d4e2e9] bg-[#f7fbfc] shadow-none",
                }}
                label="Display name"
                labelPlacement="outside"
                maxLength={MAX_DISPLAY_NAME_LENGTH}
                placeholder="Filled from distillation — editable"
                value={displayName}
                onValueChange={setDisplayName}
              />
            </div>

            <div className="mt-5 rounded-xl border border-[#d4e2e9] bg-[#f7fbfc] p-4">
              {wordingLoading ? (
                <div className="grid min-h-16 place-items-center">
                  <Spinner color="primary" size="sm" />
                </div>
              ) : wordingError || !attestationWording ? (
                <div className="space-y-2 text-sm text-danger-700">
                  <p className="flex items-start gap-2">
                    <CircleAlert className="mt-0.5 shrink-0" size={18} />
                    {wordingError || "Unable to load the agreement."}
                  </p>
                  <Button
                    size="sm"
                    variant="flat"
                    onPress={() => void loadWording()}
                  >
                    Retry
                  </Button>
                </div>
              ) : (
                <Checkbox
                  classNames={{ label: "text-sm leading-6 text-[#183947]" }}
                  isSelected={attested}
                  onValueChange={setAttested}
                >
                  {attestationWording}
                </Checkbox>
              )}
            </div>

            {actionError && (
              <p className="mt-3 text-sm text-danger-700" role="alert">
                {actionError}
              </p>
            )}

            {distilledPreview && (
              <div className="mt-4 rounded-xl border border-[#b7ddd0] bg-[#f0faf5] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#0b6b4f]">
                  What the avatar will be given
                </p>
                <p className="mt-2 text-sm leading-6 text-[#183947]">
                  {distilledPreview}
                </p>
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <Button
                color="primary"
                isDisabled={useDisabled}
                isLoading={submitting}
                onPress={() => void handleUsePerson()}
              >
                Use this person
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-7 flex justify-end gap-3">
        {nav.stepNumber > 1 && (
          <Button variant="flat" onPress={nav.goBack}>
            Back
          </Button>
        )}
        <Button
          color="primary"
          endContent={<ArrowRight size={17} />}
          isDisabled={!canAdvance}
          size="lg"
          onPress={nav.goNext}
        >
          Continue
        </Button>
      </div>
    </section>
  );
}
