/**
 * The two checklists questioned-persona sessions are graded against, in the
 * problem-interview `ProcessFramework` shape so the step contract (and its
 * `ProcessStepResult` verdicts) is shared rather than re-invented.
 *
 * `nudge` is required by that contract, but there is no interviewer here to
 * nudge — the avatar is the patient or client. It holds the line the persona
 * may say if the student stalls, written so it never names the step. Steps
 * are graded `hit` / `missed` / `not_applicable`; `prompted` does not apply.
 */

import type { ProcessFramework } from "@/lib/problem-interview/types";

export const CALGARY_CAMBRIDGE_FRAMEWORK: ProcessFramework = {
  key: "calgary-cambridge",
  label: "Calgary–Cambridge consultation checklist",
  source:
    "Calgary–Cambridge Guide to the medical interview (Kurtz, Silverman & Draper; Silverman, Kurtz & Draper, Skills for Communicating with Patients, 3rd ed., 2013), cross-checked against the SEGUE Framework (Makoul, 2001, Patient Educ Couns 45:23–34) and the Kalamazoo Consensus Statement (Acad Med 2001;76:390–393).",
  steps: [
    {
      key: "greet_introduce",
      label: "Greet and introduce yourself",
      description: "Greets the patient, gives name and role, and confirms who the patient is.",
      evidenceCriteria:
        "The student greets the patient and states their own name or role (e.g. 'I'm Sam, one of the nurses'). Confirming the patient's name also counts toward this step.",
      nudge: "Sorry — who are you, exactly?",
    },
    {
      key: "open_agenda",
      label: "Open question and full agenda",
      description: "Starts with an open question and screens for every concern before going into detail.",
      evidenceCriteria:
        "Early in the visit the student asks an open question about why the patient came (e.g. 'What brings you in today?') AND checks for further concerns before narrowing (e.g. 'Is there anything else you wanted to discuss?'). Hit requires both; an open opener alone is missed only if it is followed immediately by closed questioning with no screening.",
      nudge: "There was something else, but it can probably wait.",
    },
    {
      key: "patient_narrative",
      label: "Let the patient tell the story",
      description: "Encourages the patient's own account before switching to closed questions (the open-to-closed cone).",
      evidenceCriteria:
        "At least two open or facilitative prompts (e.g. 'Tell me more about that', 'What happened next?') before a run of closed questions, and no interruption of the patient's account.",
      nudge: "It's kind of a long story.",
    },
    {
      key: "history_detail",
      label: "Clarify the presenting problem",
      description: "Explores onset, character, timing, severity and associated features of the main problem.",
      evidenceCriteria:
        "The student asks about at least three of: onset, character/quality, timing/pattern, severity, triggers or relieving factors, associated symptoms — about the main complaint.",
      nudge: "I don't know how to describe it really.",
    },
    {
      key: "elicit_ice",
      label: "Ideas, concerns and expectations",
      description: "Asks what the patient thinks is going on, what worries them, and what they hope for from the visit.",
      evidenceCriteria:
        "The student explicitly asks about at least two of: the patient's own ideas about the cause ('What do you think might be going on?'), their concerns or worries ('Is anything worrying you about this?'), their expectations ('What were you hoping we could do today?'). Hit only when asked; the patient volunteering it does not count.",
      nudge: "I guess I've been wondering about it a lot.",
    },
    {
      key: "respond_to_cues",
      label: "Pick up emotional cues",
      description: "Notices the patient's verbal cues of worry or distress and responds with empathy before moving on.",
      evidenceCriteria:
        "When the patient drops an emotional cue (worry, fear, frustration, embarrassment), the student names, acknowledges or explores it (e.g. 'It sounds like that's been worrying you') rather than continuing a checklist of questions.",
      nudge: "Anyway. It's fine.",
    },
    {
      key: "summarize",
      label: "Summarize back",
      description: "Summarizes what the patient said to check understanding before moving on.",
      evidenceCriteria:
        "The student offers a summary of at least two things the patient said and invites correction (e.g. 'So, let me check I've got this right…').",
      nudge: "Did I explain that okay?",
    },
    {
      key: "plain_explanation",
      label: "Explain in plain language",
      description: "Gives information in small chunks, in lay terms, and explains or avoids jargon.",
      evidenceCriteria:
        "When the student explains next steps, they use plain language, explain any technical term they use, and give information in manageable pieces. Missed if technical terms go unexplained or there is no explanation at all.",
      nudge: "What happens now?",
    },
    {
      key: "shared_plan",
      label: "Involve the patient in the plan",
      description: "Offers options or asks for the patient's view and agreement on next steps.",
      evidenceCriteria:
        "The student invites the patient's opinion on the plan, offers a choice, or checks agreement (e.g. 'How does that sound to you?'), taking the patient's expectations into account.",
      nudge: "Do I get a say in this?",
    },
    {
      key: "teach_back",
      label: "Check understanding (teach-back)",
      description: "Asks the patient to say back the key points in their own words.",
      evidenceCriteria:
        "The student asks the patient to explain back the plan or key information in their own words (e.g. 'Just so I know I explained it well, can you tell me what you'll do when you get home?'). 'Do you understand?' or 'Any questions?' alone does NOT count.",
      nudge: "Okay, I think I got most of that.",
    },
    {
      key: "close_safety_net",
      label: "Close and safety-net",
      description: "Closes with next steps, when to seek help sooner, and a final check for questions.",
      evidenceCriteria:
        "The student closes the encounter by stating next steps and either what should prompt the patient to come back sooner (safety-netting) or a final 'what questions do you have?'.",
      nudge: "So… are we done?",
    },
  ],
};

export const MI_PROCESS_FRAMEWORK: ProcessFramework = {
  key: "mi-processes",
  label: "Motivational interviewing process checklist",
  source:
    "Miller & Rollnick, Motivational Interviewing: Helping People Change and Grow, 4th ed. (2023) — the four processes (engaging, focusing, evoking, planning) and OARS skills; behavior definitions follow MITI 4.2.1 (Moyers, Manuel & Ernst, 2014).",
  steps: [
    {
      key: "engage",
      label: "Engage before focusing",
      description: "Builds a working relationship with open questions and reflections before raising the change topic.",
      evidenceCriteria:
        "In the first few turns, the student asks about the client as a person or about how things are going, and reflects what they hear, before steering to the target behavior.",
      nudge: "So what is it you wanted to talk about?",
    },
    {
      key: "ask_permission",
      label: "Ask permission",
      description: "Asks before raising the target behavior or before offering information or advice.",
      evidenceCriteria:
        "The student asks permission at least once before discussing the target behavior or before giving information or advice (e.g. 'Would it be okay if we talked about…?', 'Can I share something other people have found?').",
      nudge: "Is this the part where you tell me what to do?",
    },
    {
      key: "explore_ambivalence",
      label: "Explore both sides",
      description: "Explores what the client gets from the current behavior as well as their concerns about it.",
      evidenceCriteria:
        "The student asks about or reflects the GOOD things about the status quo (what the client likes about it) as well as the not-so-good things, without arguing either side.",
      nudge: "I mean, it's not all bad, you know.",
    },
    {
      key: "evoke_change_talk",
      label: "Evoke change talk",
      description: "Asks evocative questions about desire, ability, reasons and need for change.",
      evidenceCriteria:
        "The student asks at least two evocative questions that invite the client's own reasons or hopes (e.g. 'What would be different if…?', 'Why might you want to…?', 'On a scale of 0–10, how important…? Why not lower?').",
      nudge: "I don't know. I haven't really thought about why.",
    },
    {
      key: "values_link",
      label: "Connect to the client's values",
      description: "Links change to something the client cares about, in the client's own terms.",
      evidenceCriteria:
        "The student explores or reflects a value or goal the client named (family, career, independence, health) and connects it to the target behavior — using the client's reason, not the counselor's.",
      nudge: "There are things that matter more to me than this, honestly.",
    },
    {
      key: "roll_with_sustain_talk",
      label: "Roll with sustain talk",
      description: "Responds to arguments against change with reflection, not counter-argument.",
      evidenceCriteria:
        "When the client argues for the status quo, the student reflects (simple, amplified or double-sided) or emphasizes autonomy instead of arguing, warning or correcting. Missed if any sustain talk is met with persuasion or confrontation.",
      nudge: "You're going to tell me I'm wrong, aren't you?",
    },
    {
      key: "summarize",
      label: "Offer a summary",
      description: "Collects the client's change talk into a summary, ideally double-sided.",
      evidenceCriteria:
        "The student offers at least one summary that gathers several things the client said — ideally both sides of the ambivalence — and checks it.",
      nudge: "I've said a lot, huh.",
    },
    {
      key: "emphasize_autonomy",
      label: "Emphasize autonomy",
      description: "Makes clear the decision belongs to the client.",
      evidenceCriteria:
        "The student explicitly affirms the client's choice or control (e.g. 'It's really up to you', 'You know yourself best').",
      nudge: "It's my life, isn't it?",
    },
    {
      key: "plan_if_ready",
      label: "Plan only when ready",
      description: "Asks a key question about next steps once the client signals readiness, letting the client set the plan.",
      evidenceCriteria:
        "Once the client shows commitment or activation language, the student asks an open key question (e.g. 'So what, if anything, do you think you'll do?') and lets the client propose the step. Not applicable if the client never signals readiness. Missed if the student prescribes a plan the client did not offer.",
      nudge: "So… now what?",
    },
  ],
};

export function frameworkForStyle(
  style: "clinical-communication" | "motivational-interviewing",
): ProcessFramework {
  return style === "clinical-communication"
    ? CALGARY_CAMBRIDGE_FRAMEWORK
    : MI_PROCESS_FRAMEWORK;
}
