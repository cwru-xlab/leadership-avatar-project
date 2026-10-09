/**
 * Regression coverage for the interview progress state machine.
 *
 * Run: npx tsx scripts/verify-turn-control.ts
 *
 * The bug this exists for: a session that sat at "1 of ~9 questions" for its
 * entire duration. Progress is purely model-driven, and an uncategorised
 * behavioral marker used to discard the whole update — which, because the
 * stage also never advanced, repeated every turn for the rest of the session.
 */
import {
  parseInterviewTurn,
  reduceInterviewProgress,
} from "../lib/interview/turn-control";
import {
  initialProgress,
  INTERVIEW_TYPES,
  getInterviewType,
  type InterviewProgress,
} from "../lib/interview/types";
import {
  buildInterviewSystemPrompt,
  buildProgressBlock,
} from "../lib/interview/prompts";
import { resolveAttemptLanguage } from "../lib/languages";
import {
  assembleSystemPrompt,
  buildTailBlock,
  buildTurnMessages,
  CASE_STUDY_REPLY_STYLE_GUIDE,
} from "../lib/engine/prompts";
import { parseEngineTurn } from "../lib/engine/turn-control";
import { resolveSessionConfig } from "../lib/engine/resolve";
import { listEngineTypes } from "../lib/engine/registry";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}\n         expected ${e}\n         actual   ${a}`);
  }
}

const OPTS = { hasResume: false, targetQuestionCount: 9 };
const marker = (attrs: string) => `Tell me about a conflict.\n<interview-turn ${attrs} />`;

console.log("\n1. Marker parsing");
check("categorised planned marker parses",
  parseInterviewTurn(marker('kind="planned" category="teamwork"')).action,
  { kind: "planned", category: "teamwork" });
check("bare planned marker parses (it is legal grammar)",
  parseInterviewTurn(marker('kind="planned"')).action, { kind: "planned" });
check("NO marker is now reported as malformed",
  parseInterviewTurn("Tell me about a conflict.").malformed, true);
check("unknown category is rejected",
  parseInterviewTurn(marker('kind="planned" category="vibes"')).action, null);
check("recovery without a category is rejected",
  parseInterviewTurn(marker('kind="recovery"')).action, null);
check("every marker is stripped, not just the trailing one",
  parseInterviewTurn(
    'A <interview-turn kind="planned" /> B\n<interview-turn kind="planned" />'
  ).content, "A  B");

console.log("\n2. The deadlock — uncategorised behavioral turns");
{
  // Reproduces the reported session exactly: no resume, so opening -> behavioral
  // immediately, then a model that emits the bare planned marker every turn.
  let p: InterviewProgress = initialProgress();
  p = reduceInterviewProgress(p, { kind: "planned" }, OPTS);
  check("opening question counts and moves to behavioral",
    [p.questionsAsked, p.stage], [1, "behavioral"]);

  p = reduceInterviewProgress(p, { kind: "planned" }, OPTS);
  check("an UNCATEGORISED behavioral question still counts", p.questionsAsked, 2);
  check("but covers no category", p.categoriesCovered, []);

  // Walk the rest of the interview with the SAME uncategorised marker. The
  // behavioral quota for a 9-question target is 3, so three behavioral turns
  // release the stage even though no category was ever supplied.
  const stages: string[] = [p.stage];
  for (let i = 0; i < 4; i++) {
    p = reduceInterviewProgress(p, { kind: "planned" }, OPTS);
    stages.push(p.stage);
  }
  check("the stage machine walks to the end on bare markers alone",
    stages, ["behavioral", "behavioral", "role_specific", "closing", "closing"]);
  check("and the counter reaches the closing turn instead of pinning at 1",
    p.questionsAsked, 5);
  check("no category was ever covered along the way", p.categoriesCovered, []);
}

console.log("\n3. Categorised path still behaves");
{
  let p: InterviewProgress = initialProgress();
  p = reduceInterviewProgress(p, { kind: "planned" }, OPTS);
  p = reduceInterviewProgress(p, { kind: "planned", category: "teamwork" }, OPTS);
  check("a valid category is still recorded", p.categoriesCovered, ["teamwork"]);
  p = reduceInterviewProgress(p, { kind: "planned", category: "teamwork" }, OPTS);
  check("and is not double-counted", p.categoriesCovered, ["teamwork"]);
  check("though the repeat question still counts", p.questionsAsked, 3);

  p = reduceInterviewProgress(p, { kind: "planned", category: "ambiguity" }, OPTS);
  check("quota reached advances the stage",
    [p.categoriesCovered.length, p.stage], [2, "role_specific"]);
}

console.log("\n4. Non-planned kinds are unchanged");
{
  let p: InterviewProgress = initialProgress();
  p = reduceInterviewProgress(p, { kind: "planned" }, OPTS);
  const before = p.questionsAsked;
  p = reduceInterviewProgress(p, { kind: "follow_up" }, OPTS);
  check("a follow-up never increments the counter", p.questionsAsked, before);
  check("and is capped at one", reduceInterviewProgress(p, { kind: "follow_up" }, OPTS).followUpsUsed, 1);
  check("a null action is inert", reduceInterviewProgress(p, null, OPTS), p);
  check("closing sets the closing stage",
    reduceInterviewProgress(p, { kind: "closing" }, OPTS).stage, "closing");
}

console.log("\n5. Legacy progress without the new counter");
{
  // A session checkpointed before `behavioralQuestionsAsked` existed.
  const legacy = {
    stage: "behavioral", questionsAsked: 1,
    categoriesCovered: [], dodgedCategories: [], followUpsUsed: 0,
  } as unknown as InterviewProgress;
  const next = reduceInterviewProgress(legacy, { kind: "planned" }, OPTS);
  check("resumes counting from the missing field without NaN",
    [next.questionsAsked, next.behavioralQuestionsAsked], [2, 1]);
}

// ── Phase 13-06: engine prompt assembly / turn-control byte-equality ────────
// Sections below prove REQ-73: assembleSystemPrompt is byte-identical to
// today's builders, and the system prompt stays session-constant across turns.

function firstDiff(a: string, b: string): string {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      return `first diff at index ${i}: engine=${JSON.stringify(a.slice(i, i + 40))} legacy=${JSON.stringify(b.slice(i, i + 40))}`;
    }
  }
  if (a.length !== b.length) {
    return `length mismatch: engine=${a.length} legacy=${b.length}`;
  }
  return "identical";
}

function checkString(name: string, actual: string, expected: string) {
  if (actual === expected) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}\n         ${firstDiff(actual, expected)}`);
  }
}

const LANGUAGE = resolveAttemptLanguage("en");
const RESUME = "Jane Doe\nSoftware Engineer at Acme\nLed a team of 4.";

console.log("\n6. assembleSystemPrompt == buildInterviewSystemPrompt (four presets)");
for (const slug of Object.keys(INTERVIEW_TYPES)) {
  const interviewType = getInterviewType(slug)!;
  const resolved = resolveSessionConfig(slug);
  if (!resolved.ok) {
    failures += 1;
    console.log(`  FAIL resolve ${slug}: ${resolved.reason}`);
    continue;
  }
  const engine = assembleSystemPrompt(resolved.config, {
    language: LANGUAGE,
    resumeText: RESUME,
  });
  const legacy = buildInterviewSystemPrompt(interviewType, {
    resumeText: RESUME,
    language: LANGUAGE,
  });
  checkString(`${slug} system prompt byte-identical`, engine, legacy);
}

console.log("\n7. case-study assembleSystemPrompt == frozen pre-Phase-13 else-branch");
{
  // Frozen snapshot of pre-Phase-13 `app/api/interaction/chat/route.ts` else
  // branch composition order: style guide → language rule → role context →
  // client systemPrompt. Do not "improve" this string — it is the regression
  // oracle for REQ-73 / legacy admin-case bytes.
  const roleContext = {
    roleName: "Alex Chen",
    additionalInfo: "You are a skeptical product manager.",
  };
  const clientSystemPrompt = "Case background: the launch is slipping.";
  const languageRule =
    `## Language\nConduct this conversation entirely in ${LANGUAGE.name}. ` +
    `If a message appears to be in another language, treat it as a ` +
    `speech-to-text error and continue in ${LANGUAGE.name}.`;
  const expected = [
    CASE_STUDY_REPLY_STYLE_GUIDE.trim(),
    languageRule,
    `You are playing the role of "${roleContext.roleName}" in a case study simulation.`,
    roleContext.additionalInfo,
    clientSystemPrompt,
  ]
    .filter(Boolean)
    .join("\n\n");

  const resolved = resolveSessionConfig("case-study", {
    instance: {
      kind: "case-study",
      caseId: "scn-test",
      caseName: "Launch Slip",
      background: "The launch is slipping.",
      avatars: [{ name: "Alex Chen", role: "PM", additionalInfo: roleContext.additionalInfo }],
      criteria: null,
    },
  });
  if (!resolved.ok) {
    failures += 1;
    console.log(`  FAIL resolve case-study: ${resolved.reason}`);
  } else {
    const engine = assembleSystemPrompt(resolved.config, {
      language: LANGUAGE,
      systemPrompt: clientSystemPrompt,
      roleContext,
    });
    checkString("case-study system prompt byte-identical to frozen snapshot", engine, expected);
  }
}

console.log("\n8. buildTailBlock == buildProgressBlock (interview) / empty (case-study)");
{
  const progress = initialProgress();
  const timing = {
    elapsedMinutes: 3,
    targetMinutes: 15,
    redirectMetaRequest: false,
  };
  const legacyTail = buildProgressBlock(progress, timing);

  for (const slug of Object.keys(INTERVIEW_TYPES)) {
    const resolved = resolveSessionConfig(slug);
    if (!resolved.ok) {
      failures += 1;
      console.log(`  FAIL resolve ${slug}`);
      continue;
    }
    const engineTail = buildTailBlock(resolved.config, { progress, timing });
    checkString(`${slug} tail == buildProgressBlock`, engineTail, legacyTail);
  }

  const caseResolved = resolveSessionConfig("case-study", {
    instance: {
      kind: "case-study",
      caseId: "scn-test",
      caseName: "Launch Slip",
      background: "bg",
      avatars: [{ name: "A", role: "R" }],
      criteria: null,
    },
  });
  if (!caseResolved.ok) {
    failures += 1;
    console.log(`  FAIL resolve case-study for tail`);
  } else {
    checkString(
      "case-study tail is empty string",
      buildTailBlock(caseResolved.config, { progress, timing }),
      "",
    );
  }
}

console.log("\n9. buildTurnMessages appends tail to LAST user message only; system prompt session-constant");
{
  const resolved = resolveSessionConfig("general");
  if (!resolved.ok) {
    failures += 1;
    console.log(`  FAIL resolve general`);
  } else {
    const messages = [
      { role: "assistant" as const, content: "Welcome." },
      { role: "user" as const, content: "Thanks." },
      { role: "assistant" as const, content: "Tell me about yourself." },
      { role: "user" as const, content: "I am a student." },
    ];
    const turnStateA = {
      progress: initialProgress(),
      timing: { elapsedMinutes: 1, targetMinutes: 15 },
    };
    const turnStateB = {
      progress: {
        ...initialProgress(),
        stage: "behavioral" as const,
        questionsAsked: 3,
        behavioralQuestionsAsked: 1,
      },
      timing: { elapsedMinutes: 8, targetMinutes: 15 },
    };

    const a = buildTurnMessages({
      config: resolved.config,
      messages,
      turnState: turnStateA,
      language: LANGUAGE,
      resumeText: RESUME,
    });
    const b = buildTurnMessages({
      config: resolved.config,
      messages,
      turnState: turnStateB,
      language: LANGUAGE,
      resumeText: RESUME,
    });

    checkString("system prompt identical across different turn states", a.systemPrompt, b.systemPrompt);
    check("system message is messages[0]", a.messages[0]?.role, "system");
    checkString("system message content == systemPrompt", a.messages[0]?.content ?? "", a.systemPrompt);

    // Earlier messages unchanged (indices 1..n-1 relative to fullMessages =
    // system + transcript). Transcript[0]=assistant Welcome, [1]=user Thanks,
    // [2]=assistant Tell me… — only the last user should gain the tail.
    checkString("earlier assistant unchanged", a.messages[1]?.content ?? "", "Welcome.");
    checkString("earlier user unchanged", a.messages[2]?.content ?? "", "Thanks.");
    checkString(
      "earlier assistant Q unchanged",
      a.messages[3]?.content ?? "",
      "Tell me about yourself.",
    );

    const lastA = a.messages[a.messages.length - 1];
    const expectedTail = buildTailBlock(resolved.config, turnStateA);
    check(
      "last message is user",
      lastA?.role,
      "user",
    );
    checkString(
      "last user has original content + tail",
      lastA?.content ?? "",
      `I am a student.\n\n${expectedTail}`,
    );
    check(
      "different turn states produce different last-user tails",
      a.messages[a.messages.length - 1]?.content ===
        b.messages[b.messages.length - 1]?.content,
      false,
    );
  }
}

/**
 * Every instance-requiring type needs a synthetic instance or it cannot
 * resolve. Shapes mirror scripts/verify-dc-surface-count.ts and
 * scripts/verify-pitch-surface-count.ts.
 */
function syntheticInit(slug: string): Parameters<typeof resolveSessionConfig>[1] {
  if (slug === "case-study") {
    return {
      instance: {
        kind: "case-study",
        caseId: "scn-test",
        caseName: "X",
        background: "bg",
        avatars: [{ name: "A", role: "R" }],
        criteria: null,
      },
    };
  }
  if (slug === "pitch-elevator") {
    return {
      instance: {
        kind: "pitch-elevator",
        pitchSubject: "A campus sustainability startup seeking a pilot partner.",
        listenerKnowledge: "name-role",
      },
    };
  }
  if (slug === "pitch-deck") {
    return {
      instance: {
        kind: "pitch-deck",
        deckId: "deck-test",
        slideCount: 8,
        slideTexts: Array.from({ length: 8 }, (_, i) => `Slide ${i + 1} text`),
        askPriceUsd: 500000,
        askEquityPct: 10,
        fairValueBand: {
          priceUsdMin: 400000,
          priceUsdMax: 600000,
          equityPctMin: 8,
          equityPctMax: 12,
        },
        proposedSeconds: 600,
      },
    };
  }
  // Phase 19's four new deck modes. They share the ONE `pitch-deck` instance
  // kind (plan 19-02's deliberate widening — a new kind per mode would force
  // edits to the engine modules REQ-93 forbids), and they carry NO negotiation
  // fields: `askPriceUsd`/`askEquityPct`/`fairValueBand` are ABSENT, not zeroed,
  // which is how REQ-89 is enforced. `modeInputs` carries each mode's own
  // required wizard input.
  //
  // Added 2026-10-08: this script's fixture switch was never extended when
  // 19-04/19-05 registered these four slugs, so all four `resolve` checks
  // failed. Same class of tooling gap that 19-10 fixed in
  // `verify-report-structure.ts` (see `19-UNOWNED-RED-SCRIPT.md`) and that
  // 19-04/19-05 fixed in `verify-pitch-types.ts`. No assertion was weakened to
  // make this pass — only the missing fixtures were supplied.
  if (
    slug === "pitch-funding" ||
    slug === "pitch-product" ||
    slug === "pitch-talk" ||
    slug === "pitch-general"
  ) {
    const modeInputs =
      slug === "pitch-funding"
        ? {
            mode: "pitch-funding" as const,
            requestedAmountUsd: 250000,
            useOfFunds: "Two engineering hires and twelve months of runway.",
          }
        : slug === "pitch-product"
          ? {
              mode: "pitch-product" as const,
              buyerProfile:
                "A mid-market operations director who owns the budget and distrusts new vendors.",
            }
          : slug === "pitch-talk"
            ? {
                mode: "pitch-talk" as const,
                talkAudience: "Forty graduate students at a careers evening.",
                talkTakeaway:
                  "Technical depth is worth less than being understood.",
              }
            : undefined; // pitch-general takes no mode input by design
    return {
      instance: {
        kind: "pitch-deck",
        deckId: "deck-test",
        slideCount: 8,
        slideTexts: Array.from({ length: 8 }, (_, i) => `Slide ${i + 1} text`),
        proposedSeconds: 600,
        ...(modeInputs ? { modeInputs } : {}),
      },
    };
  }
  if (slug === "difficult-conversation") {
    return {
      instance: {
        kind: "difficult-conversation",
        conversationId: "confront-low-performer",
        source: "seeded",
        role: "Dana, your direct report",
        studentRole: "their manager",
        situation:
          "A performance conversation about missed deadlines and unclear ownership.",
        sharedBackstory:
          "Two prior check-ins documented the same delivery gaps; the project is at risk.",
        hiddenPosition:
          "They believe the handoff process is broken and will not own the whole slip.",
        studentObjective:
          "Get a written commitment to a checkpoint plan this week.",
        stakes:
          "If this fails, the work escalates to HR and the release slips again.",
        difficulty: "guarded",
        avatarId: "avatar-test",
        voiceId: "voice-test",
      },
    };
  }
  return {};
}

console.log("\n10. parseEngineTurn == parseInterviewTurn + reducer; termination null for all built-ins");
{
  const sequence = [
    marker('kind="planned"'),
    marker('kind="planned" category="teamwork"'),
    marker('kind="planned" category="ambiguity"'),
    marker('kind="planned"'),
    'Wrap up.\n<interview-turn kind="closing" />\n<engine-end reason="tedious" />',
  ];

  for (const type of listEngineTypes()) {
    const resolved = resolveSessionConfig(type.slug, syntheticInit(type.slug));
    if (!resolved.ok) {
      failures += 1;
      console.log(`  FAIL resolve ${type.slug}`);
      continue;
    }

    // Even with an engine-end marker present, built-in types (avatarMayEnd:
    // false) must report termination: null.
    const withEnd = parseEngineTurn(
      'Thanks for coming in.\n<engine-end reason="tedious" />',
      resolved.config,
    );
    check(
      `${type.slug} termination null despite marker (avatarMayEnd: false)`,
      withEnd.termination,
      null,
    );
    checkString(
      `${type.slug} strips termination marker from cleanedText`,
      withEnd.cleanedText,
      "Thanks for coming in.",
    );
  }

  // Progress reduction sequence for general — identical to parseInterviewTurn
  // + reduceInterviewProgress.
  const resolved = resolveSessionConfig("general");
  if (!resolved.ok) {
    failures += 1;
    console.log("  FAIL resolve general for sequence");
  } else {
    let engineProgress = initialProgress();
    let legacyProgress = initialProgress();
    for (const text of sequence) {
      const engine = parseEngineTurn(text, resolved.config, {
        previousProgress: engineProgress,
        hasResume: false,
        targetQuestionCount: 9,
      });
      const legacyParsed = parseInterviewTurn(
        // Strip trailing engine-end the same way parseEngineTurn does first,
        // so the interview marker is still trailing for the legacy parser.
        text.replace(/\s*<engine-end\b[^>]*\/?>(?:\s*)$/i, "").trimEnd(),
      );
      legacyProgress = reduceInterviewProgress(legacyProgress, legacyParsed.action, OPTS);
      engineProgress = engine.progress ?? engineProgress;

      check(
        `progress matches after turn (q=${legacyProgress.questionsAsked}, stage=${legacyProgress.stage})`,
        {
          questionsAsked: engineProgress.questionsAsked,
          stage: engineProgress.stage,
          categoriesCovered: engineProgress.categoriesCovered,
        },
        {
          questionsAsked: legacyProgress.questionsAsked,
          stage: legacyProgress.stage,
          categoriesCovered: legacyProgress.categoriesCovered,
        },
      );
      checkString(
        "cleaned content matches parseInterviewTurn.content",
        engine.cleanedText,
        legacyParsed.content,
      );
      check("termination stays null through interview sequence", engine.termination, null);
    }
  }
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
