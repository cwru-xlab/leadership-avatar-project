---
phase: 14-practice-pitches
plan: 07
subsystem: deck-api
tags: [deck-upload, private-binary, gotenberg, pdfjs, napi-rs-canvas, s3, ownership-404]

requires:
  - phase: 14-06
    provides: "convertPptxToPdf + rasterizePdf + persistDeck / loadDeckManifest / loadDeckSlideImage"
  - phase: 14-03
    provides: "validateAndExtractDeck + DECK_REJECTIONS + fixtures"
provides:
  - "POST /api/practice/deck/upload — opaque deckId, no S3 URLs"
  - "GET /api/practice/deck/{deckId} — owner-only manifest with per-slide text"
  - "GET /api/practice/deck/{deckId}/slide/{index} — private PNG bytes (?v=thumb)"
  - "PPTX_CONVERT_FAILURES reason+fix map (502 when convert backend fails)"
  - "scripts/verify-deck-routes.ts authenticated e2e proof"
affects: [14-12, 14-13, deck-wizard, slide-viewer]

tech-stack:
  added: []
  patterns:
    - "First private owner-only binary byte route (cookie ownership; cross-owner → 404)"
    - "Upload returns metadata only; slide text only on owner manifest GET"
    - "pdfjs Node canvasFactory + disableFontFace + local standard_fonts/cmaps for real-deck fidelity"

key-files:
  created:
    - app/api/practice/deck/upload/route.ts
    - app/api/practice/deck/[deckId]/route.ts
    - app/api/practice/deck/[deckId]/slide/[index]/route.ts
    - scripts/verify-deck-routes.ts
  modified:
    - next.config.js
    - lib/deck/pdf-rasterize.ts

key-decisions:
  - "No Prisma deck table — S3 manifest remains the record (14-06)"
  - "PPTX without DECK_CONVERT_URL → 502 backend-unconfigured with student-facing reason+fix (not silent skip)"
  - "experimental.proxyClientMaxBodySize 32mb so 25MB decks are not truncated at the 10MB default"
  - "Real-deck rasterize requires doc.canvasFactory (Path2D) + disableFontFace with local font/cmap assets"

patterns-established:
  - "Deck route responses never contain http(s) URLs; opaque deckId only"
  - "Rejection body shape { error, fix, code } for intake and convert failures"
  - "Slide Cache-Control: private, max-age=3600, immutable"

requirements-completed: [P14-SC2]

duration: 10h (incl. overnight human-verify wait; autonomous ~25min)
completed: 2026-10-04
---

# Phase 14 Plan 07: Deck Upload & Private Slide Byte Routes Summary

**Authenticated PDF/PPTX upload → private S3 persist → owner-only manifest and PNG byte serving, with real-deck raster fidelity fixed at the human-verify checkpoint (canvasFactory + glyph-path fonts).**

## Performance

- **Duration:** ~10h wall (overnight checkpoint wait); autonomous execution ~25 min
- **Started:** 2026-10-04T05:11:47Z
- **Completed:** 2026-10-04T15:16:40Z
- **Tasks:** 3/3
- **Files modified:** 6

## Response shapes (for 14-12 wizard / 14-13 viewer)

### Upload — `POST /api/practice/deck/upload` → 201

```json
{
  "deckId": "<uuid>",
  "format": "pdf" | "pptx",
  "slideCount": 11,
  "slides": [{ "index": 0, "widthPx": 1600, "heightPx": 1237, "textLength": 42 }]
}
```

No slide text. No URLs. Failures: 400 `{ error, fix, code }` (intake), 502 `{ error, fix, code }` (PPTX convert), 401 Unauthorized, 500 upload-failed with reason+fix.

### Manifest — `GET /api/practice/deck/{deckId}` → 200

```json
{
  "deckId": "<uuid>",
  "format": "pdf" | "pptx",
  "slideCount": 11,
  "slides": [{ "index": 0, "text": "...", "widthPx": 1600, "heightPx": 1237 }]
}
```

`Cache-Control: private, no-store`. Missing / not-owner → 404.

### Slide image — `GET /api/practice/deck/{deckId}/slide/{index}` (`?v=thumb` optional)

Raw `image/png` bytes. `Cache-Control: private, max-age=3600, immutable`. Out-of-range / not-owner / bad index → 404.

### `PPTX_CONVERT_FAILURES` (exported from upload route)

| code | reason | fix |
|------|--------|-----|
| `backend-unconfigured` | PowerPoint decks can't be processed right now. | Export your deck as a PDF and upload that instead — PDF decks work. |
| `backend-timeout` | That deck took too long to process. | Try again, or export it as a PDF and upload that instead. |
| `backend-error` | That .pptx couldn't be converted. | Re-save it as .pptx from PowerPoint or Keynote, or export it as a PDF, then try again. |

## Accomplishments

- Three authenticated deck routes with cookie-sourced ownership and no S3 URLs in responses
- `scripts/verify-deck-routes.ts` proves happy path, every rejection code's error≠fix, unauth redirect/401, cross-owner 404, no-URL guard
- Human visual fidelity confirmed on a real 11-slide PDF after checkpoint rasterize fixes
- PPTX path fails clearly (502 + reason+fix) until Gotenberg is provisioned

## Task Commits

1. **Task 1: The deck upload route** — `665e9aa` (feat)
2. **Task 1 follow-up: 32mb proxy bodies + too-large mapping** — `54cc551` (fix)
3. **Task 2: Manifest route and private slide-image byte server** — `1f8b515` (feat)
4. **Task 3: verify-deck-routes script** — `7036f39` (feat)
5. **Task 3 checkpoint: real-deck raster fidelity** — `97b273e` (fix)

**Plan metadata:** (this commit)

## Files Created/Modified

- `app/api/practice/deck/upload/route.ts` — POST validate → convert → rasterize → persist; opaque deckId
- `app/api/practice/deck/[deckId]/route.ts` — owner-only manifest GET
- `app/api/practice/deck/[deckId]/slide/[index]/route.ts` — first private binary byte route
- `scripts/verify-deck-routes.ts` — authenticated e2e against `next dev`
- `next.config.js` — `experimental.proxyClientMaxBodySize: "32mb"`
- `lib/deck/pdf-rasterize.ts` — canvasFactory + disableFontFace + local fonts/cmaps (`97b273e`)

## Decisions Made

- Rasterization stays synchronous in the upload request (`maxDuration = 120`); no deferred background work
- Middleware cookieless → 307 `/login`; route still returns 401 when reached without a user; verify script accepts either
- PPTX E2E convert remains blocked on Gotenberg provisioning — clear 502 is the accepted interim posture

## Human Verdict (verbatim)

> approved
>
> Evidence the human provided:
> 1. `npx tsx scripts/verify-deck-routes.ts` — all eight sections passed (exit 0).
> 2. Real PDF uploaded (Adam's CAA REQUEST 2026-7.pdf, 11 slides) via POST /api/practice/deck/upload.
> 3. First render was blank white — fixed during checkpoint: pdf-rasterize now uses doc.canvasFactory (Path2D) — committed as fix(14-07) after white-slide diagnosis.
> 4. Then tofu/missing glyphs — fixed during checkpoint: disableFontFace:true + local standardFontDataUrl/cMapUrl — same commit.
> 5. After fix, human confirmed slides show images AND readable text (title slide "CAA REQUEST", impact slide with bullets/photos). Re-uploaded deck id cfed8ee7-564e-4bd6-a636-4fe0abd17ef7 looked correct.
> 6. PPTX: DECK_CONVERT_URL unset — script correctly asserts 502 backend-unconfigured with reason+fix (not silent skip). Human accepts PDF path + clear PPTX failure copy until Gotenberg provisioned.
> 7. Cross-owner 404 and rejection reason+fix covered by verify script.

**Rendering-fidelity note for 14-01:** PDF path now faithful after `97b273e`. PPTX convert fidelity still untested live (backend unprovisioned); not a font-substitution failure on PDF.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Raise proxy body limit for 25MB decks**
- **Found during:** Task 3 verify (too-large / large multipart)
- **Issue:** Default `proxyClientMaxBodySize` 10MB truncated bodies → FormData parse 500
- **Fix:** `experimental.proxyClientMaxBodySize: "32mb"` + early Content-Length / file.size / FormData-failure → `too-large`
- **Files modified:** `next.config.js`, `app/api/practice/deck/upload/route.ts`
- **Committed in:** `54cc551`

**2. [Rule 1 - Bug] White slides on real PDFs (canvas Path2D)**
- **Found during:** Task 3 human-verify
- **Issue:** First render of Adam's CAA REQUEST PDF was blank white
- **Fix:** pdf-rasterize uses `doc.canvasFactory` so Path2D polyfills match pdfjs Node expectations
- **Files modified:** `lib/deck/pdf-rasterize.ts`
- **Committed in:** `97b273e`

**3. [Rule 1 - Bug] Tofu / missing glyphs on real PDFs**
- **Found during:** Task 3 human-verify (after white-slide fix)
- **Issue:** Images present but text rendered as missing glyphs
- **Fix:** `disableFontFace: true` + local `standardFontDataUrl` / `cMapUrl` from pdfjs-dist assets
- **Files modified:** `lib/deck/pdf-rasterize.ts`
- **Committed in:** `97b273e`

**Total deviations:** 3 auto-fixed (Rule 1 ×2, Rule 2 ×1)
**Impact on plan:** Required for real-deck correctness and 25MB uploads; no scope creep beyond P14-SC2.

## Issues Encountered

- `DECK_CONVERT_URL` unset — PPTX convert correctly 502s; human accepted interim posture
- Cookieless requests hit middleware 307 before route 401 — verify asserts both

## User Setup Required

Gotenberg still unprovisioned for live PPTX convert. After Lightsail deploy set:

- `DECK_CONVERT_BACKEND=gotenberg`
- `DECK_CONVERT_URL=…`
- `DECK_CONVERT_TOKEN=…`

See `14-DECK-RENDER-DECISION.md`. Do not invent secrets in-repo.

## Next Phase Readiness

- 14-12 wizard can code against upload response shape + `PPTX_CONVERT_FAILURES`
- 14-13 viewer can load `/api/practice/deck/{deckId}/slide/{index}` (?v=thumb)
- PPTX E2E still needs Gotenberg provisioning (not code)

## Self-Check: PASSED

- FOUND: `app/api/practice/deck/upload/route.ts`
- FOUND: `app/api/practice/deck/[deckId]/route.ts`
- FOUND: `app/api/practice/deck/[deckId]/slide/[index]/route.ts`
- FOUND: `scripts/verify-deck-routes.ts`
- FOUND: `lib/deck/pdf-rasterize.ts` (canvasFactory + disableFontFace)
- FOUND: commits `665e9aa`, `54cc551`, `1f8b515`, `7036f39`, `97b273e`
- VERIFY: human approved; `npx tsx scripts/verify-deck-routes.ts` exit 0
