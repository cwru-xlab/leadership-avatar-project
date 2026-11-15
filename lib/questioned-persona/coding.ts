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
  SalesCode,
  TaggedUtterance,
  ThresholdBand,
} from "./types";
import { CLINICAL_CODES, MI_CODES, SALES_CODES } from "./types";

const SALES_CODE_DEFINITIONS: Record<SalesCode, string> = {
  open_question:
    "A question that invites the buyer to explain in their own words (What/How/Tell me/Walk me through…). 'Can you tell me about…' is OPEN.",
  closed_question:
    "A question answerable with yes/no, a number or a single fact (Do you…? How many beds? Is that in this year's budget?).",
  leading_question:
    "A question that presumes or sells its own answer. Code it IN ADDITION to the question type. Includes tag questions (…, right?), questions that state the seller's conclusion for the buyer to agree with (Wouldn't it be great if…? You'd agree that saving time matters?), and questions that are really a pitch (What if I told you our platform cuts wait times by 30%?).",
  impact_question:
    "A question about the CONSEQUENCE or COST of a problem the buyer mentioned — money, time, staff, patients, customers, risk, or what happens if nothing changes (What does that cost you each month? How does that affect your team? What happens if it's still like this next year?). Code IN ADDITION to the question type.",
  reflection:
    "A statement (not a question) that mirrors or interprets what the buyer just said, including their feeling (So the night shift is where it backs up. It sounds like the last vendor left you holding the bag.).",
  summary:
    "A statement that gathers THREE or more things the buyer said — needs, constraints, priorities — usually to check understanding before moving on. Code summary instead of reflection.",
  pitch:
    "The seller PRESENTS the offering: describes their product, service, company or startup, its features, benefits, results, pricing, clients or credentials (Our platform does…, We've helped 40 hospitals…, It costs…). A one-sentence introduction of who the seller is in the greeting is NOT a pitch. Code once per utterance.",
  tailored_pitch:
    "A pitch that explicitly links what is offered to a specific need, problem or priority the BUYER stated earlier in the conversation, ideally in the buyer's words (You mentioned discharges stall after 6 p.m. — that's exactly where…). Code IN ADDITION to pitch. A generic benefit not tied to something the buyer said is NOT tailored_pitch.",
  objection_explored:
    "After the buyer raises a concern or objection (price, risk, timing, a past bad experience, 'we already have something'), the seller acknowledges it or asks about it BEFORE answering (That's fair — what happened with the last vendor? What would you need to see to feel safe about that?).",
  objection_rebutted:
    "After the buyer raises a concern or objection, the seller immediately argues, contradicts, minimizes or discounts it without first exploring it (That won't happen with us. Actually our price is very competitive. I can give you 20% off.).",
  next_step_ask:
    "Proposes or asks for a specific next step — a follow-up meeting, a pilot, a demo with named people, a date (Could we set 30 minutes next Tuesday with your CFO?). 'I'll send some information' alone does NOT count.",
};

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
  "sales-discovery": SALES_CODE_DEFINITIONS,
};


export function codesForStyle(style: PersonaStyle): readonly BehaviorCode[] {
  if (style === "sales-discovery") return SALES_CODES;
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

export const SALES_TARGET_SOURCE =
  "Practice target for this tool, not a validated cut-off. Grounded in SPIN-style discovery (Rackham, 1988: more problem and implication questions, fewer early feature statements in successful calls) and call-recording analyses that put strong sellers at well under half the talk time in discovery (e.g. Gong Labs, 2017).";

/**
 * Transcript-level counts for a sales call, added to `counts` so every
 * derived number still traces to the stored counts:
 * - `seller_words` / `buyer_words`: word counts over the conversation
 *   (canned opener excluded) — the talk ratio is model-free.
 * - `first_pitch_turn`: 1-based seller turn of the first `pitch` code, 0 when
 *   the seller never pitched.
 * - `questions_before_first_pitch`: seller turns carrying a question code
 *   before that turn (all of them when the seller never pitched).
 */
export function salesTranscriptCounts(
  turns: Array<{ role: string; content: string }>,
  tagged: TaggedUtterance[],
): Record<string, number> {
  const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);
  let seller = 0;
  let buyer = 0;
  for (const turn of turns) {
    const text = turn.content.trim();
    if (!text) continue;
    if (turn.role === "user") {
      if (CANNED_OPENER.test(text)) continue;
      seller += words(text);
    } else if (turn.role === "assistant") {
      buyer += words(text);
    }
  }
  const isQuestion = (u: TaggedUtterance) =>
    u.codes.includes("open_question") || u.codes.includes("closed_question");
  const firstPitch = tagged.findIndex((u) => u.codes.includes("pitch"));
  const before = firstPitch === -1 ? tagged : tagged.slice(0, firstPitch);
  return {
    seller_words: seller,
    buyer_words: buyer,
    first_pitch_turn: firstPitch === -1 ? 0 : firstPitch + 1,
    questions_before_first_pitch: before.filter(isQuestion).length,
  };
}

function deriveSalesMetrics(counts: Record<string, number>): DerivedMetric[] {
  const c = (k: string) => counts[k] ?? 0;
  const qBefore = c("questions_before_first_pitch");
  const buyerShare = percent(c("buyer_words"), c("buyer_words") + c("seller_words"));
  const questions = c("open_question") + c("closed_question");
  const pctOq = percent(c("open_question"), questions);
  const pctTailored = percent(c("tailored_pitch"), c("pitch"));
  return [
    {
      key: "questions_before_first_pitch",
      label: "Questions before your first pitch",
      value: qBefore,
      format: "count",
      threshold: { fair: 3, good: 5, source: SALES_TARGET_SOURCE },
      band: band(qBefore, 3, 5),
      note:
        c("first_pitch_turn") === 0
          ? "You never presented the offering — every question came first."
          : `Your first pitch came on your turn ${c("first_pitch_turn")}. Pitching before you know the buyer's problem makes the offer generic.`,
    },
    {
      key: "buyer_talk_share",
      label: "Buyer's share of the talking",
      value: buyerShare,
      format: "percent",
      // Calibrated lower than the real-call figure (buyers ~55-60%) because
      // the avatar answers in a few sentences; see docs/sales/feasibility.md.
      threshold: { fair: 40, good: 55, source: SALES_TARGET_SOURCE },
      band: band(buyerShare, 40, 55),
      note: "Counted in words from the transcript. In discovery, the buyer should do most of the talking.",
    },
    {
      key: "percent_open_questions",
      label: "Open questions",
      value: pctOq,
      format: "percent",
      threshold: { fair: 40, good: 60, source: SALES_TARGET_SOURCE },
      band: band(pctOq, 40, 60),
      note: "Open questions let the buyer tell you what matters; closed questions confirm details.",
    },
    {
      key: "percent_tailored_pitches",
      label: "Pitches tied to a stated need",
      value: pctTailored,
      format: "percent",
      threshold: { fair: 50, good: 75, source: SALES_TARGET_SOURCE },
      band: band(pctTailored, 50, 75),
      note: "Of the turns where you presented, how many linked the offer to something the buyer had said.",
    },
    {
      key: "reflections_and_summaries",
      label: "Reflections and summaries",
      value: c("reflection") + c("summary"),
      format: "count",
      note: "Playing back what the buyer said shows you listened and lets them correct you.",
    },
    {
      key: "impact_questions",
      label: "Impact questions",
      value: c("impact_question"),
      format: "count",
      note: "Questions about what the problem costs. They turn a nuisance into a reason to act.",
    },
    {
      key: "objections_rebutted",
      label: "Objections rebutted",
      value: c("objection_rebutted"),
      format: "count",
      note: "Arguing with a concern before exploring it. Aim for zero.",
    },
  ];
}

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

  if (style === "sales-discovery") return deriveSalesMetrics(counts);

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
    .replace(/^(clinician|counselor|patient|client|student|seller|buyer)\s*:\s*/i, "")
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

export function isSalesCode(code: string): code is SalesCode {
  return (SALES_CODES as readonly string[]).includes(code);
}

export function isMiCode(code: string): code is MiCode {
  return (MI_CODES as readonly string[]).includes(code);
}
