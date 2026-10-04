# Deck Render Decision (Phase 14 Plan 01)

**Date:** 2026-10-04  
**Selected:** `DECK_CONVERT_BACKEND=gotenberg`  
**Selected by:** human (orchestrator / user) after Task 3 checkpoint  
**Downstream consumer:** plan 14-06 `lib/deck/pptx-convert.ts` (must implement the HTTP contract below first)

---

## Decision criteria (written in advance) + measured evidence

These criteria were fixed in `14-01-PLAN.md` before the spike ran. Evidence below is what Tasks 1–2 actually measured.

### Stage 1 — PDF page → PNG (mandatory, no alternative)

| Criterion | Evidence |
|-----------|----------|
| Package | `pdfjs-dist@5.6.205` legacy Node build (`pdfjs-dist/legacy/build/pdf.mjs`) + `@napi-rs/canvas@1.0.10` |
| Local render | `npx tsx scripts/spike-deck-render.ts` exit 0; page 1 → `/tmp/spike-slide-001.png` **20,551 bytes** (1237×1600); thumbnail `/tmp/spike-thumb-001.png` **2,109 bytes** (240×310); text “Spike Page 1” legible |
| Canvas binary (local) | `@napi-rs/canvas-darwin-arm64` (`darwin/arm64`) |
| Vercel packaging | Preview deploy READY `dpl_9qh3JkBirTCi5hgLYmDJ29wxmC43` (`leadership-avatar-project-rer25unm1-xlabs-projects-66a26c8d.vercel.app`); route `/api/spike-deck-render` present in build output when built with **`next build --webpack`** |
| Turbopack | **Fails** with `non-ecmascript placeable asset` for the `@napi-rs/canvas` `.node` binary even with `serverExternalPackages` — production deck rasterization on Vercel must use **webpack** (or an equivalent non-Turbopack path) until that is fixed |
| Live Vercel curl | **Blocked** by Vercel Authentication SSO (401 / “Protected deployment”); `vercel curl` and MCP `web_fetch_vercel_url` could not obtain an SSO session. Packaging proof yes; live JSON `{ ok: true, pngBytes }` not obtained |
| Temporary spike route | Deleted from the repo after the preview proof (`app/api/spike-deck-render` / `app/api/_spike` must not remain) |
| Resolutions locked | Slide images: **~1600px long edge**; thumbnails: **240px wide** |

### Stage 2 — PPTX → rendered image (candidates)

| Rank | Backend (`DECK_CONVERT_BACKEND`) | Select-if (plan) | Measured evidence (2026-10-04) | Outcome |
|------|----------------------------------|------------------|--------------------------------|---------|
| 1 | `gotenberg` — self-hosted Gotenberg (LibreOffice) on existing AWS Lightsail host | Container converts a real `.pptx` to a PDF whose rasterized pages show correct fonts/layout | **Unprovisioned.** `DECK_CONVERT_URL` / `DECK_CONVERT_TOKEN` were not set. Spike printed *“backend not provisioned — Task 3 checkpoint must resolve this”* and exited 0. No conversion time, page count, or font-fidelity observation. Fixture ready at `scripts/fixtures/spike-deck.pptx` (2-slide OOXML, 13,604 bytes) | **SELECTED** — human accepts operating a second deployable on Lightsail; provisioning still required before 14-06 E2E |
| 2 | `vercel-libreoffice` — LibreOffice in a Vercel Large Function | Rank 1 refused AND `soffice --headless --convert-to pdf` runs in a preview within duration with correct fonts | Not exercised (rank 1 selected). Known risks from research: no maintained Vercel package; multi-second cold starts; font gaps break appearance grading | Fallback only |
| 3 | `cloudconvert` — third-party conversion API | Ranks 1–2 fail, OR human accepts sending private student decks to a vendor | Not exercised. Flagged as data-sharing decision | Last resort |

**Disqualifiers (unchanged):** font substitution/missing fonts; conversion of a ~20-slide deck > 45s; backend requires the deck to be publicly readable at any point.

---

## HTTP contract (plan 14-06 must implement)

Gotenberg LibreOffice convert — this is the contract `lib/deck/pptx-convert.ts` codes against:

```
POST {DECK_CONVERT_URL}/forms/libreoffice/convert
  Authorization: Bearer {DECK_CONVERT_TOKEN}
  Content-Type: multipart/form-data
  multipart field: files=<deck.pptx>
    (filename should end in .pptx;
     Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation)

Success:
  200
  Content-Type: application/pdf (or body beginning with %PDF-)
  body = PDF bytes

Failure (driver must surface, not invent retries here — 14-06 owns retry/backoff):
  non-200 status
  body not beginning with %PDF-
  network / timeout errors
```

Env vars (decided in this plan; documented in `.env.example` / `.env.template`):

| Variable | Meaning |
|----------|---------|
| `DECK_CONVERT_BACKEND` | `gotenberg` (selected) |
| `DECK_CONVERT_URL` | Base URL of the Gotenberg host (no trailing slash required; driver should normalize) |
| `DECK_CONVERT_TOKEN` | Shared secret sent as `Authorization: Bearer …` |

**Human provisioning (not done by this plan):** run the Gotenberg container on the existing AWS Lightsail host (see `.planning/HANDOFF.md` §3 — same host as team Postgres), bind a private port, front with the shared-token check, and supply `DECK_CONVERT_URL` + `DECK_CONVERT_TOKEN`. Do not invent secrets in repo.

---

## Fallback order

If the selected backend is refused later or fails permanently against the disqualifiers, move **down** this list — do not re-open the architecture question:

1. `gotenberg` (current selection)
2. `vercel-libreoffice`
3. `cloudconvert` (requires an explicit human data-sharing acceptance; private student work leaves team-controlled infra)

---

## PDF rasterization decision (settled)

| Item | Decision |
|------|----------|
| Library | `pdfjs-dist` **legacy** Node build (`pdfjs-dist/legacy/build/pdf.mjs`) |
| Canvas | `@napi-rs/canvas` (proven locally; platform binary `@napi-rs/canvas-linux-x64-gnu` expected on Vercel linux) |
| Slide image | scale so long edge ≈ **1600px** |
| Thumbnail | **240px** wide |
| Vercel build | Prefer **`next build --webpack`** for routes that load `@napi-rs/canvas`; Turbopack cannot place the native `.node` asset. `next.config.js` lists `@napi-rs/canvas` (+ linux platform packages) and `pdfjs-dist` in `serverExternalPackages` |
| Out of scope | Pure-JS PPTX renderers; third-party slide-host import (cut permanently) |

---

## Fixture notes (for 14-03 / 14-06)

`scripts/fixtures/spike-deck.pptx` is a minimal valid OOXML package built with `jszip`:

- `[Content_Types].xml`, `_rels/.rels`
- `ppt/presentation.xml` + rels
- `ppt/slideMasters/*`, `ppt/slideLayouts/*`, `ppt/theme/theme1.xml`
- `ppt/slides/slide1.xml` + `slide2.xml` (title + bullet body each)

Reuse this fixture for intake / convert tests; do not depend on PowerPoint being installed locally.
