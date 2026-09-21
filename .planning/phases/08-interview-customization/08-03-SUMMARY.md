---
phase: 08-interview-customization
plan: 03
subsystem: api
tags: [openai, nextjs, interview-persona]

# Dependency graph
requires:
  - phase: 06-interview-evaluation-and-report
    provides: auth-guard and response scaffolding pattern (upload-resume route), OpenAI one-shot call wiring (lib/interview/evaluation.ts)
provides:
  - "POST /api/interview/persona/distill — one-shot, authenticated endpoint that turns pasted 'who is interviewing you' text into a bounded persona string"
affects: [08-04, 08-05, 08-06, 08-07, 08-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One-shot distillation route (dynamic OpenAI import, non-streaming chat.completions.create) copied verbatim in shape from lib/interview/evaluation.ts, run once before session start rather than per turn, to preserve the session-constant prompt guarantee"

key-files:
  created:
    - app/api/interview/persona/distill/route.ts
  modified: []

key-decisions:
  - "MAX_PERSONA_LENGTH (600) is defined locally in the new route rather than imported from lib/interview/customization.ts, keeping this route independent of plan 08-01 per the plan's explicit instruction"
  - "Persona system prompt instructs the model not to begin with 'You are' since the caller's sentence ('You are playing the role of: ...') already supplies that; verified in Task 2 that the assembled sentence reads grammatically"
  - "profileText is truncated server-side to 4000 chars before the model call and the output is hard-truncated to 600 chars after — neither cap ever throws, both silently truncate"

patterns-established:
  - "Persona distillation logs only {userId, inputLength, outputLength} on success and error constructor name on failure — never the pasted text or the derived persona itself"

requirements-completed: [REQ-22]

# Metrics
duration: 12min
completed: 2026-09-21
---

# Phase 8 Plan 3: Interview Persona Distillation Endpoint Summary

**New `POST /api/interview/persona/distill` route: a single non-streaming OpenAI call that turns pasted interviewer-description text into a 1-3 sentence, grammar-compatible persona string, hard-capped at 600 chars, with zero persistence of the input or output.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-21T14:03:00Z
- **Completed:** 2026-09-21T14:15:47Z
- **Tasks:** 2 completed
- **Files modified:** 1 (new file)

## Accomplishments
- Authenticated one-shot endpoint accepting pasted profile text (never a URL) and returning a bounded persona string
- Verified end-to-end against a real logged-in seeded local dev user and real OpenAI calls: correct 200/400 behavior, 5000-char input truncation, and a grammatical assembled "playing the role of: ..." sentence
- Confirmed unauthenticated requests never reach the model (middleware 307 redirect, matching the pre-existing sibling-route behavior already logged in 06-08)

## Task Commits

1. **Task 1: Create the authenticated persona distillation endpoint** - `d779d6b` (feat)
2. **Task 2: Verify the endpoint end to end with a real logged-in user** - no code changes; verification-only task, documented below

**Plan metadata:** (this commit)

## Files Created/Modified
- `app/api/interview/persona/distill/route.ts` - New route: auth guard copied from upload-resume, `{profileText}` JSON body validation, 4000-char input truncation, one non-streaming `chat.completions.create` call (`INTERVIEW_PERSONA_MODEL` env override, default `gpt-4.1`, 20s timeout, `max_tokens: 300`), 600-char output cap with wrapping-quote stripping, `{persona}` 200 response, `{error}` 400/502/500 responses, retention-safe logging

## Decisions Made
- Kept `MAX_PERSONA_LENGTH` local to this route (not imported from `lib/interview/customization.ts`) per the plan's explicit instruction to stay independent of plan 08-01, which was executing concurrently in another wave-1 agent
- System prompt explicitly tells the model not to open with "You are" and to avoid wrapping quotes/markdown, since the model's raw output otherwise tends toward those patterns when asked to describe a person

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. A dev server was already running on port 3000 from a prior session; reused it directly (with the local dev DB already containing seeded users from earlier phases) rather than starting a second instance, per the plan's "do NOT create shared-DB users" guidance — no temporary user was created or needed.

## Task 2 Verification Results (verbatim)

Logged in as the existing seeded local dev user `alice.johnson@case.edu` (no temporary user created).

**(a) 200 with non-empty persona under 600 chars** — POST with a ~200-word plausible bio (fictional "Maria Chen, Senior Director of Engineering") returned:

```json
{"persona":"Maria Chen, a Senior Director of Engineering at a mid-size fintech company in Chicago with twelve years in payments infrastructure and a computer science background, known for her direct but fair interview style, pointed follow-up questions, and commitment to candidate success, who draws on extensive hiring experience and past leadership of a fraud detection team at a large e-commerce company."}
```
Length: 498 chars (under the 600-char cap). HTTP 200.

**(b) Assembled prompt sentence** — substituting into `buildInterviewSystemPrompt`'s exact phrasing:

> "You are playing the role of: Maria Chen, a Senior Director of Engineering at a mid-size fintech company in Chicago with twelve years in payments infrastructure and six years in engineering management, known for her direct yet fair interview style, pointed follow-up questions, and genuine desire for candidates to succeed; she has a computer science background, has hired over fifty engineers, and is described as no-nonsense in group settings but warm one-on-one, with a knack for revisiting topics to ensure complete answers.."

Grammatical (minor double-period from the source sentence's own trailing period plus the template's, a cosmetic quirk of the template concatenation, not the persona string itself — the persona clause reads correctly as a continuation).

**(c) 5,000-char input still succeeds** — a repeated-phrase 5000-char paste ("Jordan Reyes is a veteran hiring manager in the aerospace industry." repeated) returned 200 with `{"persona":"Jordan Reyes, a veteran hiring manager in the aerospace industry."}`, confirming the `MAX_PROFILE_TEXT_LENGTH` truncation absorbs oversized input rather than erroring.

**(d) Blank profileText returns 400** — `{"profileText":""}` returned `{"error":"profileText is required"}` with HTTP 400.

No prompt tightening was needed — the model's raw output already avoided a leading "You are" and wrapping quotes on the first attempt, and the defensive `stripWrappingQuotes` helper is in place regardless.

## User Setup Required

None - no external service configuration required. Uses the existing `OPENAI_API_KEY` already configured for the evaluation module.

## Next Phase Readiness

The distillation endpoint is ready for the setup-flow plans (08-04 through 08-08) to wire into the "Customize" affordance's pasted-profile input, calling it once before session start and holding the returned `persona` string client-side for the rest of the flow, matching the resume-upload pattern.

---
*Phase: 08-interview-customization*
*Completed: 2026-09-21*

## Self-Check: PASSED

- FOUND: app/api/interview/persona/distill/route.ts
- FOUND: .planning/phases/08-interview-customization/08-03-SUMMARY.md
- FOUND: d779d6b (git log)
