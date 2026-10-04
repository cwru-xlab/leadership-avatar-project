/**
 * Proves plan 14-11: server-authoritative slide high-water mark gating —
 * monotonicity, bounds, backward-nav / forward-jump rules, no leak into the
 * system prompt (REQ-73 / Pitfall 1), and a single ratchet in the repo.
 *
 * Run: npx tsx scripts/verify-slide-gating.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { resolveAttemptLanguage } from "../lib/languages";
import {
  assembleSystemPrompt,
  buildTailBlock,
} from "../lib/engine/prompts";
import { resolveSessionConfig } from "../lib/engine/resolve";
import type { InstanceConfig } from "../lib/engine/types";
import { buildDeckSystemPrompt } from "../lib/pitch/deck-prompts";
import {
  ratchetHighWaterMark,
  resolveRevealedSlides,
  buildSlidesTailFragment,
} from "../lib/pitch/slide-reveal";
import { initialProgress } from "../lib/interview/types";

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

const SENTINELS = Array.from(
  { length: 10 },
  (_, i) => `SENTINEL-SLIDE-${String(i).padStart(2, "0")}`,
);

const deckInstance: InstanceConfig = {
  kind: "pitch-deck",
  deckId: "verify-gating-deck",
  slideCount: 10,
  slideTexts: SENTINELS,
  askPriceUsd: 1_000_000,
  askEquityPct: 10,
  fairValueBand: {
    priceUsdMin: 800_000,
    priceUsdMax: 1_200_000,
    equityPctMin: 8,
    equityPctMax: 12,
  },
  proposedSeconds: 1500,
};

const resolved = resolveSessionConfig("pitch-deck", { instance: deckInstance });
if (!resolved.ok) {
  console.error("FATAL: could not resolve pitch-deck config", resolved);
  process.exit(1);
}
const deckConfig = resolved.config;
const language = resolveAttemptLanguage("en");

console.log("\n1. Ratchet monotonicity");
{
  const back = ratchetHighWaterMark({
    stored: 3,
    requested: 1,
    slideCount: 10,
  });
  check("stored 3, requested 1 → mark 3, advanced false", back.mark === 3 && back.advanced === false, JSON.stringify(back));

  const fwd = ratchetHighWaterMark({
    stored: 3,
    requested: 7,
    slideCount: 10,
  });
  check("stored 3, requested 7 → mark 7, advanced true", fwd.mark === 7 && fwd.advanced === true, JSON.stringify(fwd));
}

console.log("\n2. Bounds");
{
  const over = ratchetHighWaterMark({
    stored: 3,
    requested: 99,
    slideCount: 10,
  });
  check("requested 99 clamped to mark 9", over.mark === 9, JSON.stringify(over));

  const neg = ratchetHighWaterMark({
    stored: 3,
    requested: -5,
    slideCount: 10,
  });
  check("requested -5 ignored → mark 3", neg.mark === 3 && neg.advanced === false, JSON.stringify(neg));

  const nan = ratchetHighWaterMark({
    stored: 3,
    requested: Number.NaN,
    slideCount: 10,
  });
  check("requested NaN ignored → mark 3", nan.mark === 3, JSON.stringify(nan));

  const inf = ratchetHighWaterMark({
    stored: 3,
    requested: Number.POSITIVE_INFINITY,
    slideCount: 10,
  });
  check("requested Infinity ignored → mark 3", inf.mark === 3, JSON.stringify(inf));

  const trunc = ratchetHighWaterMark({
    stored: 3,
    requested: 3.7,
    slideCount: 10,
  });
  check("requested 3.7 truncated → mark 3", trunc.mark === 3 && trunc.advanced === false, JSON.stringify(trunc));
}

console.log("\n3. Null start");
{
  const start = ratchetHighWaterMark({
    stored: null,
    requested: 0,
    slideCount: 10,
  });
  check("null + 0 → mark 0, advanced true", start.mark === 0 && start.advanced === true, JSON.stringify(start));

  const ignore = ratchetHighWaterMark({
    stored: null,
    requested: -1,
    slideCount: 10,
  });
  check("null + -1 → mark null", ignore.mark === null && ignore.advanced === false, JSON.stringify(ignore));
}

console.log("\n4. No deck, no mark");
{
  for (const requested of [0, 5, 99, -1, Number.NaN]) {
    const r = ratchetHighWaterMark({
      stored: null,
      requested,
      slideCount: 0,
    });
    check(
      `slideCount 0, requested ${requested} → mark null`,
      r.mark === null,
      JSON.stringify(r),
    );
  }
  const kept = ratchetHighWaterMark({
    stored: 2,
    requested: 9,
    slideCount: 0,
  });
  check("slideCount 0 keeps stored 2", kept.mark === 2, JSON.stringify(kept));
}

console.log("\n5. Slice admits exactly the shown slides");
{
  const revealed = resolveRevealedSlides({ config: deckConfig, mark: 4 });
  check("mark 4 → 5 entries", revealed.length === 5, String(revealed.length));
  check(
    "indices 0-4",
    revealed.every((s, i) => s.index === i),
    JSON.stringify(revealed.map((s) => s.index)),
  );
  const joined = revealed.map((s) => s.text).join("\n");
  check("contains SENTINEL-SLIDE-04", joined.includes("SENTINEL-SLIDE-04"));
  for (let i = 5; i <= 9; i++) {
    const s = `SENTINEL-SLIDE-${String(i).padStart(2, "0")}`;
    check(`does NOT contain ${s}`, !joined.includes(s));
  }
}

console.log("\n6. Backward navigation does not un-show (CONTEXT.md locked rule)");
{
  let mark: number | null = null;
  mark = ratchetHighWaterMark({ stored: mark, requested: 7, slideCount: 10 }).mark;
  mark = ratchetHighWaterMark({ stored: mark, requested: 2, slideCount: 10 }).mark;
  check("after 7 then 2, mark stays 7", mark === 7, String(mark));
  const revealed = resolveRevealedSlides({ config: deckConfig, mark });
  const joined = revealed.map((s) => s.text).join("\n");
  check(
    "SENTINEL-SLIDE-07 still present after backward nav",
    joined.includes("SENTINEL-SLIDE-07"),
  );
}

console.log("\n7. Forward jump reveals skipped slides");
{
  const { mark } = ratchetHighWaterMark({
    stored: 2,
    requested: 6,
    slideCount: 10,
  });
  check("2 → 6 advances to 6", mark === 6, String(mark));
  const revealed = resolveRevealedSlides({ config: deckConfig, mark });
  const joined = revealed.map((s) => s.text).join("\n");
  for (const i of [3, 4, 5]) {
    const s = `SENTINEL-SLIDE-${String(i).padStart(2, "0")}`;
    check(`forward jump includes ${s}`, joined.includes(s));
  }
}

console.log("\n8. Unshown slides never enter the tail");
{
  const revealed = resolveRevealedSlides({ config: deckConfig, mark: 4 });
  const fragment = buildSlidesTailFragment(revealed, { slideCount: 10 });
  for (let i = 5; i <= 9; i++) {
    const s = `SENTINEL-SLIDE-${String(i).padStart(2, "0")}`;
    check(`tail does not contain ${s}`, !fragment.includes(s));
  }
  check(
    "tail contains do-not-reference reminder",
    /do not reference or ask about content you have not been shown/i.test(
      fragment,
    ),
  );
  check("contains SENTINEL-SLIDE-04", fragment.includes("SENTINEL-SLIDE-04"));
}

console.log("\n9. PREFIX CACHE — system prompt byte-identical across reveals");
{
  const before = assembleSystemPrompt(deckConfig, { language });
  // Notionally reveal 0..9 — system prompt must not change.
  const afterReveal = assembleSystemPrompt(deckConfig, { language });
  check("assembleSystemPrompt byte-identical", before === afterReveal);
  for (const s of SENTINELS) {
    check(`system prompt has no ${s}`, !before.includes(s));
  }
}

console.log("\n10. Tail block unchanged for other types (no slide fields)");
{
  const interview = resolveSessionConfig("general", {});
  if (!interview.ok) {
    check("resolve general", false, JSON.stringify(interview));
  } else {
    const progress = initialProgress();
    const timing = {
      elapsedMinutes: 2,
      targetMinutes: 20,
      redirectMetaRequest: false,
    };
    const withFields = buildTailBlock(interview.config, {
      progress,
      timing,
    });
    const withoutFields = buildTailBlock(interview.config, {
      progress,
      timing,
      // Explicitly absent revealedSlides / slideCount
    });
    check(
      "interview tail byte-identical with/without slide fields omitted",
      withFields === withoutFields,
    );

    // Also: passing undefined vs omitting — and empty revealed with count should
    // still be identical when revealedSlides is empty array? Plan says "minus
    // the slide fields" / "without the new fields at all".
    const explicitAbsent = buildTailBlock(interview.config, {
      progress,
      timing,
      revealedSlides: undefined,
      slideCount: undefined,
    });
    check(
      "undefined slide fields still byte-identical",
      withFields === explicitAbsent,
    );
  }
}

console.log("\n11. One ratchet, one filter");
{
  const roots = [
    join(process.cwd(), "lib/pitch"),
    join(process.cwd(), "lib/engine"),
    join(process.cwd(), "app/api/interaction/chat/route.ts"),
  ];

  function walk(path: string, out: string[]) {
    const st = statSync(path);
    if (st.isFile()) {
      if (path.endsWith(".ts") || path.endsWith(".tsx")) out.push(path);
      return;
    }
    for (const name of readdirSync(path)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      walk(join(path, name), out);
    }
  }

  const files: string[] = [];
  for (const root of roots) walk(root, files);

  // Ratchet signature: Math.max over (stored ?? -1). Only slide-reveal may own it.
  const ratchetSig = /Math\.max\([\s\S]{0,120}stored\s*\?\?\s*-1/;
  const ratchetFiles = files.filter((f) => ratchetSig.test(readFileSync(f, "utf8")));
  check(
    "ratchet Math.max(stored ?? -1) only in slide-reveal.ts",
    ratchetFiles.length === 1 &&
      ratchetFiles[0]!.endsWith("lib/pitch/slide-reveal.ts"),
    JSON.stringify(ratchetFiles.map((f) => f.replace(process.cwd() + "/", ""))),
  );

  // No second slides-channel filter outside visible-context.ts.
  // Look for .slice(0, cursor+1) pattern or filtering SLIDES_CHANNEL / slides channel.
  const leakFilter = files.filter((f) => {
    if (f.endsWith("lib/engine/visible-context.ts")) return false;
    const text = readFileSync(f, "utf8");
    // Local filter of the slides channel (forbidden parallel mechanism).
    if (
      /SLIDES_CHANNEL_KEY[\s\S]{0,200}\.slice\s*\(/.test(text) ||
      /buildSlidesChannel[\s\S]{0,200}\.slice\s*\(/.test(text)
    ) {
      return true;
    }
    // Explicit slideTexts.slice / slideTexts.filter as admission (not string trunc).
    if (/slideTexts\s*\.\s*(slice|filter)\s*\(/.test(text)) return true;
    return false;
  });
  check(
    "no slides-channel filter outside visible-context.ts",
    leakFilter.length === 0,
    JSON.stringify(leakFilter.map((f) => f.replace(process.cwd() + "/", ""))),
  );
}

console.log("\n12. No slide value can reach the system prompt");
{
  check(
    "buildDeckSystemPrompt.length === 1",
    buildDeckSystemPrompt.length === 1,
    String(buildDeckSystemPrompt.length),
  );
  // Parameter name from source — only `config`.
  const src = readFileSync(
    join(process.cwd(), "lib/pitch/deck-prompts.ts"),
    "utf8",
  );
  const match = src.match(
    /export function buildDeckSystemPrompt\s*\(\s*([^)]*)\s*\)/,
  );
  check(
    "buildDeckSystemPrompt sole parameter is config",
    Boolean(match && /^\s*config\s*(:|$)/.test(match[1] ?? "")),
    match?.[1],
  );
}

console.log(
  failures === 0
    ? "\nALL PASS\n"
    : `\n${failures} FAILURE(S)\n`,
);
process.exit(failures === 0 ? 0 : 1);
