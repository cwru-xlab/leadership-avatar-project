# Courageous Conversations feedback and the "five moves"

Client question (2026-11-14): *Has the feedback in the difficult-conversations module been adjusted to the Crucial Conversations framework: find shared or common ground, share facts and observations, frame the concern, lead with inquiry, create a next step or pathway forward?*

## Short answer (for the client)

Not yet in so many words. Until now the module scored four general conversation skills: Clarity, Empathy, Holding the line and Objective achieved. Those skills already touched facts, the concern and listening, but common ground and a concrete next step were never checked directly. We have built an update, currently in review, that grades every session against your five moves by name: find common ground, share facts and observations, frame the concern, lead with inquiry, and create a next step. For each move the report now shows Hit or Missed, the student's own words with a timestamp, and one line of coaching, such as a phrase they could have used at that point. The checklist follows the principles of the Crucial Conversations model, but it uses our own wording, not the book's proprietary language.

## What the module graded before this change (branch base `90eb8fe`)

The `difficult-conversation` type (shown to students as "Courageous Conversations") had eight scored dimensions: four shared ones (Visual, Vocal, Content, Behavioral) and four specific to this module, defined in `lib/difficult-conversation/conversation-type.ts:34-61`. The evaluator scored them using `CONVERSATION_EVALUATOR_PROMPT` in `lib/difficult-conversation/conversation-prompts.ts:238-322`. The report showed the score cards, a summary, strengths and growth areas, the outcome record and the character's in-role reaction. Nothing in the report or the prompt named any of the client's five moves.

The live character also reacts to these behaviors. It softens when the student "is specific, acknowledge[s] your position, and separate[s] the problem from the person" (`conversation-prompts.ts:111`). So the character responds to the behavior, but the feedback never named it.

| Client's element | Closest existing criterion (pre-change) | Coverage |
|---|---|---|
| Find common ground / shared purpose | None. Empathy (`conversation-prompts.ts:246`) is about acknowledging the other person's position, not naming a goal you share. The only "common ground" in the code is the `noCommonGround` disengagement signal (`conversation-type.ts`, weight 0.05). It decides whether the character walks out and is never graded as feedback. | **None** |
| Share facts and observations | Clarity (`conversation-prompts.ts:244`): "Was the problem, the expectation or the ask stated unambiguously…". It rewards a clear ask, not specific facts before judgments. The live prompt rewards being "specific" (`:111`), but nothing grades it. | **Partial** |
| Frame the concern | Clarity (`:244`), "the problem … stated unambiguously". Neither impact nor blame-free framing is checked. | **Partial** |
| Lead with inquiry | Empathy (`:246`): "acknowledge and respond to the other person's position … Acknowledging is not agreeing." It rewards responding but does not require asking open questions. | **Partial** |
| Create a next step / pathway forward | Objective achieved (`:250`) scores how well the student pursued the objective. Some seeded objectives mention a "path forward" (`seeded.ts`, confront-low-performer), but no criterion asks for who/what/when. | **Partial (weak)** |

## What the Crucial Conversations model has beyond the client's list

All five of the client's moves fit the model (Patterson, Grenny, McMillan & Switzler). The model also includes ideas the client's list does not:

- **Start with heart:** know what you really want for yourself, the other person and the relationship before you speak. This is preparation, so a transcript can't grade it, but a briefing could prompt for it.
- **Notice when it stops feeling safe:** spot the moment the other person goes silent or turns hostile, and step out of the content to restore safety. This includes apologizing, or clarifying what you do and don't mean. The engine already detects hostility and stonewalling, but only to decide whether the character walks out.
- **Separate facts from your story:** share the facts first, then your interpretation, and say it tentatively ("I'm starting to wonder…"), not as a verdict.
- **Invite the opposite view:** actively ask to be challenged ("What am I missing?"). Our "Lead with inquiry" move partly covers this.
- **Explore the other person's path:** asking, mirroring, paraphrasing and priming.
- **Decide how decisions get made, then document:** who does what by when, and how you will follow up. Our "Create a next step" criteria require at least two of who/what/when/follow-up.

Trademark note: "Crucial Conversations" and its acronyms are proprietary. Our step text says the moves are *aligned with* those principles and paraphrases them. It does not copy the book's phrasing or acronyms.

## Recommended change (prototyped on branch `loop/dc-crucial`)

Add the five moves to the evaluation and the report as a **named, graded checklist**, alongside the existing scores, not in place of them.

- `lib/difficult-conversation/framework.ts` (new) defines the `COURAGEOUS_CONVERSATION_FRAMEWORK` checklist, with five steps (`common_ground`, `facts_observations`, `frame_concern`, `lead_with_inquiry`, `next_step`), each with student-facing text and evaluator "counts as hit" criteria. It uses the existing `ProcessFramework` contract that the case/PM interviews and the clinical/MI checklists already use.
- The evaluator prompt gains a "five moves" section. Each move is graded hit, missed or not_applicable, with a verbatim quote, a timecode and one coaching sentence, and is written to a new optional outcome field, `conversationSteps`. The prompt also links the moves to the existing scores: facts and the concern feed Clarity, common ground and inquiry feed Empathy, and a next step feeds Objective achieved.
- The report adds a new **"The five moves"** panel (`components/practice/report/ConversationStepsPanel.tsx`) as the first section below the summary. It reuses the problem-interview checklist body, which is now exported as `ProcessStepsSection`.
- Compatibility: the rubric dimensions, their keys, mastery mapping and score cards are unchanged. The new outcome field is optional, so reports graded earlier have no checklist and render exactly as before. The quote sanitizer also applies to the new field's quotes.

Further options not built here, for the user to decide:
1. Replace the four extra dimensions with five scored 1–5 dimensions named after the moves. That changes the score cards and mastery competencies, and would need a mapping for old reports.
2. Add a short pre-session briefing tip listing the five moves.
3. Add a sixth move for "restore safety when it gets heated", from the Crucial Conversations material.
