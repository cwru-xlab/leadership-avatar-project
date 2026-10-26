/**
 * Plan 22-11: coach choice lives in Settings only; the coached flow is
 * picker-free; every student has a default coach.
 *
 * Run: DATABASE_URL=postgresql://... npx tsx scripts/verify-coach-settings.ts
 * (DB section is gated on DATABASE_URL.)
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const rel = (p: string) => relative(ROOT, p).replace(/\\/g, "/");

let failures = 0;
function check(name: string, pass: boolean, detail?: string) {
  if (pass) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(full);
  }
  return out;
}

/** Picker-in-coached-flow detector: returns the violations found in `src`. */
export function pickerViolations(src: string): string[] {
  const v: string[] = [];
  if (/\/api\/settings\/coach/.test(src)) v.push("/api/settings/coach");
  if (/\/api\/interview\/interviewers/.test(src)) v.push("/api/interview/interviewers");
  if (/@heroui\/select/.test(src) || /<Select[\s>]/.test(src)) v.push("Select");
  if (/\bRoster\w*|\bInterviewerPicker\b|\bCoachPicker\b/.test(src)) v.push("roster/picker component");
  return v;
}

async function main() {
  console.log("1. Settings page");
  const page = read("app/settings/page.tsx");
  check("references /api/settings/coach", page.includes("/api/settings/coach"));
  check("references /api/interview/interviewers", page.includes("/api/interview/interviewers"));
  check("does not import InteractiveAvatarWrapper", !/InteractiveAvatarWrapper/.test(page));

  console.log("2. No picker in the coached flow");
  const files = [
    join(ROOT, "components/study-plan/CoachedSessionShell.tsx"),
    ...walk(join(ROOT, "components/study-plan/coached")),
    join(ROOT, "app/study-plans/[planId]/coached/[stepId]/page.tsx"),
  ].filter(existsSync);
  check("coached flow files found", files.length >= 2, `found ${files.length}`);
  for (const f of files) {
    const v = pickerViolations(readFileSync(f, "utf8"));
    check(`${rel(f)} picker-free`, v.length === 0, v.join(", "));
  }

  console.log("3. Route does not enter coached mode");
  const route = read("app/api/settings/coach/route.ts");
  check("no enterCoachedStep|completeCoachedSession", !/enterCoachedStep|completeCoachedSession/.test(route));
  check("exports GET, PUT, DELETE", /export async function GET/.test(route) && /export async function PUT/.test(route) && /export async function DELETE/.test(route));
  check("uses resolveCoachForUser", route.includes("resolveCoachForUser"));

  console.log("5. Bite-proof (run before DB section)");
  check(
    "detector flags fetch of interviewers",
    pickerViolations('fetch("/api/interview/interviewers")').length > 0,
  );

  console.log("4. DB: default / chosen / reset");
  if (!process.env.DATABASE_URL) {
    console.log("  SKIP DATABASE_URL not set");
  } else {
    const { prisma } = await import("../lib/prisma");
    const { resolveCoachForUser, DEFAULT_COACH } = await import(
      "../lib/study-plan/coached/coach-identity"
    );
    const email = `coach-settings-verify-${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: { email, name: "Coach Verify", role: "STUDENT" },
    });
    try {
      const a = await resolveCoachForUser(user.id);
      check("fresh user gets default", a.isDefault && a.avatarId === DEFAULT_COACH.avatarId);
      await prisma.user.update({
        where: { id: user.id },
        data: { coachAvatarId: "av-x", coachVoiceId: "vo-x", coachName: "Zed" },
      });
      const b = await resolveCoachForUser(user.id);
      check(
        "chosen coach is returned, not default",
        !b.isDefault && b.avatarId === "av-x" && b.voiceId === "vo-x" && b.name === "Zed",
      );
      await prisma.user.update({
        where: { id: user.id },
        data: { coachAvatarId: null, coachVoiceId: null, coachName: null },
      });
      const c = await resolveCoachForUser(user.id);
      check("nulled columns fall back to default", c.isDefault && c.avatarId === DEFAULT_COACH.avatarId);
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
      await prisma.$disconnect();
    }
    console.log("  DB section RUN");
  }

  if (failures) {
    console.log(`\n${failures} FAILED`);
    process.exit(1);
  }
  console.log("\nAll checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
