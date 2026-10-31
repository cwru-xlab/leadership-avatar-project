/**
 * Guards for the fixes from the 2026-10-25 agent-verified keyboard UAT
 * (17-05 / 19-11): D15-2, D19-1, K-1..K-7, D15-3, D15-4, D16-1, D17-1, D17-2.
 * Each rule is a source predicate with a bite-proof (a mutated source that
 * must fail it), so a guard that cannot fail is caught.
 *
 * Run: npx tsx scripts/verify-uat-polish.ts
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
/** Source without comments, so a comment that names a forbidden pattern is not a hit. */
const code = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}
function rule(label: string, src: string, predicate: (s: string) => boolean, mutate: (s: string) => string) {
  check(label, predicate(src));
  check(`bite-proof: ${label}`, !predicate(mutate(src)));
}

console.log("1. D15-2 — no server component passes a component function as a prop");
{
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx$/.test(name)) {
        const src = code(readFileSync(full, "utf8"));
        if (!/^\s*["']use client["']/.test(src) && /\bas=\{Link\}/.test(src)) offenders.push(full.replace(ROOT + "/", ""));
      }
    }
  };
  walk(resolve(ROOT, "app"));
  check("no server component under app/ renders as={Link}", offenders.length === 0, offenders.join(", "));
  const page = code(read("app/conversations/[id]/page.tsx"));
  check("bite-proof: the detector flags as={Link} in a server component", !/^\s*["']use client["']/.test(page) && /\bas=\{Link\}/.test(`${page}\n<Button as={Link} />`));
}

console.log("\n2. D19-1 — each deck mode's session length uses its own envelope");
{
  const step = read("components/practice/steps/SessionLengthStep.tsx");
  rule("SessionLengthStep takes envelopeSeconds and no longer imports DECK_ENVELOPE_SECONDS", step,
    (s) => /envelopeSeconds: readonly \[number, number\]/.test(s) && !/DECK_ENVELOPE_SECONDS/.test(s),
    (s) => s.replace('import { proposeDeckSeconds } from "@/lib/pitch/session-length";', 'import { DECK_ENVELOPE_SECONDS, proposeDeckSeconds } from "@/lib/pitch/session-length";'));
  const page = read("app/practice/[type]/page.tsx");
  rule("the wizard passes deckMode.envelopeSeconds", page,
    (s) => /envelopeSeconds=\{deckMode\.envelopeSeconds\}/.test(s),
    (s) => s.replace("envelopeSeconds={deckMode.envelopeSeconds}", "envelopeSeconds={[1200, 1800]}"));
}

console.log("\n3. K-1 — verdict and negotiation titles are headings");
{
  const verdict = read("components/practice/report/DeckVerdictPanel.tsx");
  rule("DeckVerdictPanel title is an <h2>", verdict, (s) => /<h2 className="[^"]*">\{heading\}<\/h2>/.test(s),
    (s) => s.replace(/<h2 (className="[^"]*")>\{heading\}<\/h2>/, "<p $1>{heading}</p>"));
  const triple = read("components/practice/report/NegotiationTriplePanel.tsx");
  rule("NegotiationTriplePanel title is an <h2>", triple, (s) => /<h2 [^>]*>\s*Ask · Settled · Fair range\s*<\/h2>/.test(s),
    (s) => s.replace(/<h2 ([^>]*)>(\s*Ask · Settled · Fair range\s*)<\/h2>/, "<p $1>$2</p>"));
}

console.log("\n4. K-2 — deck-mode Start buttons name their mode");
{
  const pitches = `${read("app/practice/pitches/page.tsx")}\n${read("app/practice/pitches/deck/page.tsx")}`;
  rule("both Start links (elevator, deck mode) carry a mode-specific aria-label", pitches,
    (s) => (s.match(/(?:aria-label|ariaLabel)=\{`Start \$\{/g) ?? []).length === 2,
    (s) => s.replace("aria-label={`Start ${mode.cardTitle}`}", ""));
}

console.log("\n5. K-3 — funding and talk Continue are disabled until valid");
for (const file of ["components/practice/steps/FundingAskStep.tsx", "components/practice/steps/TalkAudienceStep.tsx"]) {
  rule(`${file.split("/").pop()} Continue has isDisabled={!canAdvance}`, read(file),
    (s) => /isDisabled=\{!canAdvance\}[\s\S]{0,80}onPress=\{commitAndAdvance\}/.test(s),
    (s) => s.replace("isDisabled={!canAdvance}", ""));
}

console.log("\n6. K-4 — the timer toggle keeps focus");
rule("DeckTimerPanel refocuses the replacement toggle after a toggle", read("components/practice/panels/DeckTimerPanel.tsx"),
  (s) => /toggledRef\.current = true;/.test(s) && /toggleRef\.current\?\.focus\(\)/.test(s) && (s.match(/ref=\{toggleRef\}/g) ?? []).length === 2,
  (s) => s.replace("toggleRef.current?.focus();", ""));

console.log("\n7. K-5 / K-6 — deck modes use their own listener wording");
{
  const viewer = read("components/practice/panels/DeckViewerPanel.tsx");
  rule("slide thumbnails name the mode's audience, not 'the investor'", viewer,
    (s) => !/shown to the investor/.test(s) && /shown to \$\{audienceLabel\}/.test(s),
    (s) => s.replace("shown to ${audienceLabel}", "shown to the investor"));
  const page = read("app/practice/[type]/page.tsx");
  rule("pitch modes pass their own avatar-step heading and role line", page,
    (s) => /heading: "Choose who you'll pitch to\."/.test(s) && /roleLabel: deckMode\?\.listenerLine/.test(s),
    (s) => s.replace(`heading: "Choose who you'll pitch to.",`, ""));
}

console.log("\n8. K-7 — the deck drop zone shows keyboard focus");
rule("drop-zone label rings when its file input is keyboard-focused", read("components/practice/steps/DeckUploadStep.tsx"),
  (s) => /has-\[:focus-visible\]:outline-2/.test(s),
  (s) => s.replace(/ has-\[:focus-visible\]:outline-2/, ""));

console.log("\n9. D15-3 — the post-create card reflects publish state");
rule("card title switches to 'Saved — published' when published", read("components/difficult-conversation/ConversationBuilder.tsx"),
  (s) => /published \? "Saved — published" : "Saved — private"/.test(s),
  (s) => s.replace('{published ? "Saved — published" : "Saved — private"}', "Saved — private"));

console.log("\n10. D15-4 — difficulty radios support arrow keys");
rule("roving tabindex plus an arrow-key handler", read("components/practice/steps/ConversationDifficultyStep.tsx"),
  (s) => /tabIndex=\{isSelected \? 0 : -1\}/.test(s) && /ArrowDown/.test(s) && /onKeyDown=\{\(event\) => handleBandKeyDown\(event, index\)\}/.test(s),
  (s) => s.replace("onKeyDown={(event) => handleBandKeyDown(event, index)}", ""));

console.log("\n11. D17-2 — the persona textarea has an accessible name");
rule("CustomizePanel persona Textarea has aria-label", read("components/interview/CustomizePanel.tsx"),
  (s) => /aria-label="Description of who is interviewing you"/.test(s),
  (s) => s.replace('aria-label="Description of who is interviewing you"', ""));

console.log("\n12. D16-1 / D17-1 — networking evaluator wording");
rule("common ground must be shared by both people; never 'the interviewer'", read("lib/networking/prompts.ts"),
  (s) => /BOTH people turned out to share/.test(s) && /by their name or role, and to the session as "the conversation"/.test(s),
  (s) => s.replace("BOTH people turned out to share", "came up"));

if (!existsSync(resolve(ROOT, "lib/networking/prompts.ts"))) failures += 1;
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
