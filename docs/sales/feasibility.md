# Sales conversations (listening first) — feasibility

Client ask (2026-11-14): "another option around 'selling' — meeting with a potential client to sell a
product, a service, your business — it has to evaluate LISTENING first — too many folks in sales
'pitch' without getting to know the client first."

## Verdict

**Feasible and cheap.** Build it as a **third style on the questioned-persona engine** (the engine
behind Clinical communication and Motivational interviewing), slug `sales-discovery`, listed under
**Practice pitches** as **Sales meeting** (decided 2026-11-14: no top-level tile; the case list and
session keep the `/practice/sales-discovery` route). No schema migration, no new session room, no new report page.

## What exists today

| Surface | What it does | Fit for "listen first" selling |
|---|---|---|
| `lib/pitch/*` elevator (`pitch-elevator`) | 60-90 s pitch to a stranger; has a `discovery_tailoring` dimension | Pitch-centric; discovery is one dimension in a short monologue |
| `lib/pitch/product-*` (`pitch-product` deck mode) | Founder presents slides to a skeptical buyer, `objection_handling` dimension | Closest "sales" flow, but it **rewards presenting**: needs slides, buyer reacts to the deck. Opposite of the client's point |
| Networking | Rapport with a stranger | No buyer, no needs to uncover |
| Courageous conversations (difficult-conversation engine) | Hidden position the student must surface | Right mechanics (hidden info), wrong framing/rubric |
| **Questioned persona** (`lib/questioned-persona/*`) — clinical + MI | Persona holds **hidden facts that surface only to good questions**, drops cues, reacts badly to being pushed (MI "reactance rule"). Grading = per-utterance **behavior coding** (model tags, code counts), a **checklist judge** with verbatim evidence, elicited-facts and cues panels, plus rubric dimensions | Almost exactly the sales-discovery problem: a buyer with hidden needs who cools off when pitched at |

The persona engine already gives us, for free: the seeded-case picker (`PersonaCaseList`), briefing
step, the shared session room (camera/capture unchanged), finish path, supplementary analysis slot in
the evaluation runner, report panels (counts, metrics with fair/good bands, checklist, facts, cues),
report chrome, study-plan eligibility, and mastery roll-up via `DIMENSION_TO_COMPETENCY`.

## Options considered

1. **New sales style on the persona engine (recommended).** Adds a style value, a code set, a
   framework, prompts, 4 cases. Everything else is a branch on `style`. ~1 day.
2. Extend `pitch-product`. Would need the buyer to withhold needs, a new rubric, and slides become
   optional — fights the type's whole design (deck upload, slide channel, presenting-first).
3. New engine type from scratch. Duplicates what the persona engine already does. Not justified.

## Scenario model

A sales case is a `PersonaCase` whose `PersonaCard` has `style: "sales-discovery"`:

- **Buyer persona** — name, role, company, setting, opening line, manner.
- **Spontaneous facts** — what any buyer would say (company size, current tool).
- **Hidden facts** = needs, pain points, constraints, decision process. Each has `revealWhen`
  (the discovery question that earns it). Examples: real pain behind the meeting, the cost of the
  problem, budget cycle, who else signs, a past bad vendor experience.
- **Cues / buying signals** — lines the buyer drops ("We've been burned before") that a good
  listener follows up.
- **Objections** — raised when the seller proposes; softened only if explored, not rebutted.
- **Pitch-reaction rule** (sales analogue of MI's reactance rule) — if the seller presents
  features/pricing before understanding the buyer, the buyer gets cooler: shorter answers, checks the
  time, stops volunteering, says "send me something". If the seller asks and reflects, the buyer warms
  and opens up.
- **Next-step condition** — what concrete step the buyer would agree to if they feel understood
  (and the polite brush-off otherwise).

### Scenarios shipped

| Id | Sell | Buyer |
|---|---|---|
| `sales-saas-hospital-ops` | Product: B2B SaaS (patient-flow / bed-management software) | Director of hospital operations |
| `sales-consulting-manufacturer` | Service: operations consulting | Owner of a 60-person precision-parts manufacturer |
| `sales-startup-first-customer` | Your business: your own early-stage startup (meal-planning platform for corporate cafeterias) | Food-service director, potential first customer |
| `sales-device-clinic-manager` | Product: medical device (point-of-care diagnostic analyzer) | Practice manager of a multi-site primary-care clinic |

## Rubric: listening first

Three layers, as for clinical/MI:

**1. Behavior coding (counted in code, not by the model).** Per seller utterance:
`open_question`, `closed_question`, `leading_question`, `impact_question` (cost/consequence of the
problem — SPIN "implication"), `reflection`, `summary`, `pitch` (presents product/service, features,
benefits, pricing, credentials), `tailored_pitch` (a pitch explicitly linked to a need the buyer
stated, coded in addition to `pitch`), `objection_explored`, `objection_rebutted`, `next_step_ask`.

**Derived metrics** (pure arithmetic, `lib/questioned-persona/coding.ts`):

| Metric | How it is measured | Practice target |
|---|---|---|
| Questions before first pitch | Count of question-coded seller turns before the first `pitch`-coded turn (all questions if never pitched) | fair ≥ 3, good ≥ 5 |
| Buyer's share of the talk | Buyer words ÷ (buyer + seller words) over the transcript (canned opener excluded) | fair ≥ 40%, good ≥ 55% (calibrated down: the avatar answers in a few sentences; a scripted strong seller scored 44%) |
| Open questions | open ÷ (open + closed) | fair ≥ 40%, good ≥ 60% |
| Tailored pitches | `tailored_pitch` ÷ `pitch` | fair ≥ 50%, good ≥ 75% |
| Reflections & summaries, impact questions, rebuttals | counts ("aim for zero" for rebuttals) | — |

Talk share is measured from the transcript word counts (voice sessions are STT-transcribed, typed
sessions are typed), which is robust and model-free. First-pitch timing uses the tagger's `pitch`
code and its utterance index, so "you pitched on turn 2 after one question" is reproducible from the
stored tags. Turn timestamps are also available if we later want seconds-to-first-pitch.

**2. Checklist (judge, verbatim evidence)** — "Listening-first sales call":
open & agree agenda → understand their situation → uncover the problem → explore the impact →
hold the pitch until needs are confirmed → summarize needs back → tailor the offer to stated needs →
explore objections before answering → ask about the decision process → agree a concrete next step.

**3. Rubric dimensions** (1-5, global judgment) + mastery mapping:

| Key | Label | Competency |
|---|---|---|
| `discovery_before_pitch` | Discovery before pitching | audience_attunement |
| `active_listening_sales` | Listening & reflecting | audience_attunement |
| `needs_tailoring` | Tailoring to stated needs | audience_attunement |
| `objection_exploration` | Exploring objections | holding_position_under_pressure |
| `next_step_agreed` | Agreeing a next step | outcome_achievement |

Listening is weighted first by design: three of five dimensions, the first two checklist-critical
metrics, and the buyer's behavior (cooling when pitched) all reward discovery before presenting.

## Grounding

- **Consultative selling** (Mack Hanan, *Consultative Selling*, 1970s onward): the seller diagnoses
  the client's business problem before prescribing.
- **SPIN Selling** (Neil Rackham, 1988, from Huthwaite's study of ~35,000 sales calls): in larger
  sales, successful calls had more Problem and Implication questions and fewer early
  feature-and-benefit statements; "Situation, Problem, Implication, Need-payoff" question types. We
  use the categories as coding vocabulary, not Huthwaite's proprietary materials.
- **Active listening** (Rogers & Farson, 1957): reflecting content and feeling, summarizing to check
  understanding.
- **Talk ratio**: widely cited call-recording analyses (e.g. Gong Labs, 2017) report top performers
  talking roughly 43-46% of a discovery call. Our 40/55% buyer-share bands are a *practice target for
  this tool*, not a validated cut-off, and are labelled that way on the report.
- **Objection handling by exploring first** (common to consultative / "LAER"-style methods:
  listen, acknowledge, explore, respond).

## Risks / limits

- Behavior codes come from a model tagger (same as MI/clinical); single-digit differences are noise,
  and the report says so.
- Talk share in voice mode depends on STT completeness; typed sessions are exact.
- Cases are fictional; no real vendor names or products.
- No schema change: the analysis rides `InteractionReport.outcome.personaAnalysis` JSON, the type is a
  code registry entry, cases are seeded code records.

## Decisions (2026-11-14)

- Placement: a "Sales meeting" card on the Practice pitches picker; breadcrumb "← Practice pitches";
  reports file under the Pitches filter; report and study-plan label "Sales meeting".
- The five sales scores show as score tiles above the shared four, listening dimensions first.
- The fictional-people notice is a quiet grey info line for sales (clinical/MI keep their banner).
- "One thing to practice next time" must quote a moment from the meeting, even on a strong run.

## Future

- **Own-scenario authoring** (deferred by the user): let a student describe their real product,
  service or business and their target buyer, and generate a buyer card (hidden needs, objections,
  next-step condition) the way Courageous conversations lets students author a counterpart. Ship the
  four built-in cases first.
- Calibrate the buyer talk-share bands on real sessions.
