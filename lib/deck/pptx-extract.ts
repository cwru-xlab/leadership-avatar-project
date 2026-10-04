/**
 * Per-slide PPTX text extraction for Phase 14 deck intake.
 *
 * 14-RESEARCH.md Don't-Hand-Roll row: text-only extraction is the one place a
 * lightweight pure-JS approach (jszip + narrow XML text-run walk) is correct.
 * FIDELITY RENDERING is explicitly NOT this module's job — that is 14-06's
 * conversion + rasterization path.
 */

import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";

const SLIDE_PATH_RE = /^ppt\/slides\/slide(\d+)\.xml$/;

/** Collapse runs of whitespace, trim. Shared by PDF and PPTX extractors. */
export function normalizeDeckWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function collectAtText(node: unknown, runs: string[]): void {
  if (node === null || node === undefined) {
    return;
  }

  if (Array.isArray(node)) {
    for (const child of node) {
      collectAtText(child, runs);
    }

    return;
  }

  if (typeof node !== "object") {
    return;
  }

  const obj = node as Record<string, unknown>;

  if ("a:t" in obj) {
    const tNodes = obj["a:t"];
    const list = Array.isArray(tNodes) ? tNodes : [tNodes];

    for (const t of list) {
      if (typeof t === "string" || typeof t === "number") {
        runs.push(String(t));
      } else if (t && typeof t === "object") {
        const text = (t as Record<string, unknown>)["#text"];

        if (typeof text === "string" || typeof text === "number") {
          runs.push(String(text));
        }
      }
    }
  }

  for (const [key, value] of Object.entries(obj)) {
    if (key === "a:t" || key.startsWith("@_")) {
      continue;
    }

    collectAtText(value, runs);
  }
}

/**
 * Walk an OOXML slide tree and collect `a:t` text in document order.
 * Within a paragraph (`a:p`) runs join with a space; paragraphs join with newline
 * before whitespace normalization.
 */
function extractSlideXmlText(xml: string): string {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    // Preserve tag names including namespace prefixes like a:t / a:p
    removeNSPrefix: false,
  });
  const doc = parser.parse(xml);
  const paragraphs: string[] = [];

  function walk(node: unknown): void {
    if (node === null || node === undefined) {
      return;
    }

    if (Array.isArray(node)) {
      for (const child of node) {
        walk(child);
      }

      return;
    }

    if (typeof node !== "object") {
      return;
    }

    const obj = node as Record<string, unknown>;

    if ("a:p" in obj) {
      const pNodes = obj["a:p"];
      const list = Array.isArray(pNodes) ? pNodes : [pNodes];

      for (const p of list) {
        const runs: string[] = [];

        collectAtText(p, runs);
        if (runs.length > 0) {
          paragraphs.push(runs.join(" "));
        }
      }
    }

    for (const [key, value] of Object.entries(obj)) {
      if (key === "a:p" || key.startsWith("@_")) {
        continue;
      }

      walk(value);
    }
  }

  walk(doc);

  // Join paragraphs with newline, then normalize (collapses to spaces — fine for LLM/density).
  return normalizeDeckWhitespace(paragraphs.join("\n"));
}

/**
 * Extract one text string per PPTX slide, in numeric slide order.
 * Throws a distinguishable error when the ZIP has no `ppt/slides/slideN.xml`
 * parts (e.g. a .docx hitting the same magic bytes) so intake maps to
 * `corrupt-pptx`.
 */
export async function extractPerSlideText(buffer: Buffer): Promise<string[]> {
  let zip: JSZip;

  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error("corrupt-pptx: not a readable ZIP/PPTX package");
  }

  const slideEntries: { num: number; path: string }[] = [];

  for (const path of Object.keys(zip.files)) {
    const match = SLIDE_PATH_RE.exec(path);

    if (match) {
      slideEntries.push({ num: Number(match[1]), path });
    }
  }

  if (slideEntries.length === 0) {
    // Distinguishable so intake maps ZIP-but-not-PPTX to corrupt-pptx.
    throw new Error("corrupt-pptx: no ppt/slides/slideN.xml parts");
  }

  // Numeric sort — string sort puts slide10 before slide2 (classic OOXML bug).
  slideEntries.sort((a, b) => a.num - b.num);

  const texts: string[] = [];

  for (const entry of slideEntries) {
    const file = zip.file(entry.path);

    if (!file) {
      texts.push("");
      continue;
    }

    const xml = await file.async("string");

    texts.push(extractSlideXmlText(xml));
  }

  return texts;
}
