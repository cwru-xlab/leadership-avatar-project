/**
 * Golden transcripts for the questioned-persona grading validity study
 * (`scripts/verify-questioned-persona-grading.ts`). Each student line carries
 * the HAND-CODED behavior codes (one code at most once per utterance, the rule
 * the tagger follows). Expected counts are derived from these codes by the
 * same `countCodes` the product uses, so the comparison is code-vs-code.
 *
 * Hand coding by the author against the definitions in
 * `lib/questioned-persona/coding.ts` (MITI 4.2.1 for MI). Not yet
 * double-coded by a trained human rater — see the validity doc.
 */

import type { BehaviorCode } from "@/lib/questioned-persona/types";

type Line =
  | { s: string; codes: BehaviorCode[] }
  | { p: string };

export interface GoldenTranscript {
  id: string;
  caseId: string;
  description: string;
  lines: Line[];
  /** Checklist steps whose status must match on every run. */
  expectSteps: Record<string, "hit" | "missed">;
  /** Hidden facts whose elicitation must match on every run. */
  expectFacts: Record<string, boolean>;
  /** MI only: expected range of the MITI global scores (inclusive). */
  expectGlobals?: Record<string, [number, number]>;
}

export const GOLDEN: GoldenTranscript[] = [
  {
    id: "cc-strong",
    caseId: "cc-chest-tightness-urgent-care",
    description: "Strong clinical encounter: agenda, open-to-closed, ICE, empathy to cues, summary, plain explanation, teach-back, safety-net.",
    lines: [
      { s: "Hi, I'm Sam, one of the physician assistant students working with Dr. Patel today. Are you Daniel Ortiz?", codes: ["agenda_setting", "closed_question"] },
      { p: "Yeah, that's me." },
      { s: "Thanks for coming in. What brings you in today?", codes: ["open_question"] },
      { p: "I've been getting this tightness in my chest the last few weeks. Probably heartburn. My wife made me come." },
      { s: "Before we dig into that, what else, if anything, did you want to cover today?", codes: ["agenda_setting", "open_question"] },
      { p: "No, just this. I really can't be off work right now — we're behind on two jobs." },
      { s: "It sounds like work is putting a lot of pressure on you right now.", codes: ["reflection", "empathy_statement"] },
      { p: "Yeah. The crew needs me. Money's tight." },
      { s: "That's a lot to carry. Tell me more about the chest tightness — what does it feel like?", codes: ["empathy_statement", "open_question"] },
      { p: "Like a strap across my chest. Pressure." },
      { s: "What are you usually doing when it comes on?", codes: ["open_question"] },
      { p: "Now that you mention it, climbing ladders or the stairs at the supply yard. Never when I'm sitting." },
      { s: "How long does it usually last?", codes: ["closed_question"] },
      { p: "A few minutes. Goes away when I stop." },
      { s: "Does anyone in your family have heart problems?", codes: ["closed_question"] },
      { p: "My dad died of a heart attack at 52. On a job site." },
      { s: "I'm so sorry. That must make this tightness feel pretty frightening.", codes: ["empathy_statement"] },
      { p: "Yeah... I'm about the age where... well. Anyway." },
      { s: "What's been going through your mind about what this might be?", codes: ["open_question"] },
      { p: "I keep telling myself it's heartburn. But honestly I'm scared it's my heart, like Dad." },
      { s: "What were you hoping we could do for you today?", codes: ["open_question"] },
      { p: "Honestly? Get something for heartburn and get back to work." },
      { s: "Do you take any medications, or have you been prescribed any in the past?", codes: ["closed_question"] },
      { p: "I had a blood pressure pill a couple years back. Stopped taking it about six months ago, I felt fine." },
      { s: "Do you smoke at all?", codes: ["closed_question"] },
      { p: "Half a pack a day. Thirty years." },
      { s: "Let me check I've got this right: for three weeks you've had pressure across your chest that comes on when you climb ladders or stairs and eases when you rest, your dad had a heart attack at 52, you stopped your blood pressure pill, and you're worried this could be your heart. Did I miss anything?", codes: ["summary", "closed_question"] },
      { p: "No, that's it." },
      { s: "Thank you. Because the tightness comes on when you exert yourself, I don't want to just treat it as heartburn. I'd like the doctor to see you now. We'll probably do a heart tracing — a painless test with stickers on your chest that shows how your heart is working — and some blood tests.", codes: ["information_giving"] },
      { p: "Today? I really need to get back." },
      { s: "I hear that the job matters a lot to you. How would it feel to get this checked today so you're not left wondering?", codes: ["reflection", "open_question"] },
      { p: "I guess. My wife would kill me if I didn't." },
      { s: "Just so I know I explained it clearly, can you tell me in your own words what's going to happen next?", codes: ["teach_back", "open_question"] },
      { p: "The doctor sees me, I get the sticker test and the blood work, and I don't go up any ladders today." },
      { s: "Exactly. If the tightness comes back while you're waiting and doesn't go away with rest, tell someone straight away. What questions do you have for me?", codes: ["information_giving", "open_question"] },
      { p: "No, I think I'm good." },
    ],
    expectSteps: {
      greet_introduce: "hit",
      open_agenda: "hit",
      elicit_ice: "hit",
      respond_to_cues: "hit",
      summarize: "hit",
      teach_back: "hit",
      close_safety_net: "hit",
    },
    expectFacts: { exertional_trigger: true, family_history: true, stopped_bp_meds: true, smoking: true },
  },
  {
    id: "cc-closed-heavy",
    caseId: "cc-chest-tightness-urgent-care",
    description: "Closed-question checklist: no agenda, no ICE, ignores the work cue, jargon and premature reassurance at the end.",
    lines: [
      { s: "Hi. You're here for chest pain?", codes: ["closed_question"] },
      { p: "Tightness, yeah. Probably heartburn." },
      { s: "How long has it been going on?", codes: ["closed_question"] },
      { p: "About three weeks." },
      { s: "Is it sharp or dull?", codes: ["closed_question"] },
      { p: "More like pressure." },
      { s: "Does it go to your arm or jaw?", codes: ["closed_question"] },
      { p: "No." },
      { s: "Any shortness of breath?", codes: ["closed_question"] },
      { p: "Not really." },
      { s: "Do you smoke?", codes: ["closed_question"] },
      { p: "Half a pack a day." },
      { s: "Any family history of heart disease?", codes: ["closed_question"] },
      { p: "My dad had a heart attack. Died at 52." },
      { s: "Do you take any medications?", codes: ["closed_question"] },
      { p: "I was on a blood pressure pill but I stopped it about six months ago." },
      { s: "Is it worse when you exert yourself?", codes: ["closed_question"] },
      { p: "Yeah, on ladders and stairs. Look, I really can't be off work right now." },
      { s: "Any nausea or sweating with it?", codes: ["closed_question"] },
      { p: "No." },
      { s: "Okay, you need an ECG and troponins to rule out ACS. The doctor will be in shortly.", codes: ["information_giving", "jargon"] },
      { p: "A what?" },
      { s: "Just some tests. Don't worry, it's probably nothing.", codes: ["information_giving", "premature_reassurance"] },
      { p: "Okay..." },
    ],
    expectSteps: {
      open_agenda: "missed",
      elicit_ice: "missed",
      respond_to_cues: "missed",
      summarize: "missed",
      plain_explanation: "missed",
      teach_back: "missed",
    },
    expectFacts: { family_history: true, smoking: true },
  },
  {
    id: "cc-misses-ice-cues",
    caseId: "cc-dental-anxiety",
    description: "Reasonable opening and history, but never asks ideas/concerns/expectations, ignores both cues, explains in jargon.",
    lines: [
      { s: "Hello, I'm Jordan, a third-year dental student. What brings you in today?", codes: ["agenda_setting", "open_question"] },
      { p: "Yeah, so, this back tooth on the left has been killing me for about a week." },
      { s: "Tell me more about the pain.", codes: ["open_question"] },
      { p: "It started when I bit down on something hard. Cold drinks make it shoot. No offense, I'm not really big on dentists." },
      { s: "Which tooth exactly, upper or lower?", codes: ["closed_question"] },
      { p: "Lower left, in the back." },
      { s: "Have you taken anything for it?", codes: ["closed_question"] },
      { p: "Ibuprofen, like four times a day this week." },
      { s: "Do you have any medical conditions or allergies?", codes: ["closed_question"] },
      { p: "No." },
      { s: "Do you grind your teeth at night?", codes: ["closed_question"] },
      { p: "My partner says I grind them, yeah. Work has been really stressful since the promotion." },
      { s: "How much is it hurting on a scale of 0 to 10?", codes: ["closed_question"] },
      { p: "Like a seven. How much is all this going to run me, anyway?" },
      { s: "We'll go over fees at the front desk. So it sounds like you've got a cracked lower molar with possible pulpal involvement, probably from bruxism.", codes: ["information_giving", "jargon"] },
      { p: "Okay..." },
      { s: "We'll take a periapical radiograph and then probably do an endo or an extraction depending on what we see.", codes: ["information_giving", "jargon"] },
      { p: "Wait, you're going to drill today?" },
      { s: "Let's see what the X-ray shows first. Any questions?", codes: ["information_giving", "closed_question"] },
      { p: "I guess not." },
    ],
    expectSteps: {
      greet_introduce: "hit",
      elicit_ice: "missed",
      respond_to_cues: "missed",
      plain_explanation: "missed",
      teach_back: "missed",
    },
    expectFacts: { painkiller_use: true, grinding: true, childhood_trauma: false },
  },
  {
    id: "mi-strong",
    caseId: "mi-college-drinking",
    description: "MI-consistent: complex reflections, open questions, permission, affirmations, double-sided summary, autonomy.",
    lines: [
      { s: "Hi Jordan, thanks for coming in. How's the semester going overall?", codes: ["open_question"] },
      { p: "Fine, I guess. Busy. I'm here because of the citation. I'm honestly not sure what there is to talk about." },
      { s: "You didn't choose to be here, and you're not convinced this is worth your time.", codes: ["complex_reflection"] },
      { p: "Pretty much. Everyone drinks in college. I'm not some alcoholic." },
      { s: "You don't see yourself as someone with a drinking problem, and it's frustrating to be treated like one.", codes: ["complex_reflection"] },
      { p: "Yeah. I mean, some nights get out of hand, but that's college." },
      { s: "Would it be okay if we talked a bit about how drinking fits into your life — the good parts and the not-so-good parts?", codes: ["seeking_collaboration", "closed_question"] },
      { p: "Sure, whatever." },
      { s: "What do you like about drinking?", codes: ["open_question"] },
      { p: "It's how I unwind. And it's how the team hangs out." },
      { s: "It helps you unwind, and it's how the team hangs out.", codes: ["simple_reflection"] },
      { p: "Exactly." },
      { s: "And what are the not-so-good parts, from your point of view?", codes: ["open_question"] },
      { p: "My grades have been worse this semester, and the Monday hangovers don't help." },
      { s: "Your grades really matter to you, and you're noticing the weekends are costing you on Mondays.", codes: ["complex_reflection"] },
      { p: "Yeah. I'm trying to get into the nursing program. It needs a 3.3." },
      { s: "You've worked hard to stay on the pre-nursing track — that says a lot about how much you want this.", codes: ["affirm"] },
      { p: "I want to be a nurse like my aunt. She's amazing." },
      { s: "Tell me about a time drinking went further than you planned.", codes: ["open_question"] },
      { p: "...A month ago I blacked out. Woke up and didn't know how I got home. Kind of freaked me out." },
      { s: "Waking up not knowing how you got home shook you more than you've let anyone see.", codes: ["complex_reflection"] },
      { p: "Yeah. Nobody knows." },
      { s: "So on one hand, drinking is how you unwind and stay close to the team, and on the other, it's costing you on grades, it scared you last month, and it could get in the way of becoming a nurse.", codes: ["complex_reflection"] },
      { p: "When you put it like that... yeah." },
      { s: "It's completely your call what, if anything, you do about it. What do you think you might want to do?", codes: ["emphasizing_autonomy", "open_question"] },
      { p: "Maybe not drink on nights before class. Stick to like two on the weekend." },
      { s: "That's a plan that comes from you, and it fits what you care about.", codes: ["affirm"] },
      { p: "I guess. I could try." },
    ],
    expectSteps: {
      ask_permission: "hit",
      explore_ambivalence: "hit",
      roll_with_sustain_talk: "hit",
      summarize: "hit",
      emphasize_autonomy: "hit",
    },
    expectFacts: { blackout: true, nursing_goal: true, younger_brother: false },
    expectGlobals: {
      cultivating_change_talk: [4, 5],
      softening_sustain_talk: [4, 5],
      partnership: [4, 5],
      empathy: [4, 5],
    },
  },
  {
    id: "mi-closed-heavy",
    caseId: "mi-smoking-cessation",
    description: "Question-and-answer intake: almost all closed questions, one simple reflection, no evocation.",
    lines: [
      { s: "Hi Linda. Do you still smoke?", codes: ["closed_question"] },
      { p: "If this is about the smoking, I already know. Everyone tells me." },
      { s: "How many a day?", codes: ["closed_question"] },
      { p: "About a pack." },
      { s: "Have you tried to quit before?", codes: ["closed_question"] },
      { p: "Yeah. Patches, five years ago. Lasted four months, gained fifteen pounds." },
      { s: "Did you try the gum?", codes: ["closed_question"] },
      { p: "No." },
      { s: "Are you ready to quit now?", codes: ["closed_question"] },
      { p: "Not really. It's the only five minutes a day that's mine." },
      { s: "Is that because of stress?", codes: ["closed_question"] },
      { p: "Sure." },
      { s: "Does anyone else at home smoke?", codes: ["closed_question"] },
      { p: "My husband." },
      { s: "Would you be willing to set a quit date?", codes: ["closed_question"] },
      { p: "I don't know. Maybe." },
      { s: "So you smoke a pack a day, you quit with patches before, and your husband smokes.", codes: ["simple_reflection"] },
      { p: "That's about it." },
    ],
    expectSteps: {
      evoke_change_talk: "missed",
      values_link: "missed",
      emphasize_autonomy: "missed",
    },
    expectFacts: { failed_patches: true, husband_smokes: true, granddaughter_asthma: false },
    expectGlobals: { cultivating_change_talk: [1, 2], partnership: [1, 3] },
  },
  {
    id: "mi-righting-reflex",
    caseId: "mi-cardiac-rehab",
    description: "Confrontational righting reflex: warnings, arguing, persuasion without permission, no reflections.",
    lines: [
      { s: "Frank, you've missed three sessions. You know that's not okay after a heart attack, right?", codes: ["confront", "closed_question"] },
      { p: "I know, I know. I've been skipping. I feel fine, honestly." },
      { s: "Feeling fine doesn't mean your heart is fine. People who skip rehab are much more likely to have another heart attack.", codes: ["confront", "persuade"] },
      { p: "Rehab's for people a lot worse off than me." },
      { s: "That's just not true. You need to go — your cardiologist ordered it.", codes: ["confront", "persuade"] },
      { p: "It's a forty-minute drive for twenty minutes of walking." },
      { s: "You could carpool or take the bus. Lots of people make it work.", codes: ["persuade"] },
      { p: "I worked with my hands forty years, I know my body." },
      { s: "Do you want to have another heart attack?", codes: ["closed_question", "confront"] },
      { p: "Of course not. But I'm not going to be babysat." },
      { s: "Your wife is worried sick. You should think about her.", codes: ["persuade"] },
      { p: "Carmen reminds me every day, believe me." },
      { s: "Can you commit to going on Monday?", codes: ["closed_question"] },
      { p: "We'll see." },
      { s: "I'll put you down for Monday at nine.", codes: ["giving_information"] },
      { p: "Fine." },
    ],
    expectSteps: {
      roll_with_sustain_talk: "missed",
      emphasize_autonomy: "missed",
      ask_permission: "missed",
    },
    expectFacts: { daughter_wedding: false, embarrassed_winded: false },
    expectGlobals: {
      cultivating_change_talk: [1, 2],
      softening_sustain_talk: [1, 2],
      partnership: [1, 2],
      empathy: [1, 2],
    },
  },
];

/** Builds stored-transcript turns (60 s apart) from a golden. */
export function goldenTurns(g: GoldenTranscript, startedAt = 1_700_000_000_000) {
  return g.lines.map((line, i) => ({
    role: ("s" in line ? "user" : "assistant") as "user" | "assistant",
    content: "s" in line ? line.s : line.p,
    timestamp: startedAt + (i + 1) * 30_000,
  }));
}
