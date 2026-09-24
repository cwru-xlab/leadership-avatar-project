"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@heroui/button";
import { Textarea } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Spinner } from "@heroui/spinner";
import { addToast } from "@heroui/toast";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import type { InterviewType } from "@/lib/interview/types";
import type { InterviewCustomizationInput } from "@/lib/interview/customization";
import {
  CURATED_INDUSTRIES,
  CURATED_ROLES,
  SESSION_LENGTH_PRESETS,
  PERSONALITY_DIALS,
  INTERVIEW_DIFFICULTIES,
  DEFAULT_SESSION_LENGTH_SLUG,
  DEFAULT_PERSONALITY_SLUG,
} from "@/lib/interview/customization-options";

const MAX_PROFILE_TEXT_LENGTH = 4000;

/** Best-effort reverse lookup: find the curated slug whose promptValue matches a preset's raw field. */
function matchIndustrySlug(rawIndustry: string): string | undefined {
  return CURATED_INDUSTRIES.find((o) => o.promptValue === rawIndustry)?.slug;
}
function matchRoleSlug(rawRole: string): string | undefined {
  return CURATED_ROLES.find((o) => o.promptValue === rawRole)?.slug;
}
/** The length preset whose (minutes, questions) pair matches this preset exactly, if any. */
function matchLengthSlug(minutes: number, questions: number): string | undefined {
  return SESSION_LENGTH_PRESETS.find(
    (p) => p.targetMinutes === minutes && p.targetQuestionCount === questions
  )?.slug;
}

/**
 * Per-preset customization, collapsed by default (REQ-19, locked). Renders a
 * read-only summary of the active preset's defaults; opening it mounts five
 * dropdown-only controls plus an optional pasted-persona distillation flow.
 *
 * Emits `InterviewCustomizationInput` — slugs only, never labels or prompt
 * text — via `onChange`. Stores nothing in localStorage: customization is
 * deliberately session-only (08-CONTEXT.md, Claude's discretion).
 */
export default function CustomizePanel({
  interviewType,
  onChange,
}: {
  interviewType: InterviewType;
  onChange: (input: InterviewCustomizationInput) => void;
}) {
  const [open, setOpen] = useState(false);
  // Tracks whether the student has ever opened the panel for the CURRENT
  // preset. `onChange` is suppressed until this is true so the picker page
  // never writes a customization the student never asked for — the fast
  // path (pick a preset, press Start) must stay free of emitted state.
  const [openedOnce, setOpenedOnce] = useState(false);

  const defaultIndustrySlug = useMemo(
    () => matchIndustrySlug(interviewType.defaultIndustry),
    [interviewType]
  );
  const defaultRoleSlug = useMemo(
    () => matchRoleSlug(interviewType.defaultRoleTitle),
    [interviewType]
  );
  const defaultLengthSlug = useMemo(
    () =>
      matchLengthSlug(interviewType.targetMinutes, interviewType.targetQuestionCount) ??
      DEFAULT_SESSION_LENGTH_SLUG,
    [interviewType]
  );

  const [industrySlug, setIndustrySlug] = useState<string | undefined>(defaultIndustrySlug);
  const [roleSlug, setRoleSlug] = useState<string | undefined>(defaultRoleSlug);
  const [difficulty, setDifficulty] = useState<string | undefined>(interviewType.difficulty);
  const [lengthSlug, setLengthSlug] = useState<string | undefined>(defaultLengthSlug);
  const [personalitySlug, setPersonalitySlug] = useState<string | undefined>(
    DEFAULT_PERSONALITY_SLUG
  );

  const [profileText, setProfileText] = useState("");
  const [distilledPersona, setDistilledPersona] = useState<string | undefined>(undefined);
  const [personaDisplayName, setPersonaDisplayName] = useState<string | undefined>(undefined);
  const [distilling, setDistilling] = useState(false);

  // Selected preset changed: reset the whole panel back to that preset's
  // defaults and collapse, since a customization from a different preset
  // no longer applies.
  useEffect(() => {
    setOpen(false);
    setOpenedOnce(false);
    setIndustrySlug(defaultIndustrySlug);
    setRoleSlug(defaultRoleSlug);
    setDifficulty(interviewType.difficulty);
    setLengthSlug(defaultLengthSlug);
    setPersonalitySlug(DEFAULT_PERSONALITY_SLUG);
    setProfileText("");
    setDistilledPersona(undefined);
    setPersonaDisplayName(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewType.slug]);

  // Emit whenever a resolved field changes, but only once the student has
  // opened the panel for this preset — until then, the picker page must
  // write nothing (absence of a customization IS the "use defaults" signal).
  // Cleared fields emit `undefined`, never `""` (REQ-20: a cleared field
  // falls back to the preset default).
  useEffect(() => {
    if (!openedOnce) return;
    onChange({
      industrySlug: industrySlug || undefined,
      roleSlug: roleSlug || undefined,
      difficulty: difficulty || undefined,
      lengthSlug: lengthSlug || undefined,
      personalitySlug: personalitySlug || undefined,
      distilledPersona: distilledPersona || undefined,
      personaDisplayName: personaDisplayName || undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedOnce, industrySlug, roleSlug, difficulty, lengthSlug, personalitySlug, distilledPersona, personaDisplayName]);

  const industryOption = CURATED_INDUSTRIES.find((o) => o.slug === industrySlug);
  const roleOption = CURATED_ROLES.find((o) => o.slug === roleSlug);
  const lengthOption = SESSION_LENGTH_PRESETS.find((p) => p.slug === lengthSlug);
  const personalityOption = PERSONALITY_DIALS.find((p) => p.slug === personalitySlug);

  const summaryParts = [
    difficulty || interviewType.difficulty,
    lengthOption ? `~${lengthOption.targetMinutes} min` : `~${interviewType.targetMinutes} min`,
    industryOption?.label.toLowerCase() || interviewType.defaultIndustry,
    roleOption?.label.toLowerCase() || interviewType.defaultRoleTitle,
    distilledPersona ? "custom pasted persona" : personalityOption?.label.toLowerCase() || "neutral & professional",
  ];

  const buildPersona = async () => {
    const trimmed = profileText.trim();
    if (!trimmed) return;
    setDistilling(true);
    try {
      const response = await fetch("/api/interview/persona/distill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileText: trimmed.slice(0, MAX_PROFILE_TEXT_LENGTH) }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        persona?: string;
        displayName?: string;
        error?: string;
      };
      if (!response.ok || !data.persona) {
        throw new Error(data.error || "Could not build a persona from that description.");
      }
      setDistilledPersona(data.persona);
      setPersonaDisplayName(data.displayName?.trim() || undefined);
    } catch (error) {
      addToast({
        title: "Could not build persona",
        description: error instanceof Error ? error.message : undefined,
        color: "danger",
      });
    } finally {
      setDistilling(false);
    }
  };

  return (
    <div className="rounded-xl border border-[#d4e2e9] bg-white/70 p-4">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setOpenedOnce(true);
        }}
        className="flex w-full items-center justify-between gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0a7391]"
        aria-expanded={open}
      >
        <span className="text-sm text-[#4e6977]">
          {summaryParts.join(" · ")}
        </span>
        <span className="flex items-center gap-1 text-xs font-semibold text-[#0a7391]">
          Customize {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {open && (
        <div className="mt-4 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Industry"
              placeholder="Use preset default"
              selectedKeys={industrySlug ? [industrySlug] : []}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as string | undefined;
                setIndustrySlug(selected);
              }}
            >
              {CURATED_INDUSTRIES.map((option) => (
                <SelectItem key={option.slug}>{option.label}</SelectItem>
              ))}
            </Select>

            <Select
              label="Role"
              placeholder="Use preset default"
              selectedKeys={roleSlug ? [roleSlug] : []}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as string | undefined;
                setRoleSlug(selected);
              }}
            >
              {CURATED_ROLES.map((option) => (
                <SelectItem key={option.slug}>{option.label}</SelectItem>
              ))}
            </Select>

            <Select
              label="Difficulty"
              description="Changes follow-up depth and how hard the interviewer presses — not the number of questions."
              placeholder="Use preset default"
              selectedKeys={difficulty ? [difficulty] : []}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as string | undefined;
                setDifficulty(selected);
              }}
            >
              {INTERVIEW_DIFFICULTIES.map((option) => (
                <SelectItem key={option}>{option}</SelectItem>
              ))}
            </Select>

            <Select
              label="Session length"
              placeholder="Use preset default"
              selectedKeys={lengthSlug ? [lengthSlug] : []}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as string | undefined;
                setLengthSlug(selected);
              }}
            >
              {SESSION_LENGTH_PRESETS.map((option) => (
                <SelectItem key={option.slug}>
                  {`${option.label} · ~${option.targetMinutes} min · ${option.targetQuestionCount} questions`}
                </SelectItem>
              ))}
            </Select>
          </div>

          <Select
            label="Interviewer personality"
            placeholder="Use preset default"
            isDisabled={!!distilledPersona}
            description={
              distilledPersona
                ? "Disabled — the pasted persona is played directly and ignores this dial."
                : undefined
            }
            selectedKeys={personalitySlug ? [personalitySlug] : []}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys)[0] as string | undefined;
              setPersonalitySlug(selected);
            }}
          >
            {PERSONALITY_DIALS.map((option) => (
              <SelectItem key={option.slug}>{option.label}</SelectItem>
            ))}
          </Select>

          <div className="rounded-lg border border-[#d4e2e9] bg-[#f5f8fa] p-4">
            <p className="text-sm font-semibold text-[#183947]">
              Who is interviewing you? (optional)
            </p>
            <p className="mt-1 text-xs leading-5 text-[#58727f]">
              This is a rehearsal simulation, not a portrait of the real person — the AI will
              invent details it was not given. Paste a description; do not paste a URL, since
              nothing is fetched from a link.
            </p>

            {distilledPersona ? (
              <div className="mt-3 rounded-lg border border-[#b7e3d4] bg-[#effaf5] p-3 text-sm text-[#185b49]">
                <p className="font-semibold">Distilled persona</p>
                <p className="mt-1 leading-6">{distilledPersona}</p>
                <Button
                  size="sm"
                  variant="light"
                  className="mt-2"
                  onPress={() => {
                    setDistilledPersona(undefined);
                    setPersonaDisplayName(undefined);
                    setProfileText("");
                  }}
                >
                  Clear
                </Button>
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                <Textarea
                  minRows={3}
                  maxRows={8}
                  placeholder="Paste or type a description of who is interviewing you…"
                  value={profileText}
                  onValueChange={(value) => setProfileText(value.slice(0, MAX_PROFILE_TEXT_LENGTH))}
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#78909b]">
                    {profileText.length}/{MAX_PROFILE_TEXT_LENGTH}
                  </span>
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    isDisabled={!profileText.trim() || distilling}
                    startContent={distilling ? <Spinner size="sm" /> : <Sparkles size={14} />}
                    onPress={buildPersona}
                  >
                    {distilling ? "Building…" : "Build persona"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
