/**
 * What a coding report's "Your solution" tab loads AFTER the report is READY:
 * the student's own final code, the hints they were issued, and the
 * post-session teaching material (approach, complexity, pitfalls).
 *
 * ACCESS: owner-only and READY-only, the same rule as the report GET
 * (`getReportForUser`): another user's report, a missing one, a non-coding
 * one and one still being graded all collapse to the same 404. Nothing here is
 * read by the live session routes, so none of it can reach a candidate
 * mid-interview (see `types.ts` on in-session integrity).
 *
 * THE MODEL SOLUTION IS A SEPARATE READ. `getCodingSolutionForUser` never
 * includes it; only `getModelSolutionForUser` does, and the tab calls that
 * when the student explicitly clicks "Show model solution". A student who
 * does not want the answer spoiled never has it in the page.
 *
 * DEV FIXTURE: when `getPostSessionMaterial` has nothing authored and the
 * process is NOT production, `TECHNICAL_POST_SESSION_FIXTURE` may name a JSON
 * file of `{ [assignmentId]: PostSessionMaterial }`. It exists only so the
 * report UI can be built and tested before loop/coding-corpus authors real
 * material. Production never reads it.
 */

import { readFileSync } from "node:fs";

import { prisma } from "@/lib/prisma";
import { asInputSnapshot } from "@/lib/report/snapshot";
import { parseStoredTechnicalEvidence } from "@/lib/technical-interview/evidence";
import {
  getPostSessionMaterial,
  type CodingLanguage,
  type PostSessionMaterial,
} from "@/lib/technical-interview/post-session.server";
import {
  isTechnicalCodingLanguage,
  MAX_TECHNICAL_HINTS,
} from "@/lib/technical-interview/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CodingHintView {
  tier: number;
  /** The hint as spoken, without the "Hint n of 3:" lead. */
  text: string;
}

/** The tab's payload. Deliberately has no model solution field. */
export interface CodingSolutionView {
  language: CodingLanguage;
  /** Null for reports finished before final source was saved. */
  finalSource: string | null;
  hints: CodingHintView[];
  maxHints: number;
  /** Approach, complexity and pitfalls, or null when none is authored. */
  material: Omit<PostSessionMaterial, "modelSolutions"> | null;
  /** Languages a model solution exists for; empty when none is authored. */
  modelSolutionLanguages: CodingLanguage[];
}

type NotFound = { ok: false; status: 404; error: string };
const NOT_FOUND: NotFound = { ok: false, status: 404, error: "Report not found" };

function devFixtureMaterial(assignmentId: string): PostSessionMaterial | null {
  const path = process.env.TECHNICAL_POST_SESSION_FIXTURE;
  if (process.env.NODE_ENV === "production" || !path) return null;
  try {
    const all = JSON.parse(readFileSync(path, "utf8")) as Record<string, PostSessionMaterial>;
    return all[assignmentId] ?? null;
  } catch (error) {
    console.error("Dev post-session fixture unreadable:", { path, error });
    return null;
  }
}

function loadMaterial(assignmentId: string): PostSessionMaterial | null {
  return getPostSessionMaterial(assignmentId) ?? devFixtureMaterial(assignmentId);
}

function hintText(stored: string): string {
  return stored.replace(/^\s*hint\s+\d+\s+of\s+\d+\s*:\s*/i, "").trim();
}

/** The owner's READY coding report, narrowed, or null for every other case. */
async function ownedReadyCodingReport(userId: string, reportId: string) {
  if (typeof reportId !== "string" || !UUID_REGEX.test(reportId)) return null;
  const row = await prisma.interactionReport.findFirst({
    where: { id: reportId, userId, typeSlug: "technical-coding", status: "READY" },
    select: { id: true, inputSnapshot: true, technicalEvidence: true },
  });
  if (!row) return null;
  const input = asInputSnapshot(row.inputSnapshot);
  if (input?.kind !== "technical-coding") return null;
  return { row, input };
}

export async function getCodingSolutionForUser(
  userId: string,
  reportId: string,
): Promise<{ ok: true; solution: CodingSolutionView } | NotFound> {
  const owned = await ownedReadyCodingReport(userId, reportId);
  if (!owned) return NOT_FOUND;
  const { row, input } = owned;

  const hints = await prisma.technicalInterviewHint.findMany({
    where: { reportId: row.id },
    orderBy: { tier: "asc" },
    select: { tier: true, hintText: true },
  });

  const material = loadMaterial(input.assignmentId);
  const modelSolutionLanguages = material
    ? (Object.keys(material.modelSolutions) as CodingLanguage[]).filter(
        (language) => isTechnicalCodingLanguage(language) && material.modelSolutions[language]?.trim(),
      )
    : [];

  return {
    ok: true,
    solution: {
      language: input.language,
      finalSource: parseStoredTechnicalEvidence(row.technicalEvidence)?.finalSource ?? null,
      hints: hints
        .filter((hint) => hint.tier >= 1 && hint.tier <= MAX_TECHNICAL_HINTS)
        .map((hint) => ({ tier: hint.tier, text: hintText(hint.hintText) })),
      maxHints: MAX_TECHNICAL_HINTS,
      material: material
        ? { approach: material.approach, complexity: material.complexity, pitfalls: material.pitfalls }
        : null,
      modelSolutionLanguages,
    },
  };
}

export async function getModelSolutionForUser(
  userId: string,
  reportId: string,
  language: unknown,
): Promise<{ ok: true; language: CodingLanguage; code: string } | NotFound | { ok: false; status: 400; error: string }> {
  if (!isTechnicalCodingLanguage(language)) {
    return { ok: false, status: 400, error: "Unsupported language" };
  }
  const owned = await ownedReadyCodingReport(userId, reportId);
  if (!owned) return NOT_FOUND;
  const code = loadMaterial(owned.input.assignmentId)?.modelSolutions[language];
  if (!code?.trim()) return { ok: false, status: 404, error: "No model solution for this problem yet" };
  return { ok: true, language, code };
}
