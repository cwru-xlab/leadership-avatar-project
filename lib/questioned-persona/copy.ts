/**
 * Student-facing copy for questioned-persona types. Client-safe: nothing
 * here comes from a persona card.
 */

import type { PersonaStyle } from "./types";

export const CLINICAL_DISCLAIMER =
  "Communication practice only. The patient and their medical details are fictional and simplified; nothing in this session or its report is clinical guidance, a diagnosis, or a treatment recommendation.";

export const MI_DISCLAIMER =
  "Counseling-skills practice only. The client is fictional. If anything here touches something you are going through yourself, please reach out to University Counseling Services or call or text 988.";

export function disclaimerFor(style: PersonaStyle): string {
  return style === "clinical-communication" ? CLINICAL_DISCLAIMER : MI_DISCLAIMER;
}

export const PERSONA_STYLE_COPY: Record<
  PersonaStyle,
  {
    label: string;
    listTitle: string;
    listIntro: string;
    heroDescription: string;
    reportLabel: string;
    briefingIntro: string;
    briefingFootnote: string;
    checkInLead: string;
  }
> = {
  "clinical-communication": {
    label: "Clinical communication",
    listTitle: "Clinical communication",
    listIntro:
      "Take a history from a standardized patient. They hold some things back until you ask the right way.",
    heroDescription:
      "A live encounter: the patient answers in character and only tells you what you ask about well. Then a checklist and behavior-count report.",
    reportLabel: "Clinical communication",
    briefingIntro:
      "Read the referral. The patient knows more than this — what they tell you depends on how you ask.",
    briefingFootnote:
      "Some of the history, and what the patient is really worried about, only comes out if you ask. Listen for cues.",
    checkInLead: "In a real patient encounter",
  },
  "motivational-interviewing": {
    label: "Motivational interviewing",
    listTitle: "Motivational interviewing",
    listIntro:
      "Counsel a client who is of two minds about a change. Every question and reflection you use is coded MITI-style.",
    heroDescription:
      "A live counseling session: the client is ambivalent and pushes back if pushed. Then MITI-style global scores and coded behavior counts.",
    reportLabel: "Motivational interviewing",
    briefingIntro:
      "Read the referral. The client's own reasons for change are there to be found — if you evoke them rather than supply them.",
    briefingFootnote:
      "Arguing for change usually strengthens the other side. Reflect, ask, affirm — and leave the choice with them.",
    checkInLead: "In a real counseling session",
  },
};
