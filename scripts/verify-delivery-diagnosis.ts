/**
 * Metric-gated Delivery diagnosis. Alice's three real Delivery attempts:
 * 183 → 163 → 150 WPM must never recommend "cut pace" once well paced.
 *
 * Run: npx tsx scripts/verify-delivery-diagnosis.ts
 */
import { diagnoseDelivery, ineligibleDeliveryTechniqueIds, WELL_PACED_MAX_WPM } from "../lib/study-plan/delivery-diagnosis";
import { validateResultNote, validateTip, TECHNIQUE_LIBRARY } from "../lib/study-plan/coached/tips";
import { parseDrillGrade } from "../lib/study-plan/drill/grade";

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passes += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\n1. Alice attempt 3 (150 WPM, 0 pauses, 84% eye contact) is not told to cut pace");
{
  const d = diagnoseDelivery({
    competencyKey: "delivery_presence",
    cameraMode: "ON",
    wordsPerMinute: 150.0369543509775,
    pauseCount: 0,
    fillerWordCount: 1,
    spokenSeconds: 82,
    eyeContactPct: 84,
    cameraCenteredPct: 80,
    facePresencePct: 98,
  });
  check("slow-down is ineligible", d.ineligibleIds.includes("delivery-slow-down"));
  check("focuses do not include slow-down", !d.focuses.some((f) => f.technique.id === "delivery-slow-down"));
  check("a pause/landing move is offered", d.focuses.some((f) => f.technique.cluster === "vocal_landing"));
  check("at most two focuses", d.focuses.length <= 2);
  check(
    "two focuses share a cluster",
    d.focuses.length < 2 || d.focuses[0].technique.cluster === d.focuses[1].technique.cluster,
  );
}

console.log("\n2. Alice attempt 1 (183 WPM) may still get a pace move");
{
  const d = diagnoseDelivery({
    competencyKey: "delivery_presence",
    cameraMode: "ON",
    wordsPerMinute: 183.2,
    pauseCount: 1,
    fillerWordCount: 4,
    spokenSeconds: 78,
  });
  check("slow-down is eligible at 183 WPM", !d.ineligibleIds.includes("delivery-slow-down"));
  check(
    "a pace-related move is in the ranking",
    d.focuses.some((f) => f.technique.id === "delivery-slow-down" || f.technique.id === "delivery-dont-rush-the-list"),
  );
}

console.log("\n3. Well-paced gate matches the band table");
{
  check("WELL_PACED_MAX_WPM is 160", WELL_PACED_MAX_WPM === 160);
  const ids = ineligibleDeliveryTechniqueIds({
    competencyKey: "delivery_presence",
    wordsPerMinute: 159,
    spokenSeconds: 60,
    pauseCount: 4,
  });
  check("159 WPM makes slow-down ineligible", ids.has("delivery-slow-down"));
  const ids2 = ineligibleDeliveryTechniqueIds({
    competencyKey: "delivery_presence",
    wordsPerMinute: 160,
    spokenSeconds: 60,
    pauseCount: 4,
  });
  check("160 WPM keeps slow-down eligible", !ids2.has("delivery-slow-down"));
}

console.log("\n4. Different clusters are not packed into one session");
{
  const d = diagnoseDelivery({
    competencyKey: "delivery_presence",
    cameraMode: "ON",
    wordsPerMinute: 200,
    pauseCount: 0,
    spokenSeconds: 60,
    eyeContactPct: 20,
    cameraCenteredPct: 20,
    facePresencePct: 40,
  });
  const clusters = new Set(d.focuses.map((f) => f.technique.cluster));
  check("packed focuses are a single cluster", clusters.size <= 1, [...clusters].join(","));
  check("freeform is true when the other cluster is also weak", d.freeform);
}

console.log("\n5. Result notes keep phrasing approaches, reject scripts");
{
  const student = "I rebuilt the dataset in three steps and checked every record.";
  const approach = "I lead with the outcome, then one number, and I stop when the point lands.";
  const ok = validateResultNote(approach, { studentLine: student });
  check("a first-person phrasing approach is kept", ok.ok, JSON.stringify(ok));
  const live = validateTip(approach, { studentLine: student });
  check("the same note is still rejected as a live tip (first person)", !live.ok && live.reason === "CONTAINS_FIRST_PERSON_LINE");
  const scripted = validateResultNote('You should say "I rebuilt the dataset in three steps."', { studentLine: student });
  check("a recitable sample line is rejected", !scripted.ok);
}

console.log("\n6. Well-paced notes and live picks drop slow-down");
{
  const transcript = "So I think the main point is that the team shipped on time after we aligned the partners.";
  const diagnosis = diagnoseDelivery({
    competencyKey: "delivery_presence",
    cameraMode: "ON",
    wordsPerMinute: 150,
    pauseCount: 0,
    spokenSeconds: 80,
    eyeContactPct: 84,
  });
  const graded = parseDrillGrade(
    JSON.stringify({
      score: 3,
      feedback: "Cut your pace by a third",
      rationale: "Somewhat rushed.",
      miss_quote: "the team shipped on time after we aligned",
      miss_technique_id: "delivery-slow-down",
      worked_quote: "",
      worked_note: "",
    }),
    {
      competencyKey: "delivery_presence",
      transcript,
      model: "test",
      drillTechniqueId: "delivery-slow-down",
      ineligibleIds: new Set(diagnosis.ineligibleIds),
      diagnosis,
    },
  );
  check("a well-paced note naming slow-down is replaced", graded.feedbackReplaced);
  check("the replacement is not the slow-down reminder", !/pace by a third/i.test(graded.feedback));
  check("retry focuses omit slow-down", graded.retryFocuses.every((f) => f.techniqueId !== "delivery-slow-down"));
}

console.log("\n7. New library rows pass their own rejector");
{
  for (const t of TECHNIQUE_LIBRARY.filter((x) => x.id.startsWith("delivery-") || x.id.includes("number-the-steps") || x.id.includes("time-box"))) {
    const r = validateTip(t.reminder, { studentLine: "an unrelated student line about something else entirely" });
    check(`${t.id} reminder is a safe live tip`, r.ok, JSON.stringify(r));
  }
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} (${passes} ok)\n`);
process.exit(failures === 0 ? 0 : 1);
