---
phase: 14-practice-pitches
plan: 01
subsystem: infra
tags: [pdfjs, canvas, gotenberg, pptx, vercel, deck-render]

requires: []
provides:
  - Written PPTX→PDF backend selection (gotenberg) with HTTP contract
  - Proven PDF page→PNG path (pdfjs-dist legacy + @napi-rs/canvas)
  - DECK_CONVERT_* env contract for all later Phase 14 deck plans
  - Minimal OOXML PPTX fixture at scripts/fixtures/spike-deck.pptx
affects: [14-03, 14-06, pptx-convert, pdf-rasterize]

tech-stack:
  added: [pdfjs-dist, @napi-rs/canvas, jszip, fast-xml-parser]
  patterns:
    - "Two-stage deck pipeline: PPTX→PDF via external convert, PDF→PNG in-process"
    - "Gotenberg multipart LibreOffice convert behind Bearer token"
    - "serverExternalPackages for native canvas; webpack required on Vercel (Turbopack cannot place .node)"

key-files:
  created:
    - scripts/spike-deck-render.ts
    - .planning/phases/14-practice-pitches/14-DECK-RENDER-DECISION.md
    - .env.example
  modified:
    - .env.template
    - next.config.js
    - scripts/fixtures/spike-deck.pptx

key-decisions:
  - "DECK_CONVERT_BACKEND=gotenberg (human-selected 2026-10-04)"
  - "PDF rasterization: pdfjs-dist legacy + @napi-rs/canvas; 1600px long edge / 240px thumb"
  - "Vercel production builds that load @napi-rs/canvas must use webpack until Turbopack supports .node"

patterns-established:
  - "Spike-first architecture decision before lib/deck/* production modules"
  - "Env contract DECK_CONVERT_BACKEND|URL|TOKEN fixed before 14-06 driver"

requirements-completed: [P14-SC2]

duration: ~55min
completed: 2026-10-04
---

# Phase 14 Plan 01: Deck Render Spike Summary

**Selected `gotenberg` for PPTX→PDF; proved PDF→PNG locally with pdfjs-dist + @napi-rs/canvas (20,551-byte slide PNG) and packed the same path into a Vercel webpack preview.**

## Performance

- **Duration:** ~55 min (Tasks 1–2 earlier session + Task 3 continuation)
- **Started:** 2026-10-04T04:13:11Z
- **Completed:** 2026-10-04T05:08:00Z
- **Tasks:** 3/3
- **Files modified:** 6 key artifacts (+ deps already present from parallel 14-03)

## Accomplishments

- Local PDF page → PNG works: 1237×1600 / 20,551 bytes; thumb 240×310 / 2,109 bytes; canvas `@napi-rs/canvas-darwin-arm64`
- Written decision: `DECK_CONVERT_BACKEND=gotenberg` with Gotenberg HTTP contract and fallback order for 14-06
- Env contract documented in `.env.example` and `.env.template` with selected backend value guidance
- Minimal 2-slide OOXML PPTX fixture committed for intake/convert reuse

## Task Commits

1. **Task 1: Prove PDF page → PNG locally and on Vercel** — `cda094d` (feat)
2. **Task 2: Attempt PPTX convert backend and add fixture** — `b78f3e9` (feat)
3. **Task 3: Select gotenberg and write decision record** — `845e9a0` (docs)

**Plan metadata:** (this commit)

## Files Created/Modified

- `scripts/spike-deck-render.ts` — executable spike (PDF→PNG + optional Gotenberg PPTX convert)
- `scripts/fixtures/spike-deck.pptx` — minimal valid 2-slide OOXML package
- `.planning/phases/14-practice-pitches/14-DECK-RENDER-DECISION.md` — selected backend, evidence, contract, fallbacks
- `.env.example` / `.env.template` — `DECK_CONVERT_BACKEND=gotenberg`, URL, TOKEN
- `next.config.js` — `serverExternalPackages` for `@napi-rs/canvas` (+ linux platform pkgs) and `pdfjs-dist`

## Decisions Made

- **Backend:** `gotenberg` on existing AWS Lightsail host (human must provision container + supply URL/token; not invented here)
- **Rasterizer:** `pdfjs-dist` legacy + `@napi-rs/canvas`; 1600px long-edge slides, 240px thumbs
- **Vercel:** webpack required for native canvas; Turbopack fails with `non-ecmascript placeable asset`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Next.js private `_spike` folder is not routed**
- **Found during:** Task 1
- **Issue:** `app/api/_spike/...` is ignored by App Router (underscore = private folder)
- **Fix:** Temporary public path `app/api/spike-deck-render` used for preview, then deleted
- **Files modified:** temporary route only (removed before Task 1 finish)
- **Committed in:** n/a (deleted; not left in repo)

**2. [Rule 3 - Blocking] Turbopack cannot place `@napi-rs/canvas` .node binary**
- **Found during:** Task 1 Vercel preview
- **Issue:** `next build` (Turbopack) fails with `non-ecmascript placeable asset`
- **Fix:** Preview proved with `next build --webpack`; `serverExternalPackages` added; decision doc records webpack requirement
- **Files modified:** `next.config.js`, decision doc
- **Committed in:** `cda094d` / `845e9a0`

**3. [Rule 1 - Bug] Second pdfjs `page.render` segfaulted on macOS**
- **Found during:** Task 1 local spike
- **Issue:** Re-loading the PDF for a second resolution crashed (exit 139)
- **Fix:** Single render at full res; thumbnail via `loadImage` + canvas downscale
- **Files modified:** `scripts/spike-deck-render.ts`
- **Committed in:** `cda094d`

### Auth / access notes (not deviations)

- Live curl of the Vercel preview returned Vercel Authentication SSO 401; packaging proof stands; live `{ ok, pngBytes }` JSON not obtained
- PPTX convert path exited 0 as **unprovisioned** (`DECK_CONVERT_URL` unset) — expected until human stands up Gotenberg

---

**Total deviations:** 3 auto-fixed (1× Rule 1, 2× Rule 3)  
**Impact on plan:** Necessary for spike proof; no production `lib/deck/*` written (correct scope)

## Issues Encountered

- Parallel-agent WIP scripts briefly broke Vercel typecheck; parked for deploy then restored
- Docker daemon unavailable for linux/amd64 runtime re-proof; linux binary packaging still expected via npm optionalDeps on Vercel

## User Setup Required

**Human must provision Gotenberg** on the existing AWS Lightsail host and set:

- `DECK_CONVERT_BACKEND=gotenberg`
- `DECK_CONVERT_URL=<base URL>`
- `DECK_CONVERT_TOKEN=<shared secret>`

See `14-DECK-RENDER-DECISION.md` and plan `user_setup` / HANDOFF.md §3. Do not commit secrets.

## Measured Numbers (carry forward)

| Metric | Value |
|--------|-------|
| Local slide PNG bytes | 20,551 |
| Local slide size | 1237×1600 |
| Local thumb PNG bytes | 2,109 |
| Local thumb size | 240×310 |
| Local canvas binary | `@napi-rs/canvas-darwin-arm64` |
| PPTX fixture bytes | 13,604 (2 slides) |
| PPTX conversion time | n/a (unprovisioned) |
| Vercel deploy | `dpl_9qh3JkBirTCi5hgLYmDJ29wxmC43` (webpack READY) |

## Fixture structure (for 14-03)

Minimal OOXML via jszip: Content_Types, `_rels/.rels`, `ppt/presentation.xml` + rels, slideMaster, slideLayout, theme, two slides with title + bullet text boxes. No PowerPoint required to regenerate.

## Next Steps

1. Human: stand up Gotenberg on Lightsail; export `DECK_CONVERT_URL` + `DECK_CONVERT_TOKEN`
2. Plan 14-06: implement `lib/deck/pptx-convert.ts` against the locked Gotenberg contract
3. Production PDF rasterize module: reuse pdfjs + `@napi-rs/canvas`; ensure Vercel build uses webpack for that path

## Self-Check: PASSED

- Files: spike script, decision doc, SUMMARY, .env.example, PPTX fixture
- Commits: cda094d, b78f3e9, 845e9a0
