/**
 * The live coding interviewer must be told the session's language, and must be
 * shown the starter in THAT language.
 *
 * Regression: the prompt used `assignment.starterCode` — the historical
 * Python-only field — and never stated the language, so a JavaScript session
 * put a Python `def` in front of the model and it told candidates they were
 * working in Python.
 *
 * Iterates every catalogue assignment × every enabled language, so a new
 * language is covered the moment it is added to `TECHNICAL_CODING_LANGUAGES`.
 */

import assert from "node:assert/strict";

import { resolveSessionConfig } from "../lib/engine/resolve";
import { buildTurnMessages } from "../lib/engine/prompts";
import { resolveAttemptLanguage } from "../lib/languages";
import { listPublicTechnicalAssignments } from "../lib/technical-interview/assignments.server";
import {
  TECHNICAL_CODING_LANGUAGES,
  TECHNICAL_CODING_LANGUAGE_PROFILE,
} from "../lib/technical-interview/types";

const resolved = resolveSessionConfig("technical-coding");
assert.ok(resolved.ok, "technical-coding resolves");

const assignments = listPublicTechnicalAssignments();
assert.ok(assignments.length > 0, "catalogue is non-empty");

let checked = 0;
for (const assignment of assignments) {
  for (const language of TECHNICAL_CODING_LANGUAGES) {
    const profile = TECHNICAL_CODING_LANGUAGE_PROFILE[language];
    const { systemPrompt } = buildTurnMessages({
      config: resolved.config,
      messages: [{ role: "user", content: "Which language are we using?" }],
      turnState: {},
      language: resolveAttemptLanguage("en"),
      technicalSession: { assignment, language },
    });
    const where = `${assignment.id} / ${language}`;

    assert.match(systemPrompt, /\[SESSION SETTINGS/, `${where}: settings block present`);
    assert.ok(
      systemPrompt.includes(`Programming language: ${profile.label}`),
      `${where}: states the language`,
    );
    assert.ok(
      systemPrompt.includes(`Editor file: ${profile.fileName}`),
      `${where}: states the editor file`,
    );

    const ownStarter = assignment.starterCodeByLanguage[language];
    assert.ok(systemPrompt.includes(ownStarter), `${where}: shows this language's starter`);

    for (const other of TECHNICAL_CODING_LANGUAGES) {
      if (other === language) continue;
      const otherStarter = assignment.starterCodeByLanguage[other];
      if (otherStarter === ownStarter) continue;
      assert.ok(
        !systemPrompt.includes(otherStarter),
        `${where}: must not show the ${other} starter`,
      );
      assert.ok(
        !systemPrompt.includes(
          `Programming language: ${TECHNICAL_CODING_LANGUAGE_PROFILE[other].label}`,
        ),
        `${where}: must not state ${other} as the language`,
      );
    }

    // Settings come before the background and the question.
    assert.ok(
      systemPrompt.indexOf("[SESSION SETTINGS") < systemPrompt.indexOf("[LEARNER-VISIBLE QUESTION]"),
      `${where}: settings precede the question`,
    );
    checked += 1;
  }
}

console.log(`verify-technical-session-settings: ${checked} assignment × language prompts OK`);
