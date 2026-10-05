# Test fixtures

Fixtures are committed test inputs. Regenerate the canonical deck-intake set with:

```bash
npx tsx scripts/generate-deck-fixtures.ts
```

## Ownership

**A fixture file has exactly one writer.** A generator may write several fixtures,
but no two scripts may write the same path.

| File                     | Single writer                                  | Readers / purpose                                                                                                                                            |
| ------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `deck-two-slide.pptx`    | `scripts/generate-deck-fixtures.ts`            | `scripts/verify-deck-intake.ts` canonical minimal two-slide PPTX; its first title is `Spike Deck Title`                                                      |
| `spike-deck.pptx`        | `scripts/spike-deck-render.ts`                 | 14-01 spike artifact; regenerate with `npx tsx scripts/spike-deck-render.ts`; read by `scripts/verify-deck-rasterize.ts` and `scripts/verify-deck-routes.ts` |
| `deck-landscape.pdf`     | `scripts/generate-deck-fixtures.ts`            | `scripts/verify-deck-intake.ts` happy-path three-page PDF                                                                                                    |
| `deck-portrait.pdf`      | `scripts/generate-deck-fixtures.ts`            | `scripts/verify-deck-intake.ts` page-shape acceptance                                                                                                        |
| `deck-one-slide.pdf`     | `scripts/generate-deck-fixtures.ts`            | `scripts/verify-deck-intake.ts` one-slide acceptance                                                                                                         |
| `deck-image-only.pdf`    | `scripts/generate-deck-fixtures.ts`            | `scripts/verify-deck-intake.ts` text-empty slide acceptance                                                                                                  |
| `not-a-deck.txt`         | `scripts/generate-deck-fixtures.ts`            | `scripts/verify-deck-intake.ts` unknown-format rejection                                                                                                     |
| `fake.pdf`               | `scripts/generate-deck-fixtures.ts`            | `scripts/verify-deck-intake.ts` corrupt-PDF rejection                                                                                                        |
| `not-pptx.zip`           | `scripts/generate-deck-fixtures.ts`            | `scripts/verify-deck-intake.ts` corrupt-PPTX rejection                                                                                                       |
| `dc-injection-corpus.ts` | Hand-authored and maintained in this directory | `verify-dc-prepublish.ts`, `verify-dc-prompt-safety.ts`, and `verify-dc-routes.ts` difficult-conversation prompt-safety corpus                               |

Size-gate cases (`empty`, `too-large`) are constructed in memory by the deck
intake verifier, not committed as files.

## Why `deck-two-slide.pptx` is not called `spike-deck.pptx`

REQ-76 found a last-writer-wins collision: both
`generate-deck-fixtures.ts` and `spike-deck-render.ts` wrote
`spike-deck.pptx`, but their first-slide titles differed (`Spike Deck Title`
and `Spike Deck Slide 1`). `verify-deck-intake.ts` correctly asserted the
canonical generator's title, so running the spike afterward made that verifier
fail.

The canonical fixture therefore has its own descriptive path,
`deck-two-slide.pptx`. The 14-01 spike remains independent and continues to
own `spike-deck.pptx`; neither its behavior nor its artifact is retargeted.
Consolidating the generators was considered and deliberately deferred. If the
two decks drift again, consolidation—not another rename—is the next repair.
