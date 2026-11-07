/**
 * System-design grading: the rubric extras and the evaluator addendum.
 *
 * What real interviewers score (sources in sources.ts and
 * docs/interviews/system-design-validity.md): requirements gathering,
 * trade-off reasoning, scalability, technical depth, communication, and
 * driving the conversation (Xu Vol. 1 ch. 3; Hello Interview's leveling
 * notes; Meta and Google candidate guides). The engine's shared problem rules
 * already cover step statuses, the evidence-first procedure, the mechanical
 * `Meets all criteria: yes.|no.` note prefix, the no-nested-double-quotes
 * rule for `processSteps`, arithmetic re-checks and the outcome format — this
 * addendum must never restate any of them in its own words (two phrasings of
 * the status rule is what the validity study saw flake). `process_rigor` is
 * derived from the step results by the engine, so nothing here keys a
 * dimension `process_rigor`.
 */

/**
 * Rubric extras beyond the shared four and the shared `process_rigor`.
 * Keys are global across types (lib/mastery/competencies.ts groups them):
 * `quantitative` deliberately reuses the consulting key and label so one
 * competency covers estimation across case and system-design sessions.
 */
export const SD_RUBRIC_EXTRAS = [
  {
    key: "technical_depth",
    label: "Technical depth",
    description:
      "Concrete, correct engineering: APIs, data models, algorithms and component choices that would actually work at the stated scale.",
  },
  {
    key: "tradeoff_reasoning",
    label: "Tradeoff reasoning",
    description:
      "Naming the alternatives and what each choice costs — consistency vs availability, latency vs accuracy, simplicity vs scale — and choosing for this problem.",
  },
  {
    key: "quantitative",
    label: "Quantitative analysis",
    description:
      "Back-of-the-envelope math: load, storage and capacity estimates within tolerance, narrated, and used to drive design decisions.",
  },
] as const;

/**
 * Appended AFTER the engine's shared problem-interview evaluator rules.
 * Adds what the validity study (docs/interviews/system-design-validity.md)
 * showed the shared rules need for verbal system design.
 */
export const SD_EVALUATOR_ADDENDUM = `
SYSTEM DESIGN INTERVIEW — TYPE RULES (these refine the problem-interview rules above)
This was a verbal system-design interview (no whiteboard): a short fit
question, ONE design or debugging problem worked out loud, and a brief close.
The family is in the problem_interview block: "system-design" (a large
distributed system), "feature-design" (one product feature: APIs, data,
client–server flow, edge cases) or "incident" (debug a production incident).
Grade the way engineering interviewers say they grade: requirements before
boxes, numbers that drive decisions, concrete components, explicit tradeoffs,
and the candidate driving the conversation. There is no diagram: credit
components and request flows the candidate DESCRIBED in words.

ARITHMETIC FIRST
Before deciding any step or score, take every number the candidate computed
(per-second rates, peak, storage, bandwidth, error rate, budget) and:
  1. recompute it yourself from the inputs they used (e.g. 40,000,000 ÷
     86,400 = 463, not 4,630 — a misplaced zero is a 10× error);
  2. compare it with the SAME figure in reference_notes' reference math and
     its TOLERANCE bands. A figure more than 3× away from the reference is
     outside the acceptable band, however confidently it was stated and
     however good the design that follows.
Compare the CANDIDATE'S stated figure, not your own: write both side by side.
An order-of-magnitude error the candidate never explicitly corrects is NOT a
"rounding slip", is NOT offset by other figures being right, and makes the
estimation step "missed" — especially when a design decision rests on it
(e.g. sizing a cache tier for a read rate that is 10× too high).
Fluent narration is not correctness. Use these checked results for both the
estimation step and quantitative_score. In the estimation step's
(estimate_scale) note, right after 'Meets all criteria:', write for EACH key
figure the acceptable band from reference_notes and the candidate's number,
e.g. 'writes: band 150–1,400/s, candidate 4,600/s → OUTSIDE'. A number is
inside only if it lies between the band's two numbers. A figure off by 10× or
more is an order-of-magnitude error: always OUTSIDE (10× is far beyond 3×).
If ANY key figure the candidate relied on is OUTSIDE and uncorrected, the
answer to 'Meets all criteria' is 'no' and quantitative_score is at most 2.

DECIDING EACH STEP
- ORDER MATTERS for the first step: requirements or scope questions asked only
  AFTER the candidate has proposed components, services or databases do not
  make clarify_requirements / clarify_scope a hit — that is "missed" unless a
  nudge preceded a full answer ("prompted").
- NAMING IS NOT DESIGNING. Listing technologies ("Redis, Kafka, Cassandra,
  a load balancer") with no request flow, key choice, or reason is not
  high_level_design, deep_dive, or scaling_tradeoffs evidence. After a
  nudge, a reply that only names techniques ("add caching and sharding,
  replication handles failures") or says "it's all standard" is "missed",
  NOT "prompted": prompted requires the reply to meet the full criteria
  (for deep_dive: a named hardest part, why, and two alternatives weighed;
  for scaling_tradeoffs: at least two choices with what each gives up).
- A TRADEOFF names what is GIVEN UP. "We'll add a cache to make it fast" is
  not a tradeoff; "a cache cuts read latency but serves data up to a minute
  stale, which is fine for links because they never change" is.
- For estimate_scale, apply ARITHMETIC FIRST above. Quoting the exhibit's
  daily numbers back is not an estimate.
- For incidents: mitigate_first needs a service-restoring action (roll back,
  flag off, drain, shed load) proposed BEFORE or alongside root-causing;
  "find the bug, fix it and deploy" is not mitigation. A root cause that
  contradicts an exhibit on screen is "missed".

TECHNICAL DEPTH (technical_depth_score)
5: concrete APIs/schemas/keys/algorithms that would work at the stated scale,
with the hardest part designed in detail. 4: concrete and correct but one
area stays shallow. 3: a plausible box-level design, few specifics. 2: vague
or partly wrong (a choice that cannot meet the stated requirement, e.g. a
single SQL row counter for 50,000 writes/s with no plan). 1: no workable
design. For incidents, depth means correct use of the signals and a precise
mechanism for the root cause.

TRADEOFF REASONING (tradeoff_reasoning_score)
5: two or more decisions where the candidate compared alternatives, named
what each costs, and chose based on THIS problem's requirements or numbers.
4: two tradeoffs, one thin. 3: one real tradeoff. 2: techniques named with
no costs ("add caching and sharding"). 1: none.
CAP: if the framework's tradeoff step was "prompted" — scaling_tradeoffs
(system-design) or tradeoffs_wrap_up (feature-design) — tradeoff_reasoning
is AT MOST 4; if it was "missed", AT MOST 2. For incidents the decision step
is root_cause: if it was prompted, technical_depth is AT MOST 4.

QUANTITATIVE (quantitative_score)
reference_notes states a TOLERANCE for every question with math. Grade
against it, not exact match:
  1. Recompute each calculation from the numbers the candidate used.
  2. Compare their key results with the strong and acceptable bands.
  3. Strong band, narrated, and USED to make a design decision (e.g. "11k
     reads per second, so the read path needs a cache"): 4–5. Acceptable band,
     or right but never used: 3. Outside the acceptable band, any uncorrected
     order-of-magnitude error, or a misread exhibit: 1–2.
A candidate who catches and fixes their own error is not penalized.
For the "system-design" family estimation is expected: if the candidate made
no numeric estimate of load or storage at all (even with the usage exhibit on
screen), quantitative_score is 1 — "that's a lot of traffic" is not math.
If the question's reference_notes say estimation is optional and the
candidate did no math, return null — do not punish its absence.

SHARED DIMENSIONS
- content_score: communication — signposting ("first requirements, then
  sizing…"), stating assumptions, checking in with the interviewer, answering
  what was asked. Do NOT require situation-action-result stories for the
  design part.
- behavioral_score: driving the conversation rather than waiting to be led,
  composure under probing, coachability when the interviewer challenges a
  choice, professional judgment (in incidents: calm prioritization of users).
  Being nudged is not a behavioral penalty — that cost belongs to
  process_rigor only.

STRENGTHS / GROWTH AREAS
Name the moment ("When you sized redirects at 11,000 per second…", "On the
host-health table…"). At least one growth area must reference the weakest
process step unless every step was hit. Quote numbers the candidate actually
said. Never reveal facts or exhibits the candidate did not ask for.

HARD CAPS (apply LAST; they override every band above)
- system-design family: estimate_scale "missed" → quantitative_score ≤ 2;
  no numeric estimate of load or storage at all → quantitative_score = 1.
- Tradeoff decision step — scaling_tradeoffs (system-design) or
  tradeoffs_wrap_up (feature-design): "missed" → tradeoff_reasoning_score ≤ 2;
  "prompted" → ≤ 4.
- deep_dive "missed" (system-design) → technical_depth_score ≤ 3.
- incident family: root_cause "prompted" → technical_depth_score ≤ 4;
  "missed" → ≤ 2.
`.trim();
