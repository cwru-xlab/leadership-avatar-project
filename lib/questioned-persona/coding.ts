/**
 * Behavior coding — code definitions for the tagging pass, and the PURE
 * arithmetic that turns per-utterance tags into counts, ratios and threshold
 * bands. The model tags; this file counts. Nothing here calls a model, so the
 * numbers on the report are reproducible from the stored tags.
 */

import type {
  BehaviorCode,
  ClinicalCode,
  DerivedMetric,
  MiCode,
  PersonaStyle,
  TaggedUtterance,
  ThresholdBand,
} from "./types";
import { CLINICAL_CODES, MI_CODES } from "./types";

export const CODE_DEFINITIONS: Record<PersonaStyle, Record<string, string>> = {
  "clinical-communication": {
    open_question:
      "A question that invites a wide range of answers in the patient's own words (What/How/Tell me/Describe…). 'Can you tell me about…' is OPEN.",
    closed_question:
      "A question answerable with yes/no, a number, or a single fact (Do you…? When did…? How many…? Is it sharp?).",
    leading_question:
      "A question that presumes or suggests its own answer. Code it IN ADDITION to the question type. Leading forms include: a tag question appended to a statement (…, right? …, correct? …, do you? …, don't you? …, isn't it? …, aren't you?); a negatively framed screen that invites agreement (You don't smoke, do you? No chest pain, nothing like that? Nothing else going on?); a question that states the answer and asks for confirmation (So that's intentional? You're probably just not sleeping enough?); and a question that supplies the diagnosis or cause the patient should agree with. If the patient could answer it by only saying 'right' or 'no' without adding anything, and the clinician already implied which one, it is leading.",
    stacked_question:
      "Two or more different questions asked in one turn before the patient can answer. Code once per utterance, in addition to the question type of the questions.",
    reflection:
      "A statement (not a question) that mirrors or interprets what the patient just said (It sounds like…, So the pain is worse at night.).",
    summary:
      "A statement that gathers THREE or more pieces of what the patient said, usually to check understanding or to transition. Code summary instead of reflection.",
    empathy_statement:
      "Names, acknowledges, legitimizes or supports the patient's emotion (That sounds frightening. Anyone would be worried. I can see this has been hard.). NURSE-type statements.",
    jargon:
      "Uses a technical or medical term a lay person may not understand WITHOUT explaining it in the same turn (e.g. 'angina', 'A1c', 'febrile', 'NPO', 'occlusal'). Code once per utterance.",
    information_giving:
      "Explains, informs or describes next steps, tests, causes or a plan.",
    teach_back:
      "Asks the patient to restate information or the plan in their own words (Can you tell me what you'll do when you get home?). 'Do you understand?' or 'Any questions?' is NOT teach_back.",
    agenda_setting:
      "Introduces self/role and the purpose of the visit, or screens for further concerns (Is there anything else you wanted to discuss today?).",
    premature_reassurance:
      "Reassures before the concern has been explored or without basis (Don't worry, I'm sure it's nothing.).",
  },
  "motivational-interviewing": {
    open_question:
      "A question that allows a wide range of answers (What/How/Tell me…). MITI Question, open.",
    closed_question:
      "A question answerable with yes/no or a short fact. MITI Question, closed.",
    simple_reflection:
      "MITI Simple Reflection: conveys understanding while adding little or no meaning beyond what the client said; a repetition or light rephrase.",
    complex_reflection:
      "MITI Complex Reflection: adds substantial meaning or emphasis — infers an unstated feeling or meaning, uses a metaphor, amplifies, or is double-sided ('On the one hand… and on the other…'). A summary that adds meaning or links several client statements is coded complex_reflection.",
    affirm:
      "MITI Affirm: a genuine statement about the client's strengths, efforts, values or intentions (You've clearly thought hard about this. You care a lot about your daughter.). Not generic praise like 'Good'.",
    seeking_collaboration:
      "MITI Seeking Collaboration: explicitly asks for the client's ideas or permission, or invites them to set the agenda (Would it be okay if we talked about…? What do you think would work for you?).",
    emphasizing_autonomy:
      "MITI Emphasizing Autonomy: puts the decision and control with the client (It's really up to you. You're the expert on your life.).",
    giving_information:
      "MITI Giving Information: provides information, feedback or explanation without persuading.",
    persuade:
      "MITI Persuade: tries to change the client's opinion or behavior through logic, argument, warnings, advice, a directive, or self-disclosure WITHOUT asking permission. Persuade includes: naming a consequence of not changing (People who skip rehab are more likely to have another heart attack.); an unsolicited suggestion or solution (You could carpool.); appealing to someone else's feelings as a reason (Your wife is worried sick. You should think about her.); and any 'you need to' or 'you should'. Code persuade once per utterance no matter how many arguments it contains.",
    persuade_with_permission:
      "MITI Persuade with Permission: the same advice or concern but after asking permission or with explicit emphasis on choice (Would it be okay if I shared a concern? … You may or may not agree.).",
    confront:
      "MITI Confront: disagrees, argues, corrects, shames, blames, criticizes, labels, moralizes or questions the client's honesty. Confront includes: directly contradicting what the client just said (That's just not true. Feeling fine doesn't mean your heart is fine.); a rhetorical or scare question that is really an accusation or a warning (Do you want to have another heart attack? You know that's not okay, right?); and telling the client their reason is an excuse or denial. Confront is about the counselor's STANCE toward the client, so an utterance that both contradicts the client AND argues for the change gets BOTH confront and persuade.",
  },
};

export function codesForStyle(style: PersonaStyle): readonly BehaviorCode[] {
  return style === "clinical-communication" ? CLINICAL_CODES : MI_CODES;
}

/** Count every code over all utterances. Each code counts once per utterance. */
export function countCodes(
  style: PersonaStyle,
  utterances: TaggedUtterance[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const code of codesForStyle(style)) counts[code] = 0;
  for (const u of utterances) {
    for (const code of new Set(u.codes)) {
      if (code in counts) counts[code] += 1;
    }
  }
  counts.student_utterances = utterances.length;
  return counts;
}

function band(value: number | null, fair: number, good: number): ThresholdBand | undefined {
  if (value === null) return undefined;
  if (value >= good) return "good";
  if (value >= fair) return "fair";
  return "below";
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100) / 100;
}

function percent(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100);
}

export const MITI4_SOURCE =
  "MITI 4.2.1 proficiency thresholds (Moyers, Manuel & Ernst, 2014; Moyers, Rowell, Manuel, Ernst & Houck, 2016, J Subst Abuse Treat 65:36–42): R:Q fair 1:1, good 2:1; % complex reflections fair 40%, good 50%.";
export const MITI3_OQ_SOURCE =
  "MITI 3.1.1 threshold for % open questions (Moyers, Martin, Manuel, Miller & Ernst, 2010): beginning proficiency 50%, competency 70%. MITI 4 dropped the open/closed distinction; shown as a reference only.";
export const CLINICAL_TARGET_SOURCE =
  "Practice target for this tool, not a validated cut-off. Calgary–Cambridge recommends an 'open-to-closed cone' (open questions first, closed to clarify); no published numeric threshold exists for clinical history-taking.";

/** Derived ratios and bands. Pure; every number traces to `counts`. */
export function deriveMetrics(
  style: PersonaStyle,
  counts: Record<string, number>,
): DerivedMetric[] {
  const c = (k: string) => counts[k] ?? 0;

  if (style === "motivational-interviewing") {
    const questions = c("open_question") + c("closed_question");
    const reflections = c("simple_reflection") + c("complex_reflection");
    const rq = ratio(reflections, questions);
    const pctCr = percent(c("complex_reflection"), reflections);
    const pctOq = percent(c("open_question"), questions);
    const adherent = c("affirm") + c("seeking_collaboration") + c("emphasizing_autonomy");
    const nonAdherent = c("persuade") + c("confront");
    return [
      {
        key: "reflection_to_question",
        label: "Reflection-to-question ratio",
        value: rq,
        format: "ratio",
        threshold: { fair: 1, good: 2, source: MITI4_SOURCE },
        band: band(rq, 1, 2),
        note: "MI practitioners reflect more than they ask. Each reflection shows the client you heard them and lets them keep talking.",
      },
      {
        key: "percent_complex_reflections",
        label: "Complex reflections",
        value: pctCr,
        format: "percent",
        threshold: { fair: 40, good: 50, source: MITI4_SOURCE },
        band: band(pctCr, 40, 50),
        note: "Complex reflections add meaning — a feeling, a double-sided summary — and move the conversation forward instead of just repeating.",
      },
      {
        key: "percent_open_questions",
        label: "Open questions",
        value: pctOq,
        format: "percent",
        threshold: { fair: 50, good: 70, source: MITI3_OQ_SOURCE },
        band: band(pctOq, 50, 70),
        note: "Open questions invite the client's own reasons; closed questions collect facts.",
      },
      {
        key: "mi_adherent",
        label: "MI-adherent behaviors",
        value: adherent,
        format: "count",
        note: "Affirm + Seeking collaboration + Emphasizing autonomy (MITI 4 'Total MI-Adherent').",
      },
      {
        key: "mi_non_adherent",
        label: "MI non-adherent behaviors",
        value: nonAdherent,
        format: "count",
        note: "Persuade without permission + Confront (MITI 4 'Total MI Non-Adherent'). Aim for zero — each one tends to provoke sustain talk.",
      },
    ];
  }

  const questions = c("open_question") + c("closed_question");
  const pctOq = percent(c("open_question"), questions);
  return [
    {
      key: "percent_open_questions",
      label: "Open questions",
      value: pctOq,
      format: "percent",
      threshold: { fair: 25, good: 40, source: CLINICAL_TARGET_SOURCE },
      band: band(pctOq, 25, 40),
      note: "Open questions let the patient tell the story; closed questions clarify details. A history made only of closed questions misses what the patient didn't think to mention.",
    },
    {
      key: "empathy_statements",
      label: "Empathy statements",
      value: c("empathy_statement"),
      format: "count",
      threshold: { fair: 1, good: 2, source: CLINICAL_TARGET_SOURCE },
      band: band(c("empathy_statement"), 1, 2),
      note: "Naming or acknowledging the patient's emotion (NURSE statements). Every case has at least two emotional cues.",
    },
    {
      key: "reflections_and_summaries",
      label: "Reflections and summaries",
      value: c("reflection") + c("summary"),
      format: "count",
      threshold: { fair: 1, good: 3, source: CLINICAL_TARGET_SOURCE },
      band: band(c("reflection") + c("summary"), 1, 3),
      note: "Reflecting and summarizing show you listened and let the patient correct you.",
    },
    {
      key: "unexplained_jargon",
      label: "Unexplained jargon",
      value: c("jargon"),
      format: "count",
      note: "Technical terms used without a plain-language explanation. Aim for zero.",
    },
    {
      key: "teach_back",
      label: "Teach-back checks",
      value: c("teach_back"),
      format: "count",
      note: "Asking the patient to say the plan back in their own words. 'Any questions?' does not count.",
    },
    {
      key: "leading_or_stacked",
      label: "Leading or stacked questions",
      value: c("leading_question") + c("stacked_question"),
      format: "count",
      note: "Leading questions suggest the answer; stacked questions ask several at once. Both make answers less reliable. Aim for zero.",
    },
    {
      key: "premature_reassurance",
      label: "Premature reassurance",
      value: c("premature_reassurance"),
      format: "count",
      note: "Reassurance before the worry was explored tends to close the conversation down. Aim for zero.",
    },
  ];
}

/** The canned opener the session shell sends on connect — never coded. */
const CANNED_OPENER = /^i[’']m ready to begin the interview\.?$/i;

export interface StudentUtterance {
  index: number;
  text: string;
  timecodeSeconds: number;
}

export function studentUtterances(
  turns: Array<{ role: string; content: string; timestamp: number }>,
  startedAt: number,
): StudentUtterance[] {
  const out: StudentUtterance[] = [];
  for (const turn of turns) {
    if (turn.role !== "user") continue;
    const text = turn.content.trim();
    if (!text || CANNED_OPENER.test(text)) continue;
    out.push({
      index: out.length,
      text,
      timecodeSeconds: Math.max(0, Math.round((turn.timestamp - startedAt) / 1000)),
    });
  }
  return out;
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The judge is shown `[S4] Clinician: …` lines (see `labelledTranscript`) and
 * told to copy a span from one of them, so it sometimes copies the label too.
 * That is compliant behavior, not a hallucination: strip the label before
 * matching rather than discarding real evidence.
 */
export function cleanEvidenceQuote(quote: string): string {
  return quote
    .trim()
    .replace(/^["“]|["”]$/g, "")
    .replace(/^\[S\d+\]\s*/i, "")
    .replace(/^(clinician|counselor|patient|client|student)\s*:\s*/i, "")
    .trim();
}

/**
 * Evidence must be the student's own words. Returns the utterance a quote
 * came from, or null when the quote is not verbatim (after whitespace,
 * punctuation and case normalization) in any student utterance.
 */
export function locateQuote(
  quote: string,
  utterances: StudentUtterance[],
): StudentUtterance | null {
  const q = normalizeForMatch(cleanEvidenceQuote(quote));
  if (q.length < 3) return null;
  return utterances.find((u) => normalizeForMatch(u.text).includes(q)) ?? null;
}

export function isClinicalCode(code: string): code is ClinicalCode {
  return (CLINICAL_CODES as readonly string[]).includes(code);
}

export function isMiCode(code: string): code is MiCode {
  return (MI_CODES as readonly string[]).includes(code);
}
