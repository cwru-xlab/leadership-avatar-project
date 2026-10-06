---
phase: 18-avatar-disengagement-walk-out
status: awaiting-human-uat
requirements:
  - REQ-78
  - REQ-79
  - REQ-80
  - REQ-81
  - REQ-82
  - REQ-83
  - REQ-84
  - REQ-85
  - REQ-86
---

# Phase 18 Validation — Avatar Disengagement & Walk-Out

## Automated script battery

Run locally on 2026-10-06. These checks use source fixtures only; no agent
connected to a shared database, Lightsail, Preview, Production, Vercel, or a
deployed application.

| Command | Exit | Result |
|---|---:|---|
| `npx tsx scripts/verify-disengagement.ts` | 0 | PASS |
| `npx tsx scripts/verify-disengagement-termination.ts` | 0 | PASS |
| `npx tsx scripts/verify-disengagement-walkout-shell.ts` | 0 | PASS |
| `npx tsx scripts/verify-disengagement-report.ts` | 0 | PASS |
| `npx tsc --noEmit --pretty false` | 0 | PASS |

## Success criteria — human evidence required

| # | Criterion | Automated coverage | Human verdict / verbatim notes |
|---|---|---|---|
| SC1 | Repetitive, stalled, or non-tailored pitch loses engagement from deterministic observable signals; no live indicator appears. | Signal and no-meter verifiers pass. | **PENDING** |
| SC2 | A structured avatar cue accelerates a walk-out but cannot end a cold session alone. | Cue/threshold verifier passes. | **PENDING** |
| SC3 | A threshold crossing permits exactly one uninterruptible final statement, locks text and PTT, then auto-finishes. | Shell verifier passes. | **PENDING** |
| SC4 | Auto-end records the avatar termination outcome and report explains session-clock decline from observable causes. | Report verifier passes. | **PENDING** |
| SC5 | Types without a threshold retain existing behavior; walk-out respects each type floor. | Policy/floor verifier passes. | **PENDING** |

## Requirement checklist — human evidence required

| Requirement | Human verdict / notes |
|---|---|
| REQ-78 — Observable disengagement computation | **PENDING** |
| REQ-79 — Cue accelerates, never replaces derived authority | **PENDING** |
| REQ-80 — Threshold opt-in preserves other types | **PENDING** |
| REQ-81 — Final avatar statement locks typed and PTT input | **PENDING** |
| REQ-82 — Session auto-finishes after final statement | **PENDING** |
| REQ-83 — Existing termination policy/outcome path is reused | **PENDING** |
| REQ-84 — Deck observes a real four-assistant-turn floor | **PENDING** |
| REQ-85 — No live engagement meter, warning, or gauge | **PENDING** |
| REQ-86 — Report uses session-clock observable decline evidence | **PENDING** |

## Locked-design checks

- [x] Model cue accelerates observable evidence but cannot replace it.
- [x] Disengagement remains invisible during a live session.
- [x] The flow extends `terminationPolicy` and `avatarEndFloor`; no parallel
  termination field was added.
- [x] Pitch deck declares and enforces a four-assistant-turn floor.
- [ ] Human observed the elevator stall walk-out and protected final statement.
- [ ] Human observed the generated report's early-end banner and decline panel.
- [ ] Human spot-checked a threshold opt-out type.
- [ ] Human tested deck floor, or recorded the automated-verifier fallback if a
  deck fixture is unavailable.

## Human UAT protocol

1. Run a pitch-elevator session with short, repetitive, non-tailored answers.
   Verify no meter or warning appears, then wait for the avatar walk-out after
   the two-assistant-turn floor.
2. During the final line, try typed Send and push-to-talk. Both must remain
   locked until the session auto-finishes.
3. Open the generated report. It must use normal early-end outcome chrome, not
   a FAILED-evaluation error, and its decline panel must show only observable
   causes at `m:ss` session-clock times.
4. In a separate run, observe that a cue can accelerate a deteriorating session
   but cannot independently force an early end in a cold session.
5. Spot-check networking or an interview (no threshold) for unchanged behavior.
6. If a deck is available, confirm it cannot walk out before four assistant
   turns. Otherwise record: "deck floor covered by
   verify-disengagement-termination.ts".

## Calibration policy

Do not retune thresholds, weights, or cue acceleration without explicit human
calibration approval. Record any requested change here as a concrete follow-up.

## Final human verdict

**PENDING — do not mark Phase 18 complete or update requirement checkboxes until
human UAT evidence is supplied.**
