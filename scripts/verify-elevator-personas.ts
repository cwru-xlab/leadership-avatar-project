/**
 * Proves the elevator listener draw without a database or a live avatar:
 * roster shape, selection distribution, no immediate repeats, catalog fallback,
 * and a stable identity across wizard refresh, restart, reconnect and grading.
 *
 * Run: npx tsx scripts/verify-elevator-personas.ts
 */

import { SEATED_PUBLIC_AVATAR_ID_SET } from "@/lib/avatar-roster";
import { resolveSessionConfig } from "@/lib/engine/resolve";
import { pitchSnapshotFromInstance } from "@/lib/engine/session";
import { instanceFromPitchSnapshot } from "@/lib/engine/evaluation-runner";
import {
  ELEVATOR_LISTENER_PERSONA,
  ELEVATOR_LISTENER_ROSTER as ROSTER,
  ELEVATOR_RESTART_PIN_MS,
  chooseElevatorListener,
  resolveElevatorListener,
  type ElevatorDrawHistoryEntry,
} from "@/lib/pitch/elevator-personas";
import {
  buildElevatorEvaluationContext,
  buildElevatorSystemPrompt,
} from "@/lib/pitch/elevator-prompts";
import type { InstanceConfig } from "@/lib/engine/types";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
}

const ALL = new Set(ROSTER.map((p) => p.id));
const NOW = 1_800_000_000_000;

/** Plays `n` finished sessions for one student and returns the listener ids. */
function play(
  userId: string,
  n: number,
  available: ReadonlySet<string> = ALL,
): string[] {
  const history: ElevatorDrawHistoryEntry[] = [];
  const seen: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const persona = chooseElevatorListener({
      userId,
      history,
      pitchSubject: `subject ${i}`,
      blind: i % 3 === 0,
      availableIds: available,
      nowMs: NOW + i,
    });
    seen.push(persona.id);
    history.unshift({
      reportId: `${userId}-r${i}`,
      personaId: persona.id,
      status: "READY",
      createdAtMs: NOW + i,
      pitchSubject: `subject ${i}`,
    });
  }
  return seen;
}

async function main() {
  // ---- Roster shape ----
  check("roster has at least 12 people", ROSTER.length >= 12, `${ROSTER.length}`);
  for (const key of [
    "id",
    "name",
    "role",
    "temperament",
    "avatarId",
    "voiceId",
  ] as const) {
    check(
      `every ${key} is unique`,
      new Set(ROSTER.map((p) => p[key])).size === ROSTER.length,
    );
  }
  check(
    "at least 6 seniority levels and 12 industries",
    new Set(ROSTER.map((p) => p.seniority)).size >= 6 &&
      new Set(ROSTER.map((p) => p.industry)).size >= 12,
    `${new Set(ROSTER.map((p) => p.seniority)).size} levels, ${new Set(ROSTER.map((p) => p.industry)).size} industries`,
  );
  check(
    "faces only from the public seated roster (never faculty likenesses)",
    ROSTER.every((p) => SEATED_PUBLIC_AVATAR_ID_SET.has(p.avatarId)),
  );
  const women = ROSTER.filter((p) => p.presentation === "female").length;
  check(
    "cast is balanced by presentation",
    Math.abs(women - (ROSTER.length - women)) <= 2,
    `${women} / ${ROSTER.length - women}`,
  );
  check(
    "legacy listener is not in the draw",
    !ROSTER.some((p) => p.name === ELEVATOR_LISTENER_PERSONA.name),
  );

  // ---- Distribution ----
  const counts = new Map(ROSTER.map((p) => [p.id, 0]));
  const firsts = new Map(ROSTER.map((p) => [p.id, 0]));
  let immediateRepeats = 0;
  let repeatsInWindow = 0;
  const USERS = 300;
  const SESSIONS = 30;
  for (let u = 0; u < USERS; u += 1) {
    const ids = play(`user-${u}`, SESSIONS);
    firsts.set(ids[0], (firsts.get(ids[0]) ?? 0) + 1);
    ids.forEach((id, i) => {
      counts.set(id, (counts.get(id) ?? 0) + 1);
      if (i > 0 && ids[i - 1] === id) immediateRepeats += 1;
      if (ids.slice(Math.max(0, i - 12), i).includes(id)) repeatsInWindow += 1;
    });
  }
  const total = USERS * SESSIONS;
  const expected = total / ROSTER.length;
  console.log(`\nDistribution over ${total} sessions (expected ${expected.toFixed(0)} each):`);
  for (const p of ROSTER) {
    const c = counts.get(p.id) ?? 0;
    console.log(`  ${p.name.padEnd(20)} ${String(c).padStart(5)}  ${"#".repeat(Math.round(c / 30))}`);
  }
  const values = [...counts.values()];
  check(
    "every person is drawn, none over 25% off an even share",
    Math.min(...values) > expected * 0.75 && Math.max(...values) < expected * 1.25,
    `min ${Math.min(...values)}, max ${Math.max(...values)}`,
  );
  check(
    "first sessions spread across the cast",
    [...firsts.values()].filter((v) => v > 0).length === ROSTER.length,
    `max ${Math.max(...firsts.values())} of ${USERS}`,
  );
  check("no immediate repeats", immediateRepeats === 0, `${immediateRepeats}`);
  check("no repeat within 12 sessions", repeatsInWindow === 0, `${repeatsInWindow}`);
  check(
    "fully deterministic: replay gives the same sequence",
    play("user-7", SESSIONS).join() === play("user-7", SESSIONS).join(),
  );
  check(
    "two students do not share a sequence",
    play("user-7", 8).join() !== play("user-8", 8).join(),
  );
  console.log(`  sample, one student: ${play("alice", 8).map((id) => id.split("-")[0]).join(", ")}`);

  // ---- Catalog fallback ----
  const fewIds = new Set(ROSTER.slice(0, 4).map((p) => p.id));
  const few = play("churn", 20, fewIds);
  check(
    "only people whose avatar is live are drawn",
    few.every((id) => fewIds.has(id)),
  );
  check(
    "a shrunken catalog still avoids immediate repeats",
    few.every((id, i) => i === 0 || few[i - 1] !== id),
  );
  const noCatalog = play("no-catalog", 5, new Set());
  check("no usable catalog keeps the whole roster eligible", noCatalog.length === 5);
  const one = play("one-left", 3, new Set([ROSTER[0].id]));
  check("a single live avatar still returns someone", one.every((id) => id === ROSTER[0].id));

  // ---- Stable identity ----
  const base = {
    userId: "resume",
    pitchSubject: "campus composting",
    availableIds: ALL,
    nowMs: NOW,
  };
  const prior: ElevatorDrawHistoryEntry[] = [
    {
      reportId: "older",
      personaId: ROSTER[3].id,
      status: "READY",
      createdAtMs: NOW - 86_400_000,
      pitchSubject: "older",
    },
  ];
  const sighted = chooseElevatorListener({ ...base, history: prior, blind: false });
  check(
    "wizard refresh: preview and start compute the same person",
    sighted.id === chooseElevatorListener({ ...base, history: prior, blind: false }).id,
  );
  const blindDraw = chooseElevatorListener({ ...base, history: prior, blind: true });
  check(
    "peeking at name-role cannot reveal the blind listener",
    blindDraw.id !== sighted.id,
  );

  const started = [
    {
      reportId: "live",
      personaId: sighted.id,
      status: "IN_PROGRESS",
      createdAtMs: NOW,
      pitchSubject: base.pitchSubject,
    },
    ...prior,
  ];
  const restart = (over: object) =>
    chooseElevatorListener({ ...base, history: started, blind: false, ...over });
  check(
    "refresh mid-session, same subject: same listener",
    restart({ nowMs: NOW + 60_000 }).id === sighted.id,
  );
  check(
    "same listener even when the restart picks blind",
    restart({ nowMs: NOW + 60_000, blind: true }).id === sighted.id,
  );
  check(
    "a different pitch is a new session: new listener",
    restart({ pitchSubject: "another idea" }).id !== sighted.id,
  );
  check(
    "pin expires",
    restart({ nowMs: NOW + ELEVATOR_RESTART_PIN_MS + 1 }).id !== sighted.id,
  );
  check(
    "a finished session never pins",
    chooseElevatorListener({
      ...base,
      blind: false,
      history: [{ ...started[0], status: "READY" }, ...prior],
    }).id !== sighted.id,
  );

  // ---- Snapshot round trip: prompt, reconnect, grading ----
  const instance: InstanceConfig = {
    kind: "pitch-elevator",
    pitchSubject: base.pitchSubject,
    listenerKnowledge: "blind",
    listenerPersonaId: sighted.id,
  };
  const snapshot = pitchSnapshotFromInstance(instance, null)!;
  check("snapshot stores the id", snapshot.listenerPersona === sighted.id);
  const config = (i: InstanceConfig) => {
    const r = resolveSessionConfig("pitch-elevator", { instance: i });
    if (!r.ok) throw new Error(r.reason);
    return r.config;
  };
  const turn1 = buildElevatorSystemPrompt(config(instance));
  const turn2 = buildElevatorSystemPrompt(config({ ...instance }));
  check("reconnect: system prompt is byte-identical (REQ-73)", turn1 === turn2);
  check(
    "prompt names the drawn person, their temperament, and not the legacy listener",
    turn1.includes(`Name: ${sighted.name}`) &&
      turn1.includes(sighted.temperament) &&
      !turn1.includes("Dana"),
  );
  const rebuilt = await instanceFromPitchSnapshot(snapshot, "resume", "pitch-elevator");
  const graded = buildElevatorEvaluationContext(config(rebuilt!));
  check("grader sees the same person", graded.listenerPersona.name === sighted.name);
  check(
    "grader context carries no casting fields",
    !("avatarId" in graded.listenerPersona),
  );

  // ---- Older reports ----
  check("null id resolves to the legacy listener", resolveElevatorListener(null).name === "Dana Reyes");
  check(
    "unknown stored text resolves to the legacy listener",
    resolveElevatorListener("Skeptical angel investor").name === "Dana Reyes",
  );
  const legacy = await instanceFromPitchSnapshot(
    { ...snapshot, listenerPersona: null },
    "resume",
    "pitch-elevator",
  );
  check(
    "pre-roster report still grades and prompts as the legacy listener",
    buildElevatorEvaluationContext(config(legacy!)).listenerPersona.name === "Dana Reyes" &&
      buildElevatorSystemPrompt(config(legacy!)).includes("Name: Dana Reyes"),
  );

  console.log(failures ? `\n${failures} FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

void main();
