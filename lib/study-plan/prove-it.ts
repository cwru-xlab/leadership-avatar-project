/**
 * The PRE-FILLED PROVE-IT step (23-CONTEXT.md, 2026-10-24): "the final
 * UNAIDED_SESSION opens the plan's source practice type with setup pre-filled
 * and a brief naming the target skill; practice behaviour is unchanged when
 * not pre-filled. Graded as a normal live session."
 *
 * MECHANISM (optional, additive):
 *   1. The path DTO gives the final UNAIDED_SESSION step an href
 *      `/practice/{slug}[/{instanceId}]?fromPlan={planId}&step={stepId}`.
 *   2. The practice page, ONLY when both params are present, GETs
 *      `/api/study-plans/path-steps/{stepId}/prove-it` and seeds its wizard
 *      state from `prefill` (exactly the values its own setup steps would
 *      have produced). With neither param, the page runs its existing code
 *      path untouched.
 *   3. After the normal session start returns a reportId, the page POSTs it
 *      to the same route; the step stores it (`linkedReportId`) and goes
 *      IN_PROGRESS. The path GET completes the step once that report is
 *      READY. Grading is the normal live-session pipeline (LIVE_SESSION
 *      contributions) — nothing here grades.
 *
 * The pure helpers (source choice, snapshot -> prefill, href, brief) are
 * exported for scripts/verify-prove-it.ts.
 */
import { prisma } from "../prisma";
import { COMPETENCIES, type CompetencyKey } from "../mastery/competencies";
import { asInputSnapshot, type InputSnapshot } from "../report/snapshot";
import { typeLabelForReport } from "../report/title";
import { getInterviewType } from "../interview/types";
import type { InterviewCustomizationInput } from "../interview/customization";
import {
  CURATED_INDUSTRIES,
  CURATED_ROLES,
  PERSONALITY_DIALS,
  SESSION_LENGTH_PRESETS,
  INTERVIEW_DIFFICULTIES,
} from "../interview/customization-options";
import { planEvidenceFromReports } from "./plan-targets";

/** What the practice page seeds its wizard state from. */
export type ProveItPrefill =
  | { kind: "interview"; customization: InterviewCustomizationInput }
  | { kind: "networking"; characterId: string | null; personaId: string | null; goal: string }
  | {
      kind: "pitch-elevator";
      pitchSubject: string;
      listenerKnowledge: "blind" | "name-role" | "full-profile";
    }
  /** Pre-authored instance types (case-study, difficult-conversation): the
   * instance IS the setup, so the href carries it and nothing else is seeded. */
  | { kind: "instance"; instanceId: string }
  /** No reusable setup (e.g. a deck mode needs a fresh upload): brief only. */
  | { kind: "none" };

export interface ProveItSourceReport {
  id: string;
  typeSlug: string;
  createdAt: Date;
  scores: unknown;
  inputSnapshot: unknown;
}

export interface ProveItInfo {
  stepId: string;
  planId: string;
  competencyKey: CompetencyKey;
  competencyLabel: string;
  typeSlug: string;
  typeLabel: string;
  sourceReportId: string;
  sourceSessionAt: string;
  prefill: ProveItPrefill;
  brief: string;
  href: string;
  linkedReportId: string | null;
}

function labelFor(key: CompetencyKey): string {
  return COMPETENCIES.find((c) => c.key === key)?.label ?? key;
}

/**
 * PURE. The plan's "most relevant source session" for the target skill: among
 * source reports that scored the competency, the one that scored it LOWEST
 * (the session the skill most needs proving against); ties -> most recent.
 * If none scored it, the most recent source report. Null for no reports.
 */
export function chooseProveItSource(
  reports: readonly ProveItSourceReport[],
  competencyKey: CompetencyKey,
): ProveItSourceReport | null {
  if (reports.length === 0) return null;
  const byRecency = reports.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  let best: { report: ProveItSourceReport; percent: number } | null = null;
  for (const report of byRecency) {
    const ev = planEvidenceFromReports([{ id: report.id, userId: "", scores: report.scores, createdAt: report.createdAt }]).get(competencyKey);
    if (!ev) continue;
    if (!best || ev.meanPercent < best.percent) best = { report, percent: ev.meanPercent };
  }
  return best ? best.report : byRecency[0];
}

/** PURE. Inverts the resolved interview record back into wizard slugs. */
function interviewCustomization(
  typeSlug: string,
  snap: Extract<InputSnapshot, { kind: "interview" }>,
): InterviewCustomizationInput {
  const out: InterviewCustomizationInput = {};
  const industry = CURATED_INDUSTRIES.find((o) => o.promptValue === snap.industry);
  if (industry) out.industrySlug = industry.slug;
  const role = CURATED_ROLES.find((o) => o.promptValue === snap.roleTitle);
  if (role) out.roleSlug = role.slug;
  if (snap.difficulty && (INTERVIEW_DIFFICULTIES as readonly string[]).includes(snap.difficulty)) {
    out.difficulty = snap.difficulty;
  }
  const length = SESSION_LENGTH_PRESETS.find(
    (p) => p.targetMinutes === snap.targetMinutes && p.targetQuestionCount === snap.targetQuestionCount,
  );
  if (length) out.lengthSlug = length.slug;
  const base = getInterviewType(typeSlug);
  if (base && snap.interviewerPersona) {
    const dial = PERSONALITY_DIALS.find((d) =>
      d.clause ? snap.interviewerPersona === `${base.interviewerPersona}, ${d.clause}` : snap.interviewerPersona === base.interviewerPersona,
    );
    if (dial) out.personalitySlug = dial.slug;
    // A distilled pasted-profile persona is deliberately NOT re-used: the
    // student would have to re-confirm whose profile it is. Open question.
  }
  return out;
}

/** PURE. A stored report's input snapshot -> the wizard prefill. */
export function prefillFromSnapshot(typeSlug: string, rawSnapshot: unknown): ProveItPrefill {
  const snap = asInputSnapshot(rawSnapshot);
  if (!snap) return { kind: "none" };
  switch (snap.kind) {
    case "interview":
      return { kind: "interview", customization: interviewCustomization(typeSlug, snap) };
    case "networking":
      if (!snap.goal) return { kind: "none" };
      return {
        kind: "networking",
        characterId: snap.personaSource === "character" ? snap.characterId : null,
        personaId: snap.personaSource === "brought-in" ? snap.personaId : null,
        goal: snap.goal,
      };
    case "pitch":
      if (snap.pitchKind === "elevator" && snap.pitchSubject && snap.listenerKnowledge) {
        return { kind: "pitch-elevator", pitchSubject: snap.pitchSubject, listenerKnowledge: snap.listenerKnowledge };
      }
      return { kind: "none" };
    case "scenario":
      return snap.caseId ? { kind: "instance", instanceId: snap.caseId } : { kind: "none" };
    case "difficult-conversation":
      return snap.conversationId ? { kind: "instance", instanceId: snap.conversationId } : { kind: "none" };
    default:
      return { kind: "none" };
  }
}

/** PURE. The step's destination. Only path segments the practice routes
 * already serve; the two query params are the ONLY addition. */
export function proveItHref(planId: string, stepId: string, typeSlug: string, prefill: ProveItPrefill): string {
  const base =
    prefill.kind === "instance"
      ? `/practice/${encodeURIComponent(typeSlug)}/${encodeURIComponent(prefill.instanceId)}`
      : `/practice/${encodeURIComponent(typeSlug)}`;
  return `${base}?fromPlan=${encodeURIComponent(planId)}&step=${encodeURIComponent(stepId)}`;
}

/** PURE. The short brief shown above the wizard: names the target skill. */
export function proveItBrief(competencyKey: CompetencyKey, typeLabel: string, prefilled: boolean): string {
  const setup = prefilled
    ? `It is set up like the session this plan scored lowest on ${labelFor(competencyKey).toLowerCase()}.`
    : "Set it up as you normally would.";
  return `Prove it: this ${typeLabel} session is your transfer test for ${labelFor(competencyKey)}. ${setup} There is no coaching, and it is graded like any live session.`;
}

/**
 * Resolves the prove-it info for a user-owned UNAIDED_SESSION step, or null
 * when the step is not the path's FINAL step (earlier UNAIDED steps, e.g.
 * pre-Phase-23 degraded ones, keep their existing plain practice link) or the
 * plan has no readable source report.
 */
export async function resolveProveIt(
  userId: string,
  stepId: string,
  opts?: { linkedReportId?: string | null },
): Promise<ProveItInfo | null> {
  const step = await prisma.studyPlanPathStep.findFirst({
    where: { id: stepId, kind: "UNAIDED_SESSION", path: { userId } },
    select: {
      id: true,
      position: true,
      competencyKey: true,
      path: {
        select: {
          studyPlanId: true,
          steps: { select: { position: true }, orderBy: { position: "desc" }, take: 1 },
          studyPlan: { select: { sourceReportIds: true } },
        },
      },
    },
  });
  if (!step) return null;
  if (step.path.steps[0]?.position !== step.position) return null;

  const rawIds = step.path.studyPlan.sourceReportIds;
  const reportIds = Array.isArray(rawIds) ? rawIds.filter((id): id is string => typeof id === "string") : [];
  if (reportIds.length === 0) return null;
  const reports = await prisma.interactionReport.findMany({
    where: { id: { in: reportIds }, userId, status: "READY" },
    select: { id: true, typeSlug: true, createdAt: true, scores: true, inputSnapshot: true },
  });

  const competencyKey = step.competencyKey as CompetencyKey;
  const source = chooseProveItSource(reports, competencyKey);
  if (!source) return null;

  const prefill = prefillFromSnapshot(source.typeSlug, source.inputSnapshot);
  const typeLabel = typeLabelForReport(source.typeSlug);
  return {
    stepId: step.id,
    planId: step.path.studyPlanId,
    competencyKey,
    competencyLabel: labelFor(competencyKey),
    typeSlug: source.typeSlug,
    typeLabel,
    sourceReportId: source.id,
    sourceSessionAt: source.createdAt.toISOString(),
    prefill,
    brief: proveItBrief(competencyKey, typeLabel, prefill.kind !== "none"),
    href: proveItHref(step.path.studyPlanId, step.id, source.typeSlug, prefill),
    linkedReportId: opts?.linkedReportId ?? null,
  };
}

/**
 * PURE gate for the link POST: a report may be linked to the prove-it step
 * only if it is the student's own (checked by the caller's scoped query), of
 * the prove-it type, and started after the path was generated.
 */
export function linkRejection(args: {
  report: { typeSlug: string; createdAt: Date; status: string } | null;
  expectedTypeSlug: string;
  pathGeneratedAt: Date;
}): string | null {
  if (!args.report) return "report not found";
  if (args.report.typeSlug !== args.expectedTypeSlug) return "report is not of the prove-it practice type";
  if (args.report.createdAt.getTime() < args.pathGeneratedAt.getTime()) return "report predates the path";
  if (args.report.status === "FAILED") return "report failed";
  return null;
}
