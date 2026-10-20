# Privacy Boundary: The Moment-Generation Exception

**Phase:** 21-adaptive-mastery-path
**Plan:** 21-07
**Requirement:** REQ-109

This is the record a future reviewer should read when they find transcript
text in an OpenAI request and want to know whether it was sanctioned. It was.
This document says exactly what was widened, why, and what did not widen.

## 1. What the existing boundary is

`lib/study-plan/generate.ts` carries its own header comment:

> Local privacy filter for the study-plan workflow. It deliberately keeps
> only closed-vocabulary rubric labels and qualitative ratings from report
> markdown. Narrative examples are discarded before any model call,
> preventing names, employers, resume details, answers, or other personal
> information from leaving this application.

Concretely: the model is given only `AnonymousBehavioralReport` objects —
`reportNumber`, `contentScore`, `behavioralScore`,
`behavioralFeedbackSignals` — where `behavioralFeedbackSignals` is built
exclusively from two closed vocabularies, `SAFE_RUBRIC_LABELS` and
`SAFE_RATINGS`. Its system prompt (`STUDY_PLAN_SYSTEM_PROMPT`) states:

> Never infer, request, or mention a student's identity, employer, work
> history, resume, interview answers, transcript, dates, timelines, or any
> personal detail.

`app/api/study-plans/generate/route.ts` passes only these
`AnonymousBehavioralReport` objects, built from DB rows by
`extractBehavioralSignals`, which itself only ever emits a label/rating pair
drawn from the two closed maps above.

**This is UNCHANGED by Phase 21.** `lib/study-plan/generate.ts` is frozen.
No code added by this phase edits it, and `scripts/verify-moment-boundary.ts`
proves that in CI, not just by inspection — see Section 6.

## 2. Why it had to widen

`21-CONTEXT.md` locks, for knowledge checks:

> Content is generated from the student's own session moments — real
> transcript moments and the gaps their report identified... Not a generic
> authored bank.

And REQ-110 requires a verbatim quote of the student, mechanically checkable
against the stored transcript.

A closed-vocabulary feed — the only thing `generate.ts`'s path is permitted
to send — cannot produce either requirement. There is no closed vocabulary
of "things the student actually said." Quoting the student necessarily means
sending text the student wrote, which `generate.ts`'s filter exists
specifically to prevent from reaching a model call.

The alternative that avoids this entirely — an authored question bank,
tagged by competency, with no transcript text involved — was discussed and
explicitly **NOT chosen**. It is recorded in `21-CONTEXT.md`'s Deferred
section: "A curated human-written pool tagged by competency was discussed
as an alternative and not chosen." There is therefore no option that avoids
widening the boundary somewhere. The question was never whether to widen,
only how narrowly.

## 3. What widened, exactly

`lib/study-plan/moment-boundary.ts`'s `prepareMomentsForGeneration()` is the
**only** path in this codebase that may send a student's own transcript text
to a model call. Its policy, reproduced verbatim from
`MOMENT_BOUNDARY_POLICY`:

**Permits:**
- the student's own verbatim transcript turns, for the user whose checks are
  being generated
- the avatar's immediately preceding turn, as the setup the student was
  responding to
- the student's own report growth-area titles and the competency keys they
  map to

**Forbids:**
- the student's name, email, employer, school, or any resume field
- any OTHER person's name or identity, including a third-party persona
  pasted for networking distillation
- report prose beyond growth-area titles
- any turn from a report the requesting user does not own
- the deck, its slides, or any uploaded artifact text

**Scope:** knowledge-check and coached-session generation only — explicitly
**NOT** study-plan synthesis.

## 4. What did NOT widen

- **Study-plan synthesis.** `generate.ts` and its route are untouched and
  still receive only anonymous aggregates and closed-vocabulary signals.
- **Reports.** No report's raw markdown, structured JSON, or growth-area
  prose beyond a growth-area *title* is permitted through the new path
  either.
- **Any cross-user read.** `prepareMomentsForGeneration` throws before
  touching any text if a single supplied moment's owner does not match the
  requesting user. There is no code path that aggregates moments across
  users.
- **Deck or artifact text.** Uploaded decks, resumes, and job descriptions
  stay entirely outside this path.
- **Third-party personas.** A networking-practice persona built from a
  pasted LinkedIn profile or written description is never passed through
  this module; the forbid list names it explicitly because it is the
  nearest-neighbor case to "the student's own words" that must still be
  refused.

## 5. Accepted residual risk

The redactor inside `prepareMomentsForGeneration` is **structural, not
semantic.** It recognizes:
- email addresses (pattern match)
- URLs (pattern match)
- phone-shaped digit runs (pattern match)
- the requesting student's own name tokens (exact match against a
  caller-supplied `selfNames` list)

It does **not** understand meaning, and it does **not** attempt general
named-entity recognition or any model-based PII detection. That is a
deliberate choice, not an oversight: a model making a judgement call inside
a privacy guarantee is exactly the pattern this project has already rejected
elsewhere (Phases 12, 18, 20, and 21-CONTEXT.md's own
deterministic-over-model constraint).

**The residual risk this accepts, stated plainly:** if a student says a
third party's name aloud mid-session — a coworker, a friend, a competing
candidate — this redactor will not catch it. It only catches identifiers it
can recognize by shape (email/URL/phone) or an exact match against the
requesting student's own supplied name. An arbitrary third-party name is
not caught.

**The mitigation that IS in place:** any moment whose `studentText` is
altered by redaction is **dropped from the payload entirely**, never sent in
redacted form. This exists for a different reason — a redacted quote can no
longer satisfy REQ-110's verbatim guarantee — but it has the side effect of
removing some (not all) of the sentences carrying a catchable identifier
rather than merely masking them. It does not mitigate the stated residual
risk (an unrecognized third-party name survives untouched inside an
otherwise-clean sentence), and this document does not claim that it does.

## 6. How it is enforced

`scripts/verify-moment-boundary.ts` is the enforcement mechanism:

- **Frozen-old-path guard:** asserts `generate.ts` still contains
  `SAFE_RUBRIC_LABELS`, `SAFE_RATINGS`, and the exact substring
  `Never infer, request, or mention a student's identity`; asserts it
  contains no import of `./moments` or `./moment-boundary` in any form;
  asserts `AnonymousBehavioralReport`'s field set is exactly the four
  fields named in Section 1; and proves the guard itself would catch a
  regression by running its marker check against a synthetic source with
  the markers stripped.
- **Ownership:** asserts a cross-user call throws, including with an empty
  moments array, and that the thrown message does not echo either user id.
- **Redaction and drops:** asserts an email/URL/phone/self-name-bearing
  moment is dropped, not redacted-and-kept, and that every *emitted*
  moment's `studentText` is byte-identical to its input.
- **Caps:** asserts both the 12-moment and the 8,000-character caps bind
  and report their drop counts, with the most recent moments surviving.
- **Policy shape:** asserts `MOMENT_BOUNDARY_POLICY.forbids` is non-empty
  and that its `scope` does not describe study-plan synthesis as permitted.
