import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { interviewSlugFromSegment, routes } from "../lib/routes";

const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const nextConfig = require(path.join(root, "next.config.js"));

const requiredPaths = [
  "app/practice/page.tsx", "app/practice/interviews/page.tsx", "app/practice/interviews/[type]/page.tsx", "app/practice/interviews/technical/page.tsx", "app/practice/interviews/industry-specific/page.tsx", "app/practice/interviews/customize/[slug]/page.tsx",
  "app/practice/case-studies/page.tsx", "app/practice/case-studies/new/page.tsx", "app/practice/case-studies/[caseId]/edit/page.tsx", "app/practice/case-studies/[caseId]/page.tsx",
  "app/practice/courageous-conversations/page.tsx", "app/practice/courageous-conversations/new/page.tsx", "app/practice/courageous-conversations/[id]/edit/page.tsx", "app/practice/courageous-conversations/[id]/page.tsx",
  "app/practice/networking/page.tsx", "app/practice/pitches/page.tsx", "app/practice/pitches/elevator/page.tsx", "app/practice/pitches/deck/page.tsx", "app/practice/pitches/deck/[mode]/page.tsx", "app/reports/[reportId]/page.tsx",
];
for (const file of requiredPaths) assert(existsSync(path.join(root, file)), `Missing canonical route: ${file}`);

const legacyLiterals = ["/case-play", "/conversations", "/interview"];
for (const file of ["components/practice/routes/LegacyCasePage.tsx", "components/practice/routes/PracticeInstancePage.tsx"]) {
  const source = read(file);
  assert(!legacyLiterals.some((literal) => new RegExp(`(?:href|backHref)=\"${literal}`).test(source)), `${file} contains a legacy browser literal`);
}

async function main() {
  const redirects = await nextConfig.redirects();
  const find = (source: string) => redirects.find((item: { source: string }) => item.source === source);
  const expectRedirect = (source: string, destination: string) => {
    const redirect = find(source);
    assert(redirect && redirect.destination === destination && redirect.permanent, `${source} must permanently redirect to ${destination}`);
  };
  expectRedirect("/practice/general", "/practice/interviews/general");
  expectRedirect("/practice/technical", "/practice/interviews/technical");
  assert(!existsSync(path.join(root, "app/practice/technical-coding/page.tsx")), "Standalone technical-coding route must not exist");
  assert(!redirects.some((item: { source: string }) => item.source === "/practice/technical-coding"), "Standalone technical-coding route must not redirect");
  assert(read("app/practice/interviews/technical/page.tsx").includes("TechnicalCodingPracticePage"), "Canonical technical route must launch coding");
  assert(read("app/practice/[type]/page.tsx").includes("type === \"technical-coding\") notFound()"), "Dynamic route must not catch the internal coding slug");
  // Report slugs never change; only the public path of the behavioral `technical` preset does.
  assert.equal(routes.interview("technical-coding"), "/practice/interviews/technical", "Coding interview owns /practice/interviews/technical");
  assert.equal(routes.interview("technical"), "/practice/interviews/technical-behavioral", "Behavioral technical preset has its own URL");
  assert.equal(routes.practiceType("technical"), routes.interview("technical"), "Plan links use the interview mapping");
  assert.equal(routes.practiceType("technical-coding"), routes.interview("technical-coding"), "Plan links use the interview mapping");
  assert.equal(routes.interview("general"), "/practice/interviews/general", "Unmapped presets keep slug URLs");
  assert.equal(interviewSlugFromSegment("technical-behavioral"), "technical", "[type] resolves the behavioral segment to the technical preset");
  assert.equal(interviewSlugFromSegment("consulting"), "consulting", "[type] passes other segments through");
  expectRedirect("/practice/consulting", "/practice/interviews/consulting");
  expectRedirect("/practice/early-career", "/practice/interviews/early-career");
  expectRedirect("/practice/:type/report/:reportId", "/reports/:reportId");
  assert(!redirects.some((item: { source: string }) => item.source === "/"), "The admin root must not redirect");
  for (const canonical of [routes.practice(), routes.interviews(), routes.interview("general"), routes.interview("technical"), routes.caseStudies(), routes.caseStudy("case-1"), routes.networking(), routes.pitches(), routes.elevatorPitch(), routes.deckPitch("pitch-deck"), routes.reports(), routes.report("report-1")]) {
    assert(!redirects.some((item: { source: string }) => item.source === canonical), `Canonical helper output is redirected: ${canonical}`);
  }
  console.log(`Route contract verified (${requiredPaths.length} canonical route files, ${redirects.length} redirects).`);
}
void main();
