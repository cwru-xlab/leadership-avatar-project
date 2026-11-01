import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { routes } from "../lib/routes";

const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const nextConfig = require(path.join(root, "next.config.js"));

const requiredPaths = [
  "app/practice/page.tsx", "app/practice/interviews/page.tsx", "app/practice/interviews/[type]/page.tsx",
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
  expectRedirect("/practice/consulting", "/practice/interviews/consulting");
  expectRedirect("/practice/early-career", "/practice/interviews/early-career");
  expectRedirect("/practice/:type/report/:reportId", "/reports/:reportId");
  assert(!redirects.some((item: { source: string }) => item.source === "/"), "The admin root must not redirect");
  for (const canonical of [routes.practice(), routes.interviews(), routes.interview("general"), routes.caseStudies(), routes.caseStudy("case-1"), routes.networking(), routes.pitches(), routes.elevatorPitch(), routes.deckPitch("pitch-deck"), routes.reports(), routes.report("report-1")]) {
    assert(!redirects.some((item: { source: string }) => item.source === canonical), `Canonical helper output is redirected: ${canonical}`);
  }
  console.log(`Route contract verified (${requiredPaths.length} canonical route files, ${redirects.length} redirects).`);
}
void main();
