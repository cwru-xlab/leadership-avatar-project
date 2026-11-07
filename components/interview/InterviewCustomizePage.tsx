"use client";

/**
 * A preset's customization page — `routes.customizeInterview(slug)`. Replaces
 * the old in-card Customize panel with a page of its own, so Back works and the
 * options have room. Every option the panel had is here: industry, role,
 * difficulty, session length, interviewer personality, and the pasted
 * "who is interviewing you" persona distilled by the server.
 *
 * Contracts kept from the panel:
 * - Values are slugs from the closed lists in `lib/interview/customization-options`
 *   and are re-validated server-side by `resolveInterviewType`.
 * - Handoff is the read-once sessionStorage key `interview:customization:{slug}`
 *   that `PracticeTypePage` reads on mount and clears. It is written ONLY when
 *   something differs from the preset — its absence is the "use preset
 *   defaults" signal, so Continue with nothing changed equals a plain Start.
 * - The raw pasted profile text is never stored; only the distilled persona
 *   travels.
 *
 * The slug choices are mirrored into the query string (replaceState) so
 * returning with Back from the setup wizard restores them. The distilled
 * persona is not put in the URL.
 *
 * Problem interviews (consulting, PM, analytics, finance) also offer a
 * "Question type": the type's public `problemInterview.families` (never the
 * bank). "Surprise me" (random) is the default and sends nothing; a chosen
 * family travels in the handoff as `problemFamily` and reaches session start
 * as the top-level `problemFamily` param.
 */
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@heroui/button";
import { Textarea } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import { addToast } from "@heroui/toast";
import { ArrowRight, ChevronDown, Clock3, Gauge, RotateCcw, Sparkles, UserRound } from "lucide-react";

import ChoiceTiles, { type ChoiceTile } from "@/components/interview/ChoiceTiles";
import { interviewIcon, interviewTagline } from "@/components/interview/interviewPicker";
import PracticeHero from "@/components/practice/PracticeHero";
import type { InterviewCustomizationInput } from "@/lib/interview/customization";
import {
  CURATED_INDUSTRIES,
  CURATED_ROLES,
  DEFAULT_PERSONALITY_SLUG,
  INTERVIEW_DIFFICULTIES,
  PERSONALITY_DIALS,
  SESSION_LENGTH_PRESETS,
} from "@/lib/interview/customization-options";
import { DEFAULT_INTERVIEW_TYPE, getInterviewType, isListedInterviewType } from "@/lib/interview/types";
import { routes } from "@/lib/routes";
import { getEngineType } from "@/lib/engine/registry";

const MAX_PROFILE_TEXT_LENGTH = 4000;
/** "" in any field means "the preset's own value" — used when no curated option matches it. */
const PRESET = "";

type Field = "family" | "industry" | "role" | "difficulty" | "length" | "interviewer";
/** The question-type value for "Surprise me": no family preference. */
const RANDOM_FAMILY = "";
type Values = Record<Field, string>;

const PERSONALITY_HINTS: Record<string, string> = {
  warm: "Gives you room to think.",
  neutral: "Even and professional.",
  pressure: "Presses hard for specifics.",
};
const DIFFICULTY_HINTS: Record<string, string> = {
  Beginner: "Light follow-ups.",
  Intermediate: "Asks for specifics.",
  Advanced: "Probes every answer.",
};

const stripArticle = (text: string) => text.replace(/^(an?|the)\s+/i, "");

export default function InterviewCustomizePage({ slug }: { slug: string }) {
  const router = useRouter();
  // The server page has already 404'd unknown slugs.
  const preset = getInterviewType(slug) ?? DEFAULT_INTERVIEW_TYPE;
  const Icon = interviewIcon(preset.slug);
  // Problem interviews (consulting case, product management): one problem
  // needs the full time, so lengths below the preset's own target are hidden
  // (resolveInterviewType also clamps server-side) and no question count shows.
  const problemSpec = getEngineType(preset.slug)?.problemInterview;
  const isProblemInterview = Boolean(problemSpec);
  const families = problemSpec?.families ?? [];
  const lengthHint = (minutes: number, questions: number) =>
    isProblemInterview ? `~${minutes} min` : `~${minutes} min · ${questions} questions`;

  const presetLength = SESSION_LENGTH_PRESETS.find(
    (p) => p.targetMinutes === preset.targetMinutes && p.targetQuestionCount === preset.targetQuestionCount,
  );
  const defaults: Values = useMemo(
    () => ({
      family: RANDOM_FAMILY,
      industry: CURATED_INDUSTRIES.find((o) => o.promptValue === preset.defaultIndustry)?.slug ?? PRESET,
      role: CURATED_ROLES.find((o) => o.promptValue === preset.defaultRoleTitle)?.slug ?? PRESET,
      difficulty: preset.difficulty,
      length: presetLength?.slug ?? PRESET,
      interviewer: DEFAULT_PERSONALITY_SLUG,
    }),
    [preset, presetLength],
  );

  const options: Record<Field, ChoiceTile[]> = useMemo(() => {
    const withPreset = (tiles: ChoiceTile[], isCurated: boolean, hint: string) =>
      isCurated ? tiles : [{ value: PRESET, title: "Interview default", hint }, ...tiles];
    return {
      family: families.length
        ? [
            { value: RANDOM_FAMILY, title: "Surprise me", hint: "A random question type." },
            ...families.map((f) => ({ value: f.key, title: f.label, hint: f.hint })),
          ]
        : [],
      industry: withPreset(
        CURATED_INDUSTRIES.map((o) => ({ value: o.slug, title: o.label })),
        defaults.industry !== PRESET,
        preset.defaultIndustry,
      ),
      role: withPreset(
        CURATED_ROLES.map((o) => ({ value: o.slug, title: o.label })),
        defaults.role !== PRESET,
        stripArticle(preset.defaultRoleTitle),
      ),
      difficulty: INTERVIEW_DIFFICULTIES.map((d) => ({ value: d, title: d, hint: DIFFICULTY_HINTS[d] })),
      length: withPreset(
        SESSION_LENGTH_PRESETS.filter(
          (p) => !isProblemInterview || p.targetMinutes >= preset.targetMinutes,
        ).map((p) => ({
          value: p.slug,
          title: p.label.replace(/\s*\(.*\)$/, ""),
          hint: lengthHint(p.targetMinutes, p.targetQuestionCount),
        })),
        defaults.length !== PRESET,
        lengthHint(preset.targetMinutes, preset.targetQuestionCount),
      ),
      interviewer: PERSONALITY_DIALS.map((p) => ({ value: p.slug, title: p.label, hint: PERSONALITY_HINTS[p.slug] })),
    };
  }, [defaults, preset, families]);

  const [values, setValues] = useState<Values>(defaults);
  const [profileText, setProfileText] = useState("");
  const [distilledPersona, setDistilledPersona] = useState<string | undefined>();
  const [personaDisplayName, setPersonaDisplayName] = useState<string | undefined>();
  const [distilling, setDistilling] = useState(false);

  // Restore choices from the query string (Back from the wizard, or a shared link).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const restored = { ...defaults };
    (Object.keys(restored) as Field[]).forEach((field) => {
      const raw = params.get(field);
      if (raw !== null && options[field].some((o) => o.value === raw)) restored[field] = raw;
    });
    setValues(restored);
    // Only on mount for this preset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset.slug]);

  const setField = (field: Field, value: string) => {
    setValues((current) => {
      const next = { ...current, [field]: value };
      const params = new URLSearchParams();
      (Object.keys(next) as Field[]).forEach((key) => {
        if (next[key] !== defaults[key]) params.set(key, next[key]);
      });
      const query = params.toString();
      window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
      return next;
    });
  };

  const changed =
    (Object.keys(values) as Field[]).some((field) => values[field] !== defaults[field]) || Boolean(distilledPersona);

  const reset = () => {
    setValues(defaults);
    setDistilledPersona(undefined);
    setPersonaDisplayName(undefined);
    setProfileText("");
    window.history.replaceState(null, "", window.location.pathname);
  };

  const chosenLength = SESSION_LENGTH_PRESETS.find((p) => p.slug === values.length);
  const minutes = chosenLength?.targetMinutes ?? preset.targetMinutes;

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

  const continueToSetup = () => {
    const key = `interview:customization:${preset.slug}`;
    try {
      if (changed) {
        const input: InterviewCustomizationInput = {
          industrySlug: values.industry || undefined,
          roleSlug: values.role || undefined,
          difficulty: values.difficulty || undefined,
          lengthSlug: values.length || undefined,
          personalitySlug: values.interviewer || undefined,
          distilledPersona: distilledPersona || undefined,
          personaDisplayName: personaDisplayName || undefined,
          ...(values.family !== RANDOM_FAMILY ? { problemFamily: values.family } : {}),
        };
        sessionStorage.setItem(key, JSON.stringify(input));
      } else {
        sessionStorage.removeItem(key);
      }
    } catch {
      // Storage unavailable: the wizard falls back to preset defaults.
    }
    router.push(routes.interview(preset.slug));
  };

  const fromGeneral = preset.slug === DEFAULT_INTERVIEW_TYPE.slug || !isListedInterviewType(preset);

  return (
    <div className="flex flex-col gap-6 pb-4">
      <PracticeHero
        backHref={fromGeneral ? routes.interviews() : routes.industryInterviews()}
        backLabel={fromGeneral ? "Interview practice" : "Industry-specific interviews"}
        description={interviewTagline(preset)}
        facts={[
          { icon: Clock3, label: `~${minutes} min` },
          { icon: Gauge, label: values.difficulty || preset.difficulty },
          { icon: UserRound, label: "Live avatar" },
        ]}
        icon={Icon}
        title={preset.label}
      />

      <details className="group rounded-lg border border-line bg-white">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-5 py-3 text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-true-blue [&::-webkit-details-marker]:hidden">
          What this interview covers
          <ChevronDown
            aria-hidden
            className="text-link transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
            size={16}
          />
        </summary>
        <div className="flex flex-col gap-3 px-5 pb-5 text-sm">
          <p className="max-w-[65ch] leading-6 text-ink">{preset.description}</p>
          {preset.questionAreas && (
            <ol className="flex flex-wrap gap-x-5 gap-y-2 text-ink">
              {preset.questionAreas.map((area, index) => (
                <li key={area} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="grid size-5 place-items-center rounded-full border border-line text-xs font-semibold tabular-nums text-cwru-blue"
                  >
                    {index + 1}
                  </span>
                  {area}
                </li>
              ))}
            </ol>
          )}
        </div>
      </details>

      {options.family.length > 0 && (
        <section aria-labelledby="customize-problem" className="flex flex-col gap-5 rounded-lg border border-line bg-white p-5 sm:p-6">
          <h2 className="font-display text-[22px] font-medium leading-tight text-cwru-blue" id="customize-problem">
            The problem
          </h2>
          <ChoiceTiles
            columns="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            label="Question type"
            name="family"
            options={options.family}
            value={values.family}
            onChange={(value) => setField("family", value)}
          />
        </section>
      )}

      <section aria-labelledby="customize-interviewer" className="flex flex-col gap-5 rounded-lg border border-line bg-white p-5 sm:p-6">
        <h2 className="font-display text-[22px] font-medium leading-tight text-cwru-blue" id="customize-interviewer">
          Your interviewer
        </h2>
        <ChoiceTiles
          description={distilledPersona ? "Off while a real interviewer is modeled below." : undefined}
          disabled={Boolean(distilledPersona)}
          label="Personality"
          name="interviewer"
          options={options.interviewer}
          value={values.interviewer}
          onChange={(value) => setField("interviewer", value)}
        />

        <details className="group/persona rounded-lg border border-line bg-canvas" open={Boolean(distilledPersona) || undefined}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-true-blue [&::-webkit-details-marker]:hidden">
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-ink">Model a real interviewer</span>
              <span className="text-[13px] text-muted">Optional. Paste a description of who will interview you.</span>
            </span>
            <ChevronDown
              aria-hidden
              className="shrink-0 text-link transition-transform duration-200 group-open/persona:rotate-180 motion-reduce:transition-none"
              size={16}
            />
          </summary>
          <div className="flex flex-col gap-3 px-4 pb-4">
            <p className="max-w-[65ch] text-[13px] leading-5 text-muted">
              This is a rehearsal, not a portrait of the real person: the AI will invent details it
              was not given. Paste text, not a link; nothing is fetched from a URL.
            </p>
            {distilledPersona ? (
              <div className="flex flex-col gap-2 rounded-lg border border-line bg-white p-3 text-sm">
                <p className="font-semibold text-ink">
                  {personaDisplayName ? `Playing ${personaDisplayName}` : "Distilled persona"}
                </p>
                <p className="leading-6 text-ink">{distilledPersona}</p>
                <Button
                  className="w-fit"
                  size="sm"
                  variant="light"
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
              <>
                <Textarea
                  aria-label="Description of who is interviewing you"
                  classNames={{ inputWrapper: "bg-white" }}
                  maxRows={8}
                  minRows={3}
                  placeholder="Paste or type a description of who is interviewing you…"
                  value={profileText}
                  variant="bordered"
                  onValueChange={(value) => setProfileText(value.slice(0, MAX_PROFILE_TEXT_LENGTH))}
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs tabular-nums text-muted">
                    {profileText.length}/{MAX_PROFILE_TEXT_LENGTH}
                  </span>
                  <Button
                    className="font-semibold"
                    color="primary"
                    isDisabled={!profileText.trim() || distilling}
                    size="sm"
                    startContent={distilling ? <Spinner color="current" size="sm" /> : <Sparkles aria-hidden size={14} />}
                    variant="bordered"
                    onPress={buildPersona}
                  >
                    {distilling ? "Building…" : "Build persona"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </details>
      </section>

      <section aria-labelledby="customize-role" className="flex flex-col gap-6 rounded-lg border border-line bg-white p-5 sm:p-6">
        <h2 className="font-display text-[22px] font-medium leading-tight text-cwru-blue" id="customize-role">
          The job
        </h2>
        <ChoiceTiles
          label="Role"
          layout="wrap"
          name="role"
          options={options.role}
          value={values.role}
          onChange={(value) => setField("role", value)}
        />
        <ChoiceTiles
          label="Industry"
          layout="wrap"
          name="industry"
          options={options.industry}
          value={values.industry}
          onChange={(value) => setField("industry", value)}
        />
      </section>

      <section aria-labelledby="customize-pace" className="flex flex-col gap-6 rounded-lg border border-line bg-white p-5 sm:p-6">
        <h2 className="font-display text-[22px] font-medium leading-tight text-cwru-blue" id="customize-pace">
          Pace
        </h2>
        <ChoiceTiles
          description="Changes how hard the interviewer follows up, not the number of questions."
          label="Difficulty"
          name="difficulty"
          options={options.difficulty}
          value={values.difficulty}
          onChange={(value) => setField("difficulty", value)}
        />
        <ChoiceTiles
          columns={options.length.length > 3 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-3"}
          label="Session length"
          name="length"
          options={options.length}
          value={values.length}
          onChange={(value) => setField("length", value)}
        />
      </section>

      <div className="sticky bottom-0 z-20 -mx-4 flex items-center justify-between gap-3 border-t border-line bg-white px-4 py-3 sm:mx-0 sm:rounded-lg sm:border sm:px-5">
        <p className="hidden min-w-0 flex-1 text-[13px] leading-5 text-muted sm:block">
          Next: pick your interviewer and, if you like, add a resume and job posting.
        </p>
        <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
          {changed && (
            <Button
              className="h-11 font-semibold text-link"
              startContent={<RotateCcw aria-hidden size={15} />}
              variant="light"
              onPress={reset}
            >
              Reset
            </Button>
          )}
          <Button
            className="h-11 flex-1 rounded-lg bg-cwru-blue px-5 font-semibold text-white sm:flex-none"
            endContent={<ArrowRight aria-hidden size={16} strokeWidth={2.5} />}
            onPress={continueToSetup}
          >
            Continue to setup
          </Button>
        </div>
      </div>
    </div>
  );
}
