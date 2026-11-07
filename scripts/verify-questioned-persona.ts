/**
 * Proves the questioned-persona CONTENT and CONTRACT, deterministically —
 * no OpenAI calls, no network, no database.
 *
 * What silently rots, and is therefore asserted here:
 *   1. registration and routing for both types;
 *   2. every seeded case has a complete persona card;
 *   3. every hidden fact is reachable — named in the live prompt with its
 *      reveal condition, in the judge's schema, and disclosable with a
 *      keyword a probe can match;
 *   4. the code / step key sets agree across frameworks.ts, coding.ts,
 *      analysis.ts, report.ts and the report panels;
 *   5. the mastery catalog covers every rubric dimension these types declare;
 *   6. no hidden-fact text reaches the briefing or the report snapshot;
 *   7. the cast never cross-pairs an avatar with another avatar's voice;
 *   8. the counts on the report are arithmetic over the stored tags, and the
 *      analysis module never asks a model for a total.
 *
 * Run: npx tsx scripts/verify-questioned-persona.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { SEATED_PUBLIC_AVATAR_ID_SET } from "../lib/avatar-roster";
import {
  resolveSeededCounterpart,
  type SeededAvatarPair,
} from "../lib/difficult-conversation/avatar-assignment";
import { SEEDED_COUNTERPART_CAST } from "../lib/difficult-conversation/seeded";
import { ENGINE_TYPES, getEngineType } from "../lib/engine/registry";
import { resolveSessionConfig } from "../lib/engine/resolve";
import { buildRubricJsonSchema } from "../lib/engine/rubric";
import type {
  DifficultConversationInstance,
  InteractionTypeConfig,
} from "../lib/engine/types";
import type { InterviewerOption } from "../lib/interview/avatar-catalog";
import { INTERACTION_TYPES } from "../lib/interactions";
import { competencyForDimension } from "../lib/mastery/competencies";
import {
  CALGARY_CAMBRIDGE_FRAMEWORK,
  MI_PROCESS_FRAMEWORK,
  frameworkForStyle,
} from "../lib/questioned-persona/frameworks";
import {
  CODE_DEFINITIONS,
  codesForStyle,
  countCodes,
  deriveMetrics,
  locateQuote,
  studentUtterances,
} from "../lib/questioned-persona/coding";
import {
  buildJudgeSystemPrompt,
  buildTaggerSystemPrompt,
  evaluatorNoteFor,
  labelledTranscript,
} from "../lib/questioned-persona/analysis";
import {
  PERSONA_CASES,
  PERSONA_CAST,
  findPersonaCase,
  listPersonaCases,
} from "../lib/questioned-persona/cases";
import { disclaimerFor, PERSONA_STYLE_COPY } from "../lib/questioned-persona/copy";
import {
  buildPersonaEvaluationContext,
  buildPersonaReminder,
  buildPersonaSystemPrompt,
} from "../lib/questioned-persona/prompts";
import {
  CODE_LABELS,
  asPersonaAnalysis,
  frameworkFor,
  mitiSummaryGlobals,
  stepTally,
} from "../lib/questioned-persona/report";
import {
  CLINICAL_CODES,
  MI_CODES,
  PERSONA_STYLES,
  isPersonaStyle,
  type PersonaAnalysis,
  type PersonaCase,
  type PersonaStyle,
  type TaggedUtterance,
} from "../lib/questioned-persona/types";
import { asInputSnapshot } from "../lib/report/snapshot";
import { routes } from "../lib/routes";
import { GOLDEN, goldenTurns } from "./fixtures/persona-golden";

const ROOT = resolve(__dirname, "..");
const read = (relPath: string) => readFileSync(join(ROOT, ...relPath.split("/")), "utf8");

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

/** Lowercased, punctuation-flattened text for substring and n-gram work. */
function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9$]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ngrams(text: string, n: number): string[] {
  const words = norm(text).split(" ").filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i + n <= words.length; i += 1) out.push(words.slice(i, i + n).join(" "));
  return out;
}

function instanceFor(c: PersonaCase): DifficultConversationInstance {
  return {
    kind: "difficult-conversation",
    conversationId: c.id,
    source: "seeded",
    role: c.avatarRole,
    studentRole: c.studentRole,
    situation: c.situation,
    sharedBackstory: c.sharedBackstory,
    hiddenPosition: c.hiddenPosition,
    studentObjective: c.studentObjective,
    stakes: c.stakes,
    difficulty: c.difficulty,
    avatarId: PERSONA_CAST[c.id]!.avatarId,
    voiceId: PERSONA_CAST[c.id]!.voiceId,
    personaCard: c.personaCard,
  };
}

function configFor(c: PersonaCase) {
  const resolved = resolveSessionConfig(c.personaCard.style, { instance: instanceFor(c) });
  if (!resolved.ok) throw new Error(`resolveSessionConfig(${c.id}): ${resolved.reason}`);
  return resolved.config;
}

const CLINICAL_DIMENSIONS = [
  "opening_agenda",
  "information_gathering",
  "empathy",
  "explanation_planning",
];
const MI_DIMENSIONS = [
  "cultivating_change_talk",
  "softening_sustain_talk",
  "partnership",
  "empathy",
];

// ---------------------------------------------------------------------------
console.log("\n1. Both types are registered, resolvable and routable");
{
  for (const style of PERSONA_STYLES) {
    const type = getEngineType(style);
    check(`getEngineType("${style}") resolves`, !!type);
    check(
      `ENGINE_TYPES includes "${style}"`,
      ENGINE_TYPES.some((t) => t.slug === style),
    );
    if (!type) continue;

    check(`"${style}" requires an instance`, type.instance.required === true);
    check(
      `"${style}" declares a supplementaryAnalysis writing outcome.personaAnalysis`,
      type.supplementaryAnalysis?.outcomeKey === "personaAnalysis",
      `outcomeKey=${type.supplementaryAnalysis?.outcomeKey}`,
    );
    check(
      `"${style}" declares no model-produced outcome fields`,
      (type.outcome?.fields ?? []).length === 0,
      `fields=${JSON.stringify((type.outcome?.fields ?? []).map((f) => f.key))}`,
    );
    check(
      `"${style}" never ends the session itself (the student does)`,
      type.terminationPolicy.avatarMayEnd === false &&
        type.terminationPolicy.studentMayEnd === true,
    );
    check(
      `"${style}" declares exactly one setup step, the briefing`,
      type.setupSteps.length === 1 && type.setupSteps[0]!.id === "persona-briefing",
      JSON.stringify(type.setupSteps.map((s) => s.id)),
    );

    const expected =
      style === "clinical-communication"
        ? ["visual", "vocal", "content", "behavioral", ...CLINICAL_DIMENSIONS]
        : ["visual", "vocal", "content", "behavioral", ...MI_DIMENSIONS];
    const config = configFor(listPersonaCases(style)[0]!);
    const keys = config.rubricDimensions.map((d) => d.key);
    check(
      `"${style}" rubric is the shared four plus its four extras`,
      JSON.stringify(keys) === JSON.stringify(expected),
      `actual=${JSON.stringify(keys)}`,
    );

    const schema = buildRubricJsonSchema(config);
    const required = schema.schema.required;
    check(
      `"${style}" schema requires every dimension score`,
      expected.every((k) => required.includes(`${k}_score`)),
      `required=${JSON.stringify(required)}`,
    );
    check(
      `"${style}" schema has no outcome property (the analysis is engine-owned)`,
      !("outcome" in (schema.schema.properties as Record<string, unknown>)),
    );

    // Routing: list page and instance page, both through lib/routes.ts.
    check(
      `routes.practiceType("${style}") is /practice/${style}`,
      routes.practiceType(style) === `/practice/${style}`,
      routes.practiceType(style),
    );
    check(
      `routes.practiceType("${style}", id) is /practice/${style}/<id>`,
      routes.practiceType(style, "cc-x") === `/practice/${style}/cc-x`,
      routes.practiceType(style, "cc-x"),
    );
    for (const file of [
      `app/practice/${style}/page.tsx`,
      `app/practice/${style}/[id]/page.tsx`,
    ]) {
      check(`route file exists: ${file}`, existsSync(join(ROOT, ...file.split("/"))));
    }
    const tile = INTERACTION_TYPES.find((t) => t.slug === style);
    check(`lib/interactions lists "${style}" as a live tile`, tile?.availability === "live");
    check(
      `the "${style}" tile links to its own list page`,
      tile?.route === `/practice/${style}`,
      tile?.route ?? undefined,
    );
  }

  check(
    "isPersonaStyle accepts both slugs and rejects difficult-conversation",
    PERSONA_STYLES.every((s) => isPersonaStyle(s)) && !isPersonaStyle("difficult-conversation"),
  );
}

// ---------------------------------------------------------------------------
console.log("\n2. Every seeded case has a COMPLETE persona card");
{
  check(`at least one case per style`, PERSONA_STYLES.every((s) => listPersonaCases(s).length > 0));
  check(
    `case ids are unique (${PERSONA_CASES.length} cases)`,
    new Set(PERSONA_CASES.map((c) => c.id)).size === PERSONA_CASES.length,
  );

  for (const c of PERSONA_CASES) {
    const card = c.personaCard;
    const label = `${c.id}`;
    check(`${label}: findPersonaCase round-trips`, findPersonaCase(c.id)?.id === c.id);
    check(`${label}: seeded record has no owner and is published`, c.ownerId === null && c.published);

    // Briefing-shaped fields the DC engine renders.
    for (const [key, min] of [
      ["title", 8],
      ["avatarRole", 4],
      ["studentRole", 4],
      ["situation", 80],
      ["sharedBackstory", 40],
      ["studentObjective", 40],
      ["stakes", 30],
    ] as const) {
      const value = (c as unknown as Record<string, string>)[key] ?? "";
      check(`${label}: ${key} is present (>= ${min} chars)`, value.trim().length >= min, `len=${value.trim().length}`);
    }

    // Card-shaped fields.
    for (const [key, min] of [
      ["personaName", 3],
      ["profile", 30],
      ["setting", 8],
      ["openingStatement", 25],
      ["manner", 30],
      ["tagline", 20],
      ["discipline", 4],
    ] as const) {
      const value = (card as unknown as Record<string, string>)[key] ?? "";
      check(`${label}: card.${key} is present (>= ${min} chars)`, value.trim().length >= min, `len=${value.trim().length}`);
    }

    check(`${label}: card.style matches the case family`, isPersonaStyle(card.style));
    check(`${label}: at least 3 spontaneous facts`, card.spontaneousFacts.length >= 3, String(card.spontaneousFacts.length));
    check(`${label}: at least 3 hidden facts`, card.hiddenFacts.length >= 3, String(card.hiddenFacts.length));
    check(`${label}: at least 1 emotional cue`, card.cues.length >= 1, String(card.cues.length));
    check(
      `${label}: hidden-fact ids are unique`,
      new Set(card.hiddenFacts.map((f) => f.id)).size === card.hiddenFacts.length,
    );
    check(
      `${label}: cue ids are unique`,
      new Set(card.cues.map((x) => x.id)).size === card.cues.length,
    );

    for (const f of card.hiddenFacts) {
      const l = `${label}/${f.id}`;
      check(`${l}: id is a snake_case token`, /^[a-z][a-z0-9_]*$/.test(f.id), f.id);
      check(`${l}: label is present`, f.label.trim().length >= 8, f.label);
      check(`${l}: fact is a sentence or two`, f.fact.trim().length >= 30, `len=${f.fact.trim().length}`);
      check(
        `${l}: revealWhen names the question that earns it`,
        /\bonly when\b/i.test(f.revealWhen) && f.revealWhen.trim().length >= 40,
        f.revealWhen,
      );
      check(`${l}: has at least one reveal keyword`, f.revealKeywords.length >= 1);
      check(
        `${l}: reveal keywords are lowercase`,
        f.revealKeywords.every((k) => k === k.toLowerCase() && k.trim().length > 0),
        JSON.stringify(f.revealKeywords),
      );
    }

    for (const cue of card.cues) {
      const l = `${label}/cue:${cue.id}`;
      check(`${l}: has a spoken line`, cue.line.trim().length >= 15, cue.line);
      check(`${l}: says what exploring it opens up`, cue.ifExplored.trim().length >= 25, cue.ifExplored);
    }

    if (card.style === "clinical-communication") {
      check(`${label}: clinical card declares ICE`, !!card.ice);
      check(
        `${label}: each ICE field is filled`,
        !!card.ice &&
          [card.ice.ideas, card.ice.concerns, card.ice.expectations].every((v) => v.trim().length >= 20),
      );
      check(
        `${label}: clinical card declares explanationPoints`,
        (card.explanationPoints ?? "").trim().length >= 60,
      );
      check(`${label}: clinical card declares no MI-only fields`, !card.targetBehavior && !card.changeTalk);
    } else {
      check(`${label}: MI card declares a target behavior`, (card.targetBehavior ?? "").trim().length >= 15);
      check(`${label}: at least 3 change-talk lines`, (card.changeTalk ?? []).length >= 3);
      check(`${label}: at least 3 sustain-talk lines`, (card.sustainTalk ?? []).length >= 3);
      check(
        `${label}: declares a reactance rule for the righting reflex`,
        (card.reactanceRule ?? "").trim().length >= 80,
      );
      check(`${label}: MI card declares no clinical-only fields`, !card.ice && !card.explanationPoints);
    }
  }
}

// ---------------------------------------------------------------------------
console.log("\n3. Every hidden fact is REACHABLE by a documented question");
{
  for (const c of PERSONA_CASES) {
    const card = c.personaCard;
    const config = configFor(c);
    const live = buildPersonaSystemPrompt(config);
    const judge = buildJudgeSystemPrompt(card.style);
    const evalContext = buildPersonaEvaluationContext(config);

    for (const f of card.hiddenFacts) {
      const l = `${c.id}/${f.id}`;
      // The live model must be told the fact AND the condition that earns it,
      // or no question can reach it.
      check(`${l}: the fact text is in the live prompt`, live.includes(f.fact), f.fact.slice(0, 50));
      check(
        `${l}: the reveal condition is in the live prompt`,
        live.includes(f.revealWhen),
        f.revealWhen.slice(0, 50),
      );
      // The judge decides whether the student elicited it. Its schema enum is
      // built from the card, so there is a verdict slot for every id, and its
      // case-card block carries the fact with the condition that earns it.
      check(
        `${l}: the judge prompt tells the rater elicitation needs disclosure`,
        /elicited = true only if the persona actually disclosed/.test(judge),
      );
      // The evaluator brief names the fact label (never the fact body).
      check(`${l}: the evaluator brief names the label`, evalContext.evaluatorBrief.includes(f.label));
      check(
        `${l}: the evaluator brief does NOT carry the fact body`,
        !evalContext.evaluatorBrief.includes(f.fact),
      );
      // A reveal keyword must plausibly appear when the persona discloses it:
      // require at least one keyword to occur in the fact text itself, so a
      // probe looking for the keyword can tell disclosure from silence.
      const factNorm = norm(f.fact);
      check(
        `${l}: at least one reveal keyword occurs in the fact text`,
        f.revealKeywords.some((k) => factNorm.includes(norm(k))),
        `keywords=${JSON.stringify(f.revealKeywords)} fact="${f.fact}"`,
      );
    }

    // A cue the persona was told to drop must be in the live prompt, and the
    // judge must be able to rate it.
    for (const cue of card.cues) {
      check(`${c.id}/cue:${cue.id}: the line is in the live prompt`, live.includes(cue.line), cue.line);
      check(
        `${c.id}/cue:${cue.id}: what exploring it opens up is in the live prompt`,
        live.includes(cue.ifExplored),
      );
      check(
        `${c.id}/cue:${cue.id}: the evaluator brief names the cue label`,
        evalContext.evaluatorBrief.includes(cue.label),
      );
    }

    // The live prompt must hold the line, or a hidden fact is not hidden.
    check(`${c.id}: live prompt forbids volunteering a hidden fact`, /do NOT volunteer/.test(live));
    check(
      `${c.id}: live prompt forbids listing several hidden facts at once`,
      /Never list several hidden facts at once/.test(live),
    );
    check(`${c.id}: live prompt forbids coaching`, /never coach|Never tell .* what they should ask/i.test(live));
    check(
      `${c.id}: live prompt forbids clinical or counseling advice`,
      /Never give medical|never give medical/i.test(live),
    );
    check(`${c.id}: live prompt forbids acknowledging a simulation`, /Never acknowledge a simulation/.test(live));
    check(
      `${c.id}: the per-turn reminder repeats the hidden-fact rule without naming a fact`,
      /Reveal a hidden fact ONLY/.test(buildPersonaReminder(config)) &&
        card.hiddenFacts.every((f) => !buildPersonaReminder(config).includes(f.fact)),
    );
  }
}

// ---------------------------------------------------------------------------
console.log("\n4. Step keys and behavior-code keys agree across the modules");
{
  for (const style of PERSONA_STYLES) {
    const framework = frameworkForStyle(style);
    const judge = buildJudgeSystemPrompt(style);
    const tagger = buildTaggerSystemPrompt(style);
    const codes = codesForStyle(style);

    check(
      `${style}: frameworkForStyle returns the declared framework`,
      framework ===
        (style === "clinical-communication" ? CALGARY_CAMBRIDGE_FRAMEWORK : MI_PROCESS_FRAMEWORK),
    );
    check(
      `${style}: framework step keys are unique`,
      new Set(framework.steps.map((s) => s.key)).size === framework.steps.length,
    );
    check(`${style}: framework cites its source`, framework.source.trim().length >= 80);

    for (const step of framework.steps) {
      const l = `${style}/${step.key}`;
      check(`${l}: key is snake_case`, /^[a-z][a-z0-9_]*$/.test(step.key), step.key);
      check(`${l}: has a label and description`, step.label.trim().length >= 8 && step.description.trim().length >= 30);
      check(`${l}: has evidence criteria the judge can apply`, step.evidenceCriteria.trim().length >= 60);
      check(`${l}: has a nudge line the persona may say`, step.nudge.trim().length >= 10, step.nudge);
      check(
        `${l}: the nudge does not name the step (the avatar is the patient, not a coach)`,
        !norm(step.nudge).includes(norm(step.label)),
        step.nudge,
      );
      // The judge prompt is what the model reads: the step must be in it.
      check(`${l}: the judge prompt lists this step`, judge.includes(`- ${step.key} — ${step.label}`));
      check(`${l}: the judge prompt carries its evidence criteria`, judge.includes(step.evidenceCriteria));
    }

    // Report panels render every step from the framework, keyed by step.key —
    // so the panel's status map must cover every status the judge may return.
    const panels = read("components/practice/report/PersonaReportPanels.tsx");
    for (const status of ["hit", "missed", "not_applicable"]) {
      check(`${style}: the report panel renders status "${status}"`, new RegExp(`\\b${status}:`).test(panels));
    }

    // Codes: coding.ts defines every code the tagger may emit, the tagger
    // prompt documents every one, and report.ts labels every one.
    check(
      `${style}: codesForStyle matches the declared tuple`,
      JSON.stringify(codes) ===
        JSON.stringify(style === "clinical-communication" ? CLINICAL_CODES : MI_CODES),
    );
    const defs = CODE_DEFINITIONS[style];
    check(
      `${style}: CODE_DEFINITIONS covers exactly the style's codes`,
      JSON.stringify(Object.keys(defs).sort()) === JSON.stringify([...codes].sort()),
      `defs=${JSON.stringify(Object.keys(defs).sort())} codes=${JSON.stringify([...codes].sort())}`,
    );
    for (const code of codes) {
      check(`${style}/${code}: the tagger prompt documents it`, tagger.includes(`- ${code}: `));
      check(`${style}/${code}: the report has a human label`, typeof CODE_LABELS[code] === "string");
      check(`${style}/${code}: the definition is specific enough to code against`, defs[code]!.length >= 60);
    }

    // Derived metrics must only read keys countCodes produces.
    const zeroCounts = countCodes(style, []);
    check(
      `${style}: countCodes zero-fills every code plus student_utterances`,
      [...codes, "student_utterances"].every((k) => k in zeroCounts) &&
        Object.keys(zeroCounts).length === codes.length + 1,
      JSON.stringify(Object.keys(zeroCounts)),
    );
    const metrics = deriveMetrics(style, zeroCounts);
    check(`${style}: deriveMetrics returns at least two metrics`, metrics.length >= 2);
    check(
      `${style}: metric keys are unique`,
      new Set(metrics.map((m) => m.key)).size === metrics.length,
    );
    for (const m of metrics) {
      check(`${style}/${m.key}: has a label and a plain-language note`, m.label.length >= 5 && m.note.length >= 40);
      check(
        `${style}/${m.key}: format is one the report can render`,
        ["ratio", "percent", "count"].includes(m.format),
        m.format,
      );
      if (m.threshold) {
        check(
          `${style}/${m.key}: the threshold cites a source`,
          m.threshold.source.trim().length >= 60,
        );
        check(
          `${style}/${m.key}: fair <= good`,
          m.threshold.fair <= m.threshold.good,
          `${m.threshold.fair} / ${m.threshold.good}`,
        );
      }
    }
  }

  // The MI summary globals read only MI rubric dimension keys.
  const globals = mitiSummaryGlobals({
    partnership: 4,
    empathy: 5,
    cultivating_change_talk: 3,
    softening_sustain_talk: 4,
  });
  check(
    "mitiSummaryGlobals averages the four MITI dimensions",
    globals.length === 2 &&
      globals[0]!.value === 4.5 &&
      globals[1]!.value === 3.5,
    JSON.stringify(globals.map((g) => [g.key, g.value])),
  );
  check(
    "mitiSummaryGlobals returns null rather than guessing a missing score",
    mitiSummaryGlobals({ partnership: 4 })[0]!.value === null,
  );
  check(
    "every key mitiSummaryGlobals reads is a declared MI rubric dimension",
    ["partnership", "empathy", "cultivating_change_talk", "softening_sustain_talk"].every((k) =>
      MI_DIMENSIONS.includes(k),
    ),
  );
}

// ---------------------------------------------------------------------------
console.log("\n5. The mastery catalog covers every dimension these types declare");
{
  for (const style of PERSONA_STYLES) {
    const config = configFor(listPersonaCases(style)[0]!);
    for (const dim of config.rubricDimensions) {
      const competency = competencyForDimension(dim.key);
      check(
        `${style}/${dim.key} maps to a competency`,
        competency !== null,
        `unmapped — add it to lib/mastery/competencies.ts`,
      );
    }
  }
  // The extras specifically — the shared four were always mapped.
  for (const key of [...CLINICAL_DIMENSIONS, ...MI_DIMENSIONS]) {
    check(`extra dimension "${key}" maps to a competency`, competencyForDimension(key) !== null);
  }
}

// ---------------------------------------------------------------------------
console.log("\n6. No hidden-fact text reaches the briefing or the report snapshot");
{
  // The snapshot the session writes, reconstructed field for field from
  // lib/engine/session.ts's difficultConversationSnapshotFromInstance.
  const sessionSrc = read("lib/engine/session.ts");
  const builder = sessionSrc.slice(
    sessionSrc.indexOf("function difficultConversationSnapshotFromInstance"),
  );
  const builderBody = builder.slice(0, builder.indexOf("\n}\n"));
  check(
    "the snapshot builder adds personaStyle and personaName only",
    /personaStyle: instance\.personaCard\.style/.test(builderBody) &&
      /personaName: instance\.personaCard\.personaName/.test(builderBody) &&
      !/personaCard:/.test(builderBody) &&
      !/hiddenFacts/.test(builderBody) &&
      !/hiddenPosition/.test(builderBody),
    builderBody.slice(0, 400),
  );

  const snapshotSrc = read("lib/report/snapshot.ts");
  const dcInterface = snapshotSrc.slice(
    snapshotSrc.indexOf("export interface DifficultConversationInputSnapshot"),
  );
  const dcBody = dcInterface.slice(0, dcInterface.indexOf("\n}\n"));
  check(
    "DifficultConversationInputSnapshot declares no personaCard and no hiddenPosition",
    !/personaCard\??:/.test(dcBody) && !/^\s*hiddenPosition\??:/m.test(dcBody),
  );

  // The briefing props type has no slot for hidden content at all.
  const briefingSrc = read("components/practice/steps/ConversationBriefingStep.tsx");
  const fieldsInterface = briefingSrc.slice(
    briefingSrc.indexOf("export interface ConversationBriefingFields"),
  );
  const fieldsBody = fieldsInterface.slice(0, fieldsInterface.indexOf("\n}\n"));
  check(
    "ConversationBriefingFields has no key for hidden content",
    !/hidden|persona|fact|cue|ice\b/i.test(fieldsBody),
    fieldsBody,
  );
  check(
    "the briefing step imports no questioned-persona card module",
    !/questioned-persona\/(cases|types|analysis|coding)/.test(briefingSrc),
  );

  // The case-list page is server-rendered: assert it projects only
  // briefing-safe fields, so no card reaches the browser from discovery.
  const listSrc = read("components/questioned-persona/PersonaCaseList.tsx");
  const projection = listSrc.slice(listSrc.indexOf("listPersonaCases(style).map"));
  const projectionBody = projection.slice(0, projection.indexOf("}));"));
  check(
    "the case list projects only id, title, tagline, discipline, setting and studentRole",
    !/hiddenFacts|cues|ice|changeTalk|sustainTalk|openingStatement|spontaneousFacts|manner|profile/.test(
      projectionBody,
    ),
    projectionBody,
  );

  // And the real content check: no hidden fact, cue payoff, ICE line or
  // sustain-talk line may have been pasted into a student-visible field.
  // A shared word is fine; a shared six-word run is a copy-paste.
  for (const c of PERSONA_CASES) {
    const card = c.personaCard;
    const instance = instanceFor(c);
    const briefingText = norm(
      [
        c.title,
        instance.role,
        instance.studentRole,
        instance.situation,
        instance.sharedBackstory,
        instance.studentObjective,
        instance.stakes,
        card.tagline,
        card.setting,
        card.discipline,
      ].join(" \u0000 "),
    );
    const secrets: Array<[string, string]> = [
      ...card.hiddenFacts.map((f) => [`fact:${f.id}`, f.fact] as [string, string]),
      ...card.cues.map((x) => [`cue:${x.id}`, x.ifExplored] as [string, string]),
      ...(card.ice
        ? ([
            ["ice:ideas", card.ice.ideas],
            ["ice:concerns", card.ice.concerns],
            ["ice:expectations", card.ice.expectations],
          ] as Array<[string, string]>)
        : []),
      ...(card.sustainTalk ?? []).map((t, i) => [`sustain:${i}`, t] as [string, string]),
      ...(card.changeTalk ?? []).map((t, i) => [`change:${i}`, t] as [string, string]),
    ];
    for (const [which, secret] of secrets) {
      const leaked = ngrams(secret, 6).filter((g) => briefingText.includes(g));
      check(
        `${c.id}/${which}: no six-word run of it appears in the student-visible briefing`,
        leaked.length === 0,
        leaked.slice(0, 2).join(" | "),
      );
    }

    // The snapshot the report is built from carries only the style and name.
    const snapshot = {
      kind: "difficult-conversation" as const,
      conversationId: c.id,
      conversationTitle: c.title,
      source: "seeded" as const,
      role: instance.role,
      studentRole: instance.studentRole,
      situation: instance.situation,
      sharedBackstory: instance.sharedBackstory,
      studentObjective: instance.studentObjective,
      stakes: instance.stakes,
      difficulty: instance.difficulty,
      avatarId: instance.avatarId,
      personaStyle: card.style,
      personaName: card.personaName,
    };
    const parsed = asInputSnapshot(snapshot);
    check(`${c.id}: the persona snapshot narrows as difficult-conversation`, parsed?.kind === "difficult-conversation");
    check(
      `${c.id}: the parsed snapshot keeps personaStyle for the report banner`,
      parsed?.kind === "difficult-conversation" && parsed.personaStyle === card.style,
    );
    const snapshotText = norm(JSON.stringify(snapshot));
    for (const [which, secret] of secrets) {
      const leaked = ngrams(secret, 6).filter((g) => snapshotText.includes(g));
      check(
        `${c.id}/${which}: no six-word run of it appears in the report snapshot`,
        leaked.length === 0,
        leaked.slice(0, 2).join(" | "),
      );
    }
  }

  // The disclaimer the student sees before and after is declared once per style.
  for (const style of PERSONA_STYLES) {
    const copy = PERSONA_STYLE_COPY[style];
    check(`${style}: declares a disclaimer`, disclaimerFor(style).trim().length >= 80);
    check(
      `${style}: the disclaimer says this is practice only`,
      /practice only/i.test(disclaimerFor(style)),
      disclaimerFor(style),
    );
    for (const [key, min] of [
      ["label", 10],
      ["listTitle", 10],
      ["listIntro", 50],
      ["heroDescription", 60],
      ["reportLabel", 10],
      ["briefingIntro", 50],
      ["briefingFootnote", 50],
      ["checkInLead", 10],
    ] as const) {
      check(`${style}: copy.${key} is present`, (copy[key] ?? "").trim().length >= min);
    }
    check(
      `${style}: the briefing intro warns the persona holds things back`,
      /depends on how you ask|there to be found/i.test(copy.briefingIntro),
      copy.briefingIntro,
    );
  }
  check(
    "the MI disclaimer carries a crisis line",
    /988|Counseling Services/.test(disclaimerFor("motivational-interviewing")),
  );
}

// ---------------------------------------------------------------------------
console.log("\n7. The persona cast never cross-pairs an avatar with another's voice");
{
  const castIds = Object.keys(PERSONA_CAST);
  check(
    `every case has a cast entry (${castIds.length} entries, ${PERSONA_CASES.length} cases)`,
    PERSONA_CASES.every((c) => !!PERSONA_CAST[c.id]),
    `missing=${PERSONA_CASES.filter((c) => !PERSONA_CAST[c.id]).map((c) => c.id).join(", ")}`,
  );
  check(
    "the cast has no entry for a case that does not exist",
    castIds.every((id) => !!findPersonaCase(id)),
    castIds.filter((id) => !findPersonaCase(id)).join(", "),
  );

  for (const [id, cast] of Object.entries(PERSONA_CAST)) {
    check(
      `${id}: cast from the seated PUBLIC roster, never a faculty likeness`,
      SEATED_PUBLIC_AVATAR_ID_SET.has(cast.avatarId),
      cast.avatarId,
    );
    check(`${id}: declares a voice`, cast.voiceId.trim().length > 0);
    check(
      `${id}: declares a presentation that matches the pronouns the case uses`,
      cast.presentation === "male" || cast.presentation === "female",
      cast.presentation,
    );
  }
  check(
    "no two persona cases share a face",
    new Set(Object.values(PERSONA_CAST).map((c) => c.avatarId)).size === castIds.length,
  );
  check(
    "no two persona cases share a voice",
    new Set(Object.values(PERSONA_CAST).map((c) => c.voiceId)).size === castIds.length,
  );
  check(
    "the persona cast does not reuse a courageous-conversation counterpart",
    Object.values(PERSONA_CAST).every(
      (c) => !Object.values(SEEDED_COUNTERPART_CAST).some((s) => s.avatarId === c.avatarId),
    ),
  );

  // The resolve rule itself: a pair is always one avatar with its OWN voice.
  // Catalog present, cast avatar present: the live default voice wins.
  const catalog: InterviewerOption[] = Object.entries(PERSONA_CAST).map(([, cast], i) => ({
    avatarId: cast.avatarId,
    name: `Stock ${i}`,
    previewUrl: null,
    voice: { id: `live-voice-${cast.avatarId}`, name: `Voice ${i}` },
    gender: cast.presentation,
  }));
  const voiceByAvatar = new Map(catalog.map((o) => [o.avatarId, o.voice.id]));
  for (const id of castIds) {
    const pair = resolveSeededCounterpart(id, catalog, PERSONA_CAST) as SeededAvatarPair;
    check(
      `${id}: resolves to the cast avatar with that avatar's own live voice`,
      pair.avatarId === PERSONA_CAST[id]!.avatarId &&
        pair.voiceId === voiceByAvatar.get(pair.avatarId),
      JSON.stringify(pair),
    );
  }
  // Cast avatar churned out: the substitute brings its OWN voice, and the
  // substitute is still from the seated public roster.
  const churned = castIds[0]!;
  const withoutCast = catalog.filter((o) => o.avatarId !== PERSONA_CAST[churned]!.avatarId);
  const substituted = resolveSeededCounterpart(churned, withoutCast, PERSONA_CAST) as SeededAvatarPair;
  check(
    `${churned}: a churned cast avatar substitutes a roster face with its own voice`,
    substituted.voiceId === voiceByAvatar.get(substituted.avatarId) &&
      SEATED_PUBLIC_AVATAR_ID_SET.has(substituted.avatarId),
    JSON.stringify(substituted),
  );
  // Catalog outage: fall back to the pinned pair, which is itself not crossed.
  const offline = resolveSeededCounterpart(churned, null, PERSONA_CAST) as SeededAvatarPair;
  check(
    `${churned}: a catalog outage falls back to the case's own pinned pair`,
    offline.avatarId === PERSONA_CAST[churned]!.avatarId &&
      offline.voiceId === PERSONA_CAST[churned]!.voiceId,
    JSON.stringify(offline),
  );
  check(
    "a courageous-conversation id is not resolvable through the persona cast",
    resolveSeededCounterpart("confront-low-performer", catalog, PERSONA_CAST) === null,
  );
  // And the resolve-instance path attaches the card and a complete pair.
  const resolveSrc = read("lib/difficult-conversation/resolve-instance.ts");
  check(
    "resolve-instance passes PERSONA_CAST to assignSeededAvatar",
    /assignSeededAvatar\(trimmed, PERSONA_CAST\)/.test(resolveSrc),
  );
  check(
    "resolve-instance attaches the persona card from the case record",
    /personaCard: persona\.personaCard/.test(resolveSrc),
  );
}

// ---------------------------------------------------------------------------
console.log("\n8. Counts are arithmetic over the stored tags, never asked of the model");
{
  const analysisSrc = read("lib/questioned-persona/analysis.ts");
  const codingSrc = read("lib/questioned-persona/coding.ts");

  check(
    "coding.ts imports no model client",
    !/\bopenai\b/i.test(codingSrc),
  );
  check(
    "the tagger is instructed to return codes per index, never an aggregate",
    PERSONA_STYLES.every((s) => {
      const prompt = buildTaggerSystemPrompt(s);
      return (
        /Return one entry for EVERY \[S#\] index/.test(prompt) &&
        // No instruction to produce a total. "How many…?" legitimately appears
        // INSIDE a closed-question definition as an example, so match only
        // imperative aggregate asks.
        !/\b(return|report|compute|calculate|give|include|provide)\b[^.\n]{0,40}\b(total|totals|counts?|ratio|ratios|percentage|percent|sum)\b/i.test(
          prompt,
        )
      );
    }),
  );
  check(
    "the tagger schema asks only for per-utterance codes",
    /required: \["index", "codes"\]/.test(analysisSrc) &&
      !/counts?:\s*\{\s*type: "(object|integer)"/.test(analysisSrc),
  );
  check(
    "the judge schema asks only for steps, facts, cues and ICE",
    /const required = \["steps", "facts", "cues"\]/.test(analysisSrc),
  );
  check(
    "assembleAnalysis fills counts from countCodes and metrics from deriveMetrics",
    /const counts = countCodes\(style, tagged\)/.test(analysisSrc) &&
      /metrics: deriveMetrics\(style, counts\)/.test(analysisSrc),
  );
  check(
    "the evaluator note tells the rubric evaluator not to recount",
    /do not recount/i.test(
      evaluatorNoteFor({
        version: 1,
        style: "clinical-communication",
        frameworkKey: "calgary-cambridge",
        utterances: [],
        counts: countCodes("clinical-communication", []),
        metrics: deriveMetrics("clinical-communication", countCodes("clinical-communication", [])),
        steps: [],
        facts: [],
        cues: [],
        model: "test",
      }),
    ),
  );
  check(
    "both evaluator prompts tell the grader to cite, never recount, the counts",
    PERSONA_STYLES.every((s) => {
      const prompt = getEngineType(s)!.prompts.evaluatorPrompt;
      return /computed in code/.test(prompt) && /never recount/.test(prompt);
    }),
  );
  check(
    "the evaluator prompts forbid commenting on medical correctness",
    PERSONA_STYLES.every((s) =>
      /Do NOT comment on medical correctness/.test(getEngineType(s)!.prompts.evaluatorPrompt),
    ),
  );

  // The arithmetic itself, against the hand-coded goldens: countCodes over the
  // hand codes must reproduce the counts, and deriveMetrics must be a pure
  // function of those counts (same input, same output, twice).
  for (const g of GOLDEN) {
    const c = findPersonaCase(g.caseId);
    check(`golden ${g.id}: names a real case`, !!c, g.caseId);
    if (!c) continue;
    const style = c.personaCard.style;
    const turns = goldenTurns(g);
    const utterances = studentUtterances(turns, turns[0]!.timestamp - 30_000);
    const handCoded = g.lines.filter((l): l is { s: string; codes: never[] } => "s" in l);
    check(
      `golden ${g.id}: every student line is an utterance (${utterances.length})`,
      utterances.length === handCoded.length,
      `utterances=${utterances.length} lines=${handCoded.length}`,
    );
    const tagged: TaggedUtterance[] = handCoded.map((l, i) => ({
      index: i,
      text: l.s,
      codes: l.codes,
    }));
    for (const t of tagged) {
      const bad = t.codes.filter((code) => !(codesForStyle(style) as readonly string[]).includes(code));
      check(
        `golden ${g.id}/S${t.index}: hand codes are all valid for ${style}`,
        bad.length === 0,
        bad.join(", "),
      );
      check(
        `golden ${g.id}/S${t.index}: no code is listed twice`,
        new Set(t.codes).size === t.codes.length,
      );
    }
    const counts = countCodes(style, tagged);
    check(
      `golden ${g.id}: student_utterances equals the utterance count`,
      counts.student_utterances === tagged.length,
      `${counts.student_utterances} vs ${tagged.length}`,
    );
    const byHand = tagged.reduce(
      (n, t) => n + new Set(t.codes).size,
      0,
    );
    const summed = Object.entries(counts)
      .filter(([k]) => k !== "student_utterances")
      .reduce((n, [, v]) => n + v, 0);
    check(
      `golden ${g.id}: the counts sum to the number of hand codes (${byHand})`,
      summed === byHand,
      `summed=${summed} byHand=${byHand}`,
    );
    const a = JSON.stringify(deriveMetrics(style, counts));
    const b = JSON.stringify(deriveMetrics(style, counts));
    check(`golden ${g.id}: deriveMetrics is pure`, a === b);

    // Expectations must name real keys, or the grading study asserts nothing.
    const stepKeys = new Set(frameworkForStyle(style).steps.map((s) => s.key));
    for (const key of Object.keys(g.expectSteps)) {
      check(`golden ${g.id}: expectSteps key "${key}" is a real ${style} step`, stepKeys.has(key));
    }
    const factIds = new Set(c.personaCard.hiddenFacts.map((f) => f.id));
    for (const id of Object.keys(g.expectFacts)) {
      check(`golden ${g.id}: expectFacts id "${id}" is a real hidden fact of ${c.id}`, factIds.has(id));
    }
    for (const key of Object.keys(g.expectGlobals ?? {})) {
      check(
        `golden ${g.id}: expectGlobals key "${key}" is a real MI rubric dimension`,
        style === "motivational-interviewing" && MI_DIMENSIONS.includes(key),
      );
    }
    // Every expected-elicited fact must actually be disclosed in the
    // transcript, or the expectation is unmeetable.
    const personaText = norm(
      g.lines.filter((l): l is { p: string } => "p" in l).map((l) => l.p).join(" "),
    );
    for (const [id, elicited] of Object.entries(g.expectFacts)) {
      if (!elicited) continue;
      const fact = c.personaCard.hiddenFacts.find((f) => f.id === id)!;
      check(
        `golden ${g.id}: the persona actually discloses "${id}" (keyword present)`,
        fact.revealKeywords.some((k) => personaText.includes(norm(k))),
        `keywords=${JSON.stringify(fact.revealKeywords)}`,
      );
    }
    // The labelled transcript the model reads must index every student turn.
    const labelled = labelledTranscript(style, turns, utterances);
    for (const u of utterances) {
      check(`golden ${g.id}: transcript labels [S${u.index}]`, labelled.includes(`[S${u.index}] `));
    }
  }

  // Evidence verification: a quote the student never said is dropped, not shown.
  const sample = studentUtterances(
    [
      { role: "user", content: "I'm ready to begin the interview.", timestamp: 1_000 },
      { role: "assistant", content: "Hello.", timestamp: 2_000 },
      { role: "user", content: "What brings you in today?", timestamp: 3_000 },
    ],
    0,
  );
  check("the canned opener is never coded", sample.length === 1, JSON.stringify(sample));
  check("a verbatim quote locates its utterance", locateQuote("brings you in", sample) !== null);
  check(
    "punctuation and case differences still locate the quote",
    locateQuote("What brings you in TODAY?", sample) !== null,
  );
  check("an invented quote locates nothing", locateQuote("I think it is your heart", sample) === null);

  // Defensive narrowing: a malformed stored analysis renders as absent.
  const good: PersonaAnalysis = {
    version: 1,
    style: "motivational-interviewing",
    frameworkKey: "mi-processes",
    utterances: [],
    counts: countCodes("motivational-interviewing", []),
    metrics: deriveMetrics("motivational-interviewing", countCodes("motivational-interviewing", [])),
    steps: [],
    facts: [],
    cues: [],
    model: "test",
  };
  check("asPersonaAnalysis accepts a well-formed analysis", asPersonaAnalysis({ personaAnalysis: good }) !== null);
  check("asPersonaAnalysis rejects a null outcome", asPersonaAnalysis(null) === null);
  check("asPersonaAnalysis rejects an absent key", asPersonaAnalysis({ other: 1 }) === null);
  check(
    "asPersonaAnalysis rejects a wrong version",
    asPersonaAnalysis({ personaAnalysis: { ...good, version: 2 } }) === null,
  );
  check(
    "asPersonaAnalysis rejects an unknown style",
    asPersonaAnalysis({ personaAnalysis: { ...good, style: "nope" } }) === null,
  );
  check(
    "asPersonaAnalysis rejects missing arrays",
    asPersonaAnalysis({ personaAnalysis: { ...good, steps: "x" } }) === null,
  );
  check("frameworkFor picks the framework the analysis names", frameworkFor(good) === MI_PROCESS_FRAMEWORK);
  check(
    "stepTally excludes not_applicable steps from the denominator",
    JSON.stringify(
      stepTally([
        { key: "a", status: "hit", evidenceQuote: "", timecodeSeconds: null, note: "" },
        { key: "b", status: "missed", evidenceQuote: "", timecodeSeconds: null, note: "" },
        { key: "c", status: "not_applicable", evidenceQuote: "", timecodeSeconds: null, note: "" },
      ]),
    ) === JSON.stringify({ hit: 1, applicable: 2 }),
  );

  // The runner's contract: the pass runs before the rubric evaluator, merges
  // after validation, and a throw never fails the report.
  const runnerSrc = read("lib/engine/evaluation-runner.ts");
  const runnerBlock = runnerSrc.slice(
    runnerSrc.indexOf("if (typeRecord?.supplementaryAnalysis && transcriptTurns)"),
  );
  check(
    "the supplementary pass is wrapped in try/catch and only warns",
    /catch \(analysisError\) \{[\s\S]*?console\.warn/.test(runnerBlock.slice(0, 1600)) &&
      !/catch \(analysisError\) \{[\s\S]*?persistFailure/.test(runnerBlock.slice(0, 1600)),
  );
  check(
    "the pass runs before runEvaluation",
    runnerSrc.indexOf("typeRecord?.supplementaryAnalysis") < runnerSrc.indexOf("await runEvaluation("),
  );
  check(
    "the analysis is merged after validateOutcome, like disengagementDecline",
    runnerSrc.indexOf("const validated = validateOutcome(") <
      runnerSrc.indexOf("validatedOutcome = { ...base, [supplementary.key]"),
  );
  check(
    "the merge survives a rejected model outcome (falls back to the stored outcome)",
    /storedOutcome \?\? \{\}/.test(runnerBlock.slice(0, 2500)) ||
      /storedOutcome \?\? \{\}/.test(runnerSrc),
  );
  check(
    "the evaluator note is appended to evaluatorBrief, not substituted for it",
    /\$\{prior\}\\n\\nBehavior coding:/.test(runnerSrc),
  );
}

// ---------------------------------------------------------------------------
if (failures > 0) {
  console.error(`\nverify-questioned-persona: ${failures} FAILURE(S)\n`);
  process.exit(1);
}
console.log("\nverify-questioned-persona: ALL EIGHT SECTIONS PASSED\n");
process.exit(0);
