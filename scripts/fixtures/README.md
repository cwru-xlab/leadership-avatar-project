# Deck intake fixtures (Phase 14)

Committed fixtures for `scripts/verify-deck-intake.ts` and later plans
(14-06 conversion, 14-07 upload). Regenerate with:

```bash
npx tsx scripts/generate-deck-fixtures.ts
```

| File | Purpose | How generated |
|------|---------|---------------|
| `spike-deck.pptx` | Happy-path PPTX (2 slides: title + body). Built here because 14-01 had not landed yet — 14-01 should reuse this file. | Minimal OOXML package via `jszip` (`[Content_Types].xml`, `_rels`, `ppt/presentation.xml`, masters/layouts, `ppt/slides/slide{1,2}.xml`) |
| `deck-landscape.pdf` | Happy-path PDF — 3 landscape pages with real text | `pdf-lib` with `useObjectStreams: false` (MediaBox 792×612) |
| `deck-portrait.pdf` | Proves page shape must NOT reject — 2 portrait pages | Same, MediaBox 612×792 |
| `deck-one-slide.pdf` | Proves slide count must NOT reject — exactly 1 page | Same, one page |
| `deck-image-only.pdf` | Proves a text-empty slide is accepted — text on pages 1 & 3, drawn rect only on page 2 | Same; page 2 has a filled rectangle and no text |
| `not-a-deck.txt` | Rejection: `unknown-format` | Plain UTF-8 text |
| `fake.pdf` | Rejection: `corrupt-pdf` | Bytes beginning `%PDF-` with a garbage body |
| `not-pptx.zip` | Rejection: `corrupt-pptx` (ZIP magic, no `ppt/slides/`) | `jszip` archive containing only `readme.txt` |

Size-gate cases (`empty`, `too-large`) are constructed in memory by the verify
script — not committed as files.
