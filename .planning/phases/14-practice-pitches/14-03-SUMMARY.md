---
phase: 14-practice-pitches
plan: 03
subsystem: deck-intake
tags: [pdf, pptx, pdfjs-dist, jszip, fast-xml-parser, magic-bytes, fixtures]

requires: []
provides:
  - "validateAndExtractDeck(buffer, filename?) → DeckExtraction | DeckRejection"
  - "extractPerPageText(buffer) → Promise<string[]>"
  - "extractPerSlideText(buffer) → Promise<string[]>"
  - "Committed fixtures under scripts/fixtures/ for 14-06/14-07"
affects: [14-06, 14-07, deck-upload, deck-rasterize]

tech-stack:
  added: [jszip, fast-xml-parser, pdfjs-dist, pdf-lib]
  patterns:
    - "Magic-byte format detection (never trust client MIME)"
    - "Binary DeckExtraction | DeckRejection union with mandatory reason+fix"
    - "Zero-based DeckSlide.index as the Phase 14 index convention"

key-files:
  created:
    - lib/deck/types.ts
    - lib/deck/intake.ts
    - lib/deck/pdf-extract.ts
    - lib/deck/pptx-extract.ts
    - scripts/verify-deck-intake.ts
    - scripts/generate-deck-fixtures.ts
    - scripts/fixtures/README.md
    - scripts/fixtures/spike-deck.pptx
    - scripts/fixtures/deck-landscape.pdf
    - scripts/fixtures/deck-portrait.pdf
    - scripts/fixtures/deck-one-slide.pdf
    - scripts/fixtures/deck-image-only.pdf
    - scripts/fixtures/not-a-deck.txt
    - scripts/fixtures/fake.pdf
    - scripts/fixtures/not-pptx.zip
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "PDF text via pdfjs-dist (not in-process pdf2json) — pdf2json fake worker returns stale pages under sequential load"
  - "spike-deck.pptx built here; 14-01 should reuse this fixture"
  - "25MB MAX_DECK_SIZE_BYTES; no page-shape or slide-count rejection"

patterns-established:
  - "DeckRejection always carries code + reason + fix from DECK_REJECTIONS"
  - "Numeric sort of ppt/slides/slideN.xml (never string sort)"
  - "normalizeDeckWhitespace shared by PDF and PPTX extractors"

issues-created: []

duration: 15min
completed: 2026-10-04
---

# Phase 14 Plan 03: Deck Intake Floor Summary

**Magic-byte PDF/PPTX intake with per-page/per-slide text extraction and reason+fix rejections, proven against eight committed fixtures**

## Performance

- **Duration:** 15 min
- **Started:** 2026-10-04T04:13:06Z
- **Completed:** 2026-10-04T04:28:05Z
- **Tasks:** 3
- **Files modified:** 16 (Task 3 commit) + 4 earlier (Tasks 1–2)

## Accomplishments

- Binary accept/reject intake: `validateAndExtractDeck` never throws; seven `DeckRejectionCode`s each carry mandatory `reason` and `fix`
- Per-page PDF text (`extractPerPageText`) and per-slide PPTX text (`extractPerSlideText`) with numeric slide ordering
- `scripts/verify-deck-intake.ts` proves both happy paths, all rejection codes, portrait acceptance, one-slide acceptance, and image-only empty middle slide

## Task Commits

1. **Task 1: Deck types and format-detection + size gate** - `e67cf0e` (feat)
2. **Task 2: Per-page PDF and per-slide PPTX text extraction** - `7546c38` (feat)
3. **Task 3: Prove intake against real fixtures** - `55d4a23` (feat)

**Plan metadata:** (pending docs commit)

## Exported signatures (for 14-06 / 14-07)

```ts
// lib/deck/intake.ts
export function detectDeckFormat(buffer: Buffer): DeckFormat | null;
export async function validateAndExtractDeck(
  buffer: Buffer,
  filename?: string
): Promise<DeckExtraction | DeckRejection>;

// lib/deck/pdf-extract.ts
export async function extractPerPageText(buffer: Buffer): Promise<string[]>;

// lib/deck/pptx-extract.ts
export async function extractPerSlideText(buffer: Buffer): Promise<string[]>;
export function normalizeDeckWhitespace(text: string): string;
```

## Fixture inventory

| File | Role |
|------|------|
| `spike-deck.pptx` | PPTX happy path (2 slides; title "Spike Deck Title") — built here; **14-01 should reuse** |
| `deck-landscape.pdf` | PDF happy path (3 landscape pages) |
| `deck-portrait.pdf` | Forbidden-rejection guard: portrait accepted |
| `deck-one-slide.pdf` | Forbidden-rejection guard: one page accepted |
| `deck-image-only.pdf` | Empty middle slide accepted (`slides[1].text === ""`) |
| `not-a-deck.txt` | `unknown-format` |
| `fake.pdf` | `corrupt-pdf` |
| `not-pptx.zip` | `corrupt-pptx` (ZIP magic, no `ppt/slides/`) |

Regenerate: `npx tsx scripts/generate-deck-fixtures.ts`

## Decisions Made

- **PDF extractor uses `pdfjs-dist/legacy/build/pdf.mjs`**, not in-process `pdf2json`. Same per-page array contract as Pattern 2; RAG's `document-processor.ts` remains untouched on pdf2json.
- **Google Slides permanently absent** — only a benign mention in the `unknown-format` fix copy (export to PDF).
- **Zero-based `DeckSlide.index`** is the Phase 14 convention (storage, viewer, high-water mark).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced in-process pdf2json with pdfjs-dist for per-page text**
- **Found during:** Task 3
- **Issue:** pdf2json's fake worker has process-global state; sequential parses returned stale pages from a prior buffer (e.g. one-slide text when reading image-only) and intermittent `Invalid XRef stream header` failures
- **Fix:** `extractPerPageText` now uses `pdfjs-dist` `getDocument` + per-page `getTextContent`, matching the isolation/reliability needs of intake while preserving the Pattern 2 per-page array shape
- **Files modified:** `lib/deck/pdf-extract.ts`, `package.json` (`pdfjs-dist`)
- **Verification:** `npx tsx scripts/verify-deck-intake.ts` exit 0 three times in a row
- **Committed in:** `55d4a23`

**2. [Rule 3 - Blocking] Fixture PDFs via pdf-lib classic xref**
- **Found during:** Task 3
- **Issue:** Hand-rolled PDFs were rejected by parsers; pdf-lib default object streams also fail pdf tooling
- **Fix:** `scripts/generate-deck-fixtures.ts` uses `pdf-lib` with `useObjectStreams: false`; `pdf-lib` added as a devDependency
- **Files modified:** `scripts/generate-deck-fixtures.ts`, `package.json`
- **Committed in:** `55d4a23`

**Total deviations:** 2 auto-fixed (1 Rule 1, 1 Rule 3), 0 deferred
**Impact on plan:** Necessary for correctness of sequential intake; no scope creep beyond the plan's exported API

## Issues Encountered

- Parallel Phase 14/15/16 agents were committing concurrently; `spike-deck.pptx` was created here because 14-01 had not landed the fixture yet
- `scripts/verify-deck-intake.ts` was briefly missing mid-session (likely parallel workspace churn) and was rewritten before the Task 3 commit

## Next Phase Readiness

- 14-06 can call `extractPerSlideText` / convert against `spike-deck.pptx` and the PDF fixtures
- 14-07 can wrap `validateAndExtractDeck` in the upload route
- No Google Slides / Drive / OAuth code paths exist under `lib/deck/`

## Self-Check: PASSED

- FOUND: `lib/deck/types.ts`, `lib/deck/intake.ts`, `lib/deck/pdf-extract.ts`, `lib/deck/pptx-extract.ts`
- FOUND: `scripts/verify-deck-intake.ts`, `scripts/fixtures/` (8 fixtures + README)
- FOUND commits: `e67cf0e`, `7546c38`, `55d4a23`
- VERIFY: `npx tsx scripts/verify-deck-intake.ts` exits 0

---
*Phase: 14-practice-pitches*
*Completed: 2026-10-04*
