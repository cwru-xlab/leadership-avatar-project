/**
 * Prove deck intake against real fixture files (14-03).
 * Run: npx tsx scripts/verify-deck-intake.ts
 */
import { readFileSync } from "fs";
import { join } from "path";

import { validateAndExtractDeck } from "../lib/deck/intake";
import {
  DECK_REJECTIONS,
  MAX_DECK_SIZE_BYTES,
  type DeckRejectionCode,
} from "../lib/deck/types";

const FIXTURES = join(process.cwd(), "scripts/fixtures");
let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    failed += 1;
  } else {
    console.log(`  ok: ${message}`);
  }
}

function load(name: string): Buffer {
  return readFileSync(join(FIXTURES, name));
}

async function section(n: number, title: string, fn: () => Promise<void>) {
  console.log(`\n${n}. ${title}`);
  await fn();
}

async function main() {
  await section(1, "deck-landscape.pdf happy path", async () => {
    const result = await validateAndExtractDeck(load("deck-landscape.pdf"));

    assert(result.ok === true, "ok: true");
    if (result.ok) {
      assert(result.format === "pdf", 'format: "pdf"');
      assert(result.slides.length === 3, "slides.length === 3");
      assert(
        result.slides.map((s) => s.index).join(",") === "0,1,2",
        "indices [0,1,2]"
      );
      assert(
        result.slides.every((s) => s.text.length > 0),
        "every text non-empty"
      );
    }
  });

  await section(2, "spike-deck.pptx happy path", async () => {
    const result = await validateAndExtractDeck(load("spike-deck.pptx"));

    assert(result.ok === true, "ok: true");
    if (result.ok) {
      assert(result.format === "pptx", 'format: "pptx"');
      assert(result.slides.length === 2, "slide count matches fixture (2)");
      assert(
        result.slides[0].text.includes("Spike Deck Title"),
        "slide 1 title text appears in slides[0].text"
      );
    }
  });

  await section(3, "deck-portrait.pdf accepted (no page-shape rejection)", async () => {
    // CONTEXT.md forbids rejecting on page shape; this assertion is the guard.
    const result = await validateAndExtractDeck(load("deck-portrait.pdf"));

    assert(result.ok === true, "ok: true (portrait accepted)");
  });

  await section(4, "deck-one-slide.pdf accepted (no slide-count rejection)", async () => {
    // CONTEXT.md forbids rejecting on slide count.
    const result = await validateAndExtractDeck(load("deck-one-slide.pdf"));

    assert(result.ok === true, "ok: true");
    if (result.ok) {
      assert(result.slides.length === 1, "slides.length === 1");
    }
  });

  await section(5, "deck-image-only.pdf accepts empty middle slide", async () => {
    const result = await validateAndExtractDeck(load("deck-image-only.pdf"));

    assert(result.ok === true, "ok: true");
    if (result.ok) {
      assert(result.slides.length === 3, "slides.length === 3");
      assert(result.slides[1].text === "", 'slides[1].text === ""');
    }
  });

  await section(6, "not-a-deck.txt → unknown-format with reason+fix", async () => {
    const result = await validateAndExtractDeck(load("not-a-deck.txt"));

    assert(result.ok === false, "ok: false");
    if (!result.ok) {
      assert(result.code === "unknown-format", 'code: "unknown-format"');
      assert(result.reason.length > 0, "reason non-empty");
      assert(result.fix.length > 0, "fix non-empty");
    }
  });

  await section(7, "fake.pdf → corrupt-pdf with reason+fix", async () => {
    const result = await validateAndExtractDeck(load("fake.pdf"));

    assert(result.ok === false, "ok: false");
    if (!result.ok) {
      assert(result.code === "corrupt-pdf", 'code: "corrupt-pdf"');
      assert(result.reason.length > 0, "reason non-empty");
      assert(result.fix.length > 0, "fix non-empty");
    }
  });

  await section(8, "not-pptx.zip → corrupt-pptx with reason+fix", async () => {
    const result = await validateAndExtractDeck(load("not-pptx.zip"));

    assert(result.ok === false, "ok: false");
    if (!result.ok) {
      assert(result.code === "corrupt-pptx", 'code: "corrupt-pptx"');
      assert(result.reason.length > 0, "reason non-empty");
      assert(result.fix.length > 0, "fix non-empty");
    }
  });

  await section(9, "empty and too-large size gates", async () => {
    const empty = await validateAndExtractDeck(Buffer.alloc(0));

    assert(empty.ok === false && empty.code === "empty", 'zero-length → "empty"');

    const tooLarge = await validateAndExtractDeck(
      Buffer.alloc(MAX_DECK_SIZE_BYTES + 1)
    );

    assert(
      tooLarge.ok === false && tooLarge.code === "too-large",
      '26MB zeros → "too-large"'
    );
  });

  await section(10, "copy completeness guard for every DeckRejectionCode", async () => {
    const codes = Object.keys(DECK_REJECTIONS) as DeckRejectionCode[];

    assert(codes.length === 7, "seven rejection codes");
    for (const code of codes) {
      const copy = DECK_REJECTIONS[code];

      assert(copy.reason.length > 0, `${code}.reason non-empty`);
      assert(copy.fix.length > 0, `${code}.fix non-empty`);
      assert(copy.fix !== copy.reason, `${code}.fix !== .reason`);
    }
  });

  await section(11, "no-escape-hatch guard on intake/types sources", async () => {
    const intake = readFileSync(join(process.cwd(), "lib/deck/intake.ts"), "utf8");
    const types = readFileSync(join(process.cwd(), "lib/deck/types.ts"), "utf8");
    const combined = `${intake}\n${types}`;

    assert(!/without a deck/i.test(combined), 'no "without a deck"');
    assert(!/warning/i.test(combined), 'no "warning"');
  });

  console.log("");
  if (failed > 0) {
    console.error(`FAILED: ${failed} assertion(s)`);
    process.exit(1);
  }

  console.log("All eleven sections passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
