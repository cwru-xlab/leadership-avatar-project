/** Pure demonstration of the shared title helpers: `npx tsx scripts/verify-display-titles.ts`. */
import { displayPlanTitle, withDisplayTitles } from "../lib/study-plan/title";
import { deriveReportTitle, disambiguateTitles, displayReportTitle } from "../lib/report/title";
import type { InputSnapshot } from "../lib/report/snapshot";

const failures: string[] = [];
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${JSON.stringify(actual)}`);
  if (!ok) failures.push(label);
}
const words = (title: string) => title.split(/\s+/).filter((word) => word !== "·").length;
const themes = (...names: string[]) => names.map((theme, i) => ({ priority: i + 1, theme }));

const stored: Array<[string, ReturnType<typeof themes>]> = [
  ["Self-Paced Study Plan: Building on Solid Interview Foundations", themes("Active Listening", "Organization of Responses")],
  ["Self-Paced Interview Practice Plan: Early Review", themes("Clarity and Depth in Responses")],
  ["Building on Steady Interview Technique", themes("Demonstrating Ownership and Self-Awareness More Consistently")],
  ["Strengthening Interview Skills Through Clarity, Listening, and Ownership", themes("Listening and Adaptability", "Organization of Responses")],
  ["Building Strong Interview Foundations: Clarity, Organization, and Listening", themes("Improving Organization of Responses")],
  ["Interview Skills Self-Paced Practice Plan", themes("Organization in Communication", "Active Listening")],
  ["Self-Paced Interview Practice Plan: Leveraging Strengths & Enhancing Organization", themes("Organization in Interview Responses")],
  ["Foundational Improvement Study Plan for Interview Practice", themes("Consistency and Reliability in Performance", "Clarity and Depth in Responses")],
  ["Behavioral Interview Practice Plan: Strengthening Ownership, Completeness, and Reflection", themes("Consistency in Ownership Demonstration")],
  ["Self-Paced Interview Practice Enhancement Plan", themes("Consistency of Organization Across Responses", "Completeness and Clarification of Answers")],
  ["Answer structure and active listening", themes("Unused theme")],
];
for (const [title, priorityThemes] of stored) {
  const shown = displayPlanTitle({ title, priorityThemes });
  console.log(`  "${title}" -> "${shown}"`);
  if (words(shown) > 8) failures.push(`over budget: ${shown}`);
  if (/self-paced|study plan|practice plan/i.test(shown)) failures.push(`filler left: ${shown}`);
}
check("a good new-style title is kept", displayPlanTitle({ title: "Answer structure and active listening", priorityThemes: themes("Unused") }), "Answer structure and active listening");

const samePlans = withDisplayTitles([
  { id: "a", title: "Self-Paced Study Plan", priorityThemes: themes("Active Listening"), savedAt: "2026-10-09T14:30:00" },
  { id: "b", title: "Self-Paced Study Plan", priorityThemes: themes("Active Listening"), savedAt: "2026-10-09T18:05:00" },
  { id: "c", title: "Self-Paced Study Plan", priorityThemes: themes("Active Listening"), savedAt: "2026-10-12T09:00:00" },
]);
check("plans: same-day gets time, other day gets date", samePlans.map((plan) => plan.title), [
  "Active Listening · Oct 9, 2:30 PM",
  "Active Listening · Oct 9, 6:05 PM",
  "Active Listening · Oct 12",
]);

const interview = (over: Partial<InputSnapshot>) =>
  ({ kind: "interview", interviewerName: null, roleTitle: "an early-career professional role", industry: "general / cross-industry", ...over }) as InputSnapshot;

check("default interview is just the type", deriveReportTitle("general", interview({})), "General interview");
check("interviewer named", deriveReportTitle("general", interview({ interviewerName: "Karen Liu" })), "General interview with Karen Liu");
check("curated role leads", deriveReportTitle("general", interview({ roleTitle: "a team lead or people-manager role", interviewerName: "Karen Liu" })), "Team lead interview with Karen Liu");
check("persona text never appears", deriveReportTitle("general", interview({ interviewerPersona: "Karen Liu, VP of Operations" })).includes("VP"), false);
check("stored server default is replaced", displayReportTitle({ title: "General interview · an early-career professional role · Oct 3, 2026, 10:24 PM", typeSlug: "general", input: interview({}) }), "General interview");
check("stored client default is replaced", displayReportTitle({ title: "Interview · with Karen Liu", typeSlug: "general", input: interview({ interviewerName: "Karen Liu" }) }), "General interview with Karen Liu");
check("a student's own title is kept", displayReportTitle({ title: "Round two with Karen", typeSlug: "general", input: interview({ interviewerName: "Karen Liu" }) }), "Round two with Karen");
check("an edited default is kept", displayReportTitle({ title: "Interview · with Karen Liu, second try", typeSlug: "general", input: interview({ interviewerName: "Karen Liu" }) }), "Interview · with Karen Liu, second try");
check("legacy row with no snapshot", displayReportTitle({ title: null, typeSlug: "technical", input: null }), "Engineering behavioral interview");
check("over-long subject stays in budget", words(deriveReportTitle("difficult-conversation", { kind: "difficult-conversation", conversationTitle: "You are meeting Sam, a warehouse shift lead, to tell him he is being terminated" } as InputSnapshot)) <= 8, true);

const sameDay = disambiguateTitles([
  { id: "1", title: "General interview", when: "2026-10-09T14:30:00" },
  { id: "2", title: "General interview", when: "2026-10-09T14:31:00" },
  { id: "3", title: "Asking your manager for a raise", when: "2026-10-09T14:40:00" },
  { id: "4", title: "Asking your manager for a raise", when: "2026-10-09T14:45:00" },
  { id: "5", title: "Elevator pitch", when: "2026-10-09T15:00:00" },
]);
check("identical same-day reports differ", [...sameDay.values()], [
  "General interview · 2:30 PM",
  "General interview · 2:31 PM",
  "Asking your manager for a raise · 2:40 PM",
  "Asking your manager for a raise · 2:45 PM",
  "Elevator pitch",
]);
check("the same clock time on two days keeps its date", [...disambiguateTitles([
  { id: "1", title: "General interview", when: "2026-10-09T14:30:00" },
  { id: "2", title: "General interview", when: "2026-10-09T15:00:00" },
  { id: "3", title: "General interview", when: "2026-10-10T14:30:00" },
  { id: "4", title: "General interview", when: "2026-10-10T16:00:00" },
]).values()], [
  "General interview · Oct 9, 2:30 PM",
  "General interview · 3:00 PM",
  "General interview · Oct 10, 2:30 PM",
  "General interview · 4:00 PM",
]);
check("all within budget", [...sameDay.values()].every((title) => words(title) <= 8), true);

if (failures.length) {
  console.error("FAILED:", failures);
  process.exit(1);
}
console.log("All title checks passed.");
