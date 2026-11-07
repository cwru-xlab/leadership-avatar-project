/**
 * Process frameworks for the system-design interview (verbal; no whiteboard).
 *
 * Each framework is the sequence a real interviewer listens for, written so
 * the evaluator can mark every step hit / prompted / missed
 * (`lib/problem-interview/types.ts`). Synthesized from:
 *
 * - Xu, Vol. 1, ch. 3: understand the problem and establish scope → propose a
 *   high-level design and get buy-in → deep dive → wrap up; ch. 2 on
 *   back-of-the-envelope estimation (QPS, peak, storage).
 * - System Design Primer: outline use cases, constraints and assumptions →
 *   high-level design → core components → scale the design.
 * - Hello Interview's delivery framework: requirements (functional and
 *   non-functional) → core entities → API → high-level design → deep dives,
 *   with estimates done when they change a design decision.
 * - Kleppmann (DDIA) for what "scaling and reliability tradeoffs" means:
 *   replication, partitioning, consistency models, failure handling.
 * - Meta's "product architecture" round for the lighter feature-design flow
 *   (APIs, data model, client–server interaction for one product feature).
 * - Google SRE book ch. 12/14/15 for the incident flow (triage and mitigate
 *   before root cause; examine signals; hypothesize and test; postmortem).
 *
 * The nudges are what a real interviewer says when a candidate skips a step:
 * a short, spoken, neutral question that opens the door without naming the
 * step, the method, or the answer. The engine matches them verbatim as a
 * fallback when the live model drops a nudge marker, so each is a complete
 * spoken sentence of at least 12 characters.
 */

import type { ProcessFramework } from "@/lib/problem-interview/types";

import { SD_SOURCES } from "./sources";

/** Large-scale distributed system ("design a URL shortener"). Seven steps. */
export const SYSTEM_DESIGN_FRAMEWORK: ProcessFramework = {
  key: "system-design",
  label: "System design flow",
  source: [SD_SOURCES.xuVol1, SD_SOURCES.primer, SD_SOURCES.helloInterview, SD_SOURCES.kleppmann].join("; "),
  steps: [
    {
      key: "clarify_requirements",
      label: "Pin down requirements",
      description:
        "Agree on what the system must do (core features, what is out of scope) and how well it must do it (scale, latency, availability, consistency) before designing.",
      evidenceCriteria:
        "BEFORE proposing components, the candidate asks or states BOTH (a) functional scope — the 2–4 core features or use cases, ideally with something explicitly out of scope — " +
        "AND (b) at least one non-functional requirement with a target or priority (e.g. scale/users, read-vs-write ratio, latency, availability, consistency, durability). " +
        "Features only, or a single question about user count, is NOT a hit. Requirements raised only after the boxes are drawn do not count.",
      nudge: "Before we go further, what exactly does this need to do, and how well does it need to do it?",
    },
    {
      key: "estimate_scale",
      label: "Size the problem",
      description:
        "Turn the usage numbers into rough load and storage figures (requests per second, peak, storage over time, bandwidth) that shape the design.",
      evidenceCriteria:
        "The candidate computes, out loud, at least TWO order-of-magnitude figures from the usage numbers — typically average and/or peak requests per second AND storage (or bandwidth) — " +
        "with the arithmetic narrated, and the result is within the question's tolerance band (re-check it). " +
        "Saying 'it's a lot of traffic' or quoting the given daily numbers back is NOT a hit. An uncorrected order-of-magnitude error is NOT a hit.",
      nudge: "Roughly how much load and data are we talking about here?",
    },
    {
      key: "api_data_model",
      label: "Define the interface and data",
      description:
        "Name the main API calls (inputs and outputs) and the core entities or tables the system stores, with a reason for the storage choice.",
      evidenceCriteria:
        "The candidate names at least two concrete API operations with their key parameters or responses (e.g. 'POST /links {longUrl} → shortCode') " +
        "AND the core stored entities with their key fields or access pattern, with a reason for the store chosen (relational vs key-value, etc.). " +
        "'We'll have an API and a database' is NOT a hit.",
      nudge: "What would a client actually call, and what are we storing?",
    },
    {
      key: "high_level_design",
      label: "Sketch the high-level design",
      description:
        "Describe the main components and walk one or two requests end to end through them, since there is no whiteboard.",
      evidenceCriteria:
        "The candidate names the main components (clients, load balancer / gateway, services, data stores, queues, caches as relevant) AND walks at least one core request — " +
        "ideally both the main write and the main read path — end to end through them in order. A list of technologies with no request flow is NOT a hit.",
      nudge: "Can you walk me through what happens, end to end, when a request comes in?",
    },
    {
      key: "deep_dive",
      label: "Dig into the hardest part",
      description:
        "Pick the component most likely to break (a hot path, a contention point, a fan-out) and design it in detail.",
      evidenceCriteria:
        "The candidate explicitly names which component or path is the bottleneck or hardest part AND explains why (using the scale numbers or the access pattern), " +
        "then designs it in detail: concrete algorithm, schema, key choice, or concurrency handling with at least two alternatives weighed. " +
        "Staying at box level everywhere is NOT a hit.",
      nudge: "Which part of this do you think is going to be hardest to get right?",
    },
    {
      key: "scaling_tradeoffs",
      label: "Scale it and weigh tradeoffs",
      description:
        "Explain how the design grows and survives failure — caching, partitioning, replication, consistency choices — and what each choice costs.",
      evidenceCriteria:
        "The candidate addresses BOTH growth (e.g. caching, partitioning/sharding with a named key, horizontal scaling, async queues) AND failure (replication, failover, retries/idempotency, what happens when a node or region dies), " +
        "and for at least TWO choices states what is given up (e.g. 'cache gives us latency but reads can be stale for up to N seconds', 'sharding by user id makes cross-user queries expensive'). " +
        "Naming techniques without any stated cost is NOT a hit.",
      nudge: "What happens when traffic grows tenfold, or one of those machines goes down?",
    },
    {
      key: "wrap_up",
      label: "Wrap up",
      description:
        "Summarize the design, name its biggest risks or weak spots, and say what you would improve or monitor with more time.",
      evidenceCriteria:
        "Near the end, unprompted, the candidate summarizes the design in a few sentences AND names at least one concrete risk, limitation, or next improvement (e.g. monitoring/alerting on X, hot-key handling, a multi-region plan). " +
        "Simply stopping, or 'I think that's it', is NOT a hit.",
      nudge: "If we had to stop here, how would you sum up where this design stands?",
    },
  ],
};

/**
 * Product / feature design for engineers (Meta's "product architecture"
 * round; Hello Interview's product-design questions). Lighter on scale math,
 * heavier on APIs, data model, client–server flow and edge cases. Six steps.
 */
export const FEATURE_DESIGN_FRAMEWORK: ProcessFramework = {
  key: "feature-design",
  label: "Feature design flow",
  source: [SD_SOURCES.metaPrep, SD_SOURCES.helloInterview, SD_SOURCES.xuVol1].join("; "),
  steps: [
    {
      key: "clarify_scope",
      label: "Pin down the feature",
      description:
        "Agree on who uses the feature, the core user flows, what is out of scope for a first version, and any constraint that matters (scale, latency, platforms).",
      evidenceCriteria:
        "BEFORE designing, the candidate asks or states the core user flows (at least two) AND at least one explicit scope cut or constraint (out of scope for v1, expected scale, latency, mobile vs web, privacy). " +
        "Jumping straight to endpoints or tables is NOT a hit.",
      nudge: "Before you get into it, who's using this and what do they need to be able to do?",
    },
    {
      key: "api_design",
      label: "Design the API",
      description:
        "Specify the endpoints or calls the client makes, with request and response shapes, pagination and error cases where relevant.",
      evidenceCriteria:
        "The candidate specifies at least two concrete endpoints/calls with method or name, key parameters and response shape, and addresses at least one of pagination, idempotency, auth/permissions, or error responses. " +
        "'There'd be a GET and a POST' with no shapes is NOT a hit.",
      nudge: "What would the calls between the app and the server look like?",
    },
    {
      key: "data_model",
      label: "Model the data",
      description:
        "Name the entities, their key fields and relationships, and the indexes or store that serve the main queries.",
      evidenceCriteria:
        "The candidate names the core entities/tables with key fields and relationships AND ties at least one index, key, or store choice to a specific query the feature runs. " +
        "Entity names alone are NOT a hit.",
      nudge: "How would you lay out the data behind this?",
    },
    {
      key: "client_server_flow",
      label: "Walk the end-to-end flow",
      description:
        "Walk one core user action from the client through the services and storage and back, including how other clients learn about the change.",
      evidenceCriteria:
        "The candidate walks at least one core user action end to end (client → server/service → storage → response) AND says how other users or devices see the update (polling, push, websocket, fan-out, cache invalidation) with a reason for the choice.",
      nudge: "Walk me through what happens when someone actually uses this.",
    },
    {
      key: "edge_cases",
      label: "Handle edge cases and failures",
      description:
        "Find what breaks: concurrent edits, retries and duplicates, permissions and abuse, deleted or missing data, offline clients.",
      evidenceCriteria:
        "The candidate raises at least TWO concrete edge cases or failure modes specific to this feature (not generic 'add error handling') AND says how the design handles each.",
      nudge: "What could go wrong here?",
    },
    {
      key: "tradeoffs_wrap_up",
      label: "Tradeoffs and wrap-up",
      description:
        "State the main tradeoffs you made, how you'd roll it out and know it works, and what you'd improve next.",
      evidenceCriteria:
        "Unprompted, the candidate states at least one explicit tradeoff with what is given up AND closes with a summary plus a rollout, monitoring, or next-improvement point. " +
        "Stopping after the last detail is NOT a hit.",
      nudge: "If we had to stop here, how would you sum up where this design stands?",
    },
  ],
};

/**
 * Debugging a production incident (Google SRE book ch. 12 "Effective
 * Troubleshooting", ch. 14 "Managing Incidents", ch. 15 postmortems; Gregg's
 * USE method). Exhibits carry the dashboards and logs. Six steps.
 */
export const INCIDENT_FRAMEWORK: ProcessFramework = {
  key: "incident-debug",
  label: "Incident debugging flow",
  source: [SD_SOURCES.sreBook, SD_SOURCES.sreWorkbook, SD_SOURCES.gregg].join("; "),
  steps: [
    {
      key: "assess_impact",
      label: "Size the impact",
      description:
        "Establish who and what is affected, how badly, since when, and what changed recently, so the response matches the severity.",
      evidenceCriteria:
        "Early, before proposing causes, the candidate asks about or states at least TWO of: which users/regions/endpoints are affected, how severe (error rate, latency vs SLO), when it started, and what changed recently (deploys, config, traffic). " +
        "Jumping straight to 'it's probably the database' is NOT a hit.",
      nudge: "Before we go hunting, how bad is this and who's feeling it?",
    },
    {
      key: "mitigate_first",
      label: "Stop the bleeding",
      description:
        "Restore service for users as quickly as possible — roll back, fail over, shed or reroute load — before (or while) finding the root cause.",
      evidenceCriteria:
        "The candidate proposes a concrete, reversible mitigation aimed at restoring service (roll back the deploy, disable a flag, fail over, add capacity, shed load) AND says it comes before or in parallel with root-causing, " +
        "with at least a word on its risk. A fix that requires finding the root cause first is NOT mitigation.",
      nudge: "Users are hurting right now. What would you do in the next five minutes?",
    },
    {
      key: "gather_signals",
      label: "Gather the signals",
      description:
        "Ask for the specific dashboards, logs or traces that separate the possible causes, and read what they show.",
      evidenceCriteria:
        "The candidate asks for specific evidence (named metrics, logs, traces, deploy history — not just 'more data') AND correctly reads at least one exhibit or fact out loud, naming the number that matters. " +
        "Misreading the exhibit is NOT a hit.",
      nudge: "What would you want to look at to figure out what's going on?",
    },
    {
      key: "form_hypotheses",
      label: "Hypothesize and test",
      description:
        "Lay out two or more plausible causes, rank them on the evidence, and say what check would confirm or rule out each.",
      evidenceCriteria:
        "The candidate states at least TWO candidate causes AND for each names a check or signal that would confirm or rule it out, ruling at least one out against the evidence. " +
        "Fixating on one cause without testing it is NOT a hit.",
      nudge: "What else could explain what you're seeing?",
    },
    {
      key: "root_cause",
      label: "Land the root cause",
      description:
        "Name the cause the evidence supports, including the mechanism that turned the trigger into the outage.",
      evidenceCriteria:
        "The candidate commits to a root cause that matches the reference notes (or a well-argued alternative consistent with ALL exhibits) AND explains the mechanism — why the trigger produced these symptoms. " +
        "A cause contradicted by an exhibit is NOT a hit.",
      nudge: "So where do you land on what actually caused this?",
    },
    {
      key: "prevent_recurrence",
      label: "Prevent a repeat",
      description:
        "Propose the durable fix and the follow-ups — detection, alerting, guardrails, a blameless postmortem — so it does not happen again.",
      evidenceCriteria:
        "Unprompted, the candidate proposes a durable fix AND at least one systemic follow-up (an alert on the leading symptom, a test or canary that would have caught it, a guardrail, or a blameless postmortem with owners). " +
        "'Fix the bug' alone is NOT a hit.",
      nudge: "Once things are stable, what would you want to happen next?",
    },
  ],
};

export const SD_FRAMEWORKS: ProcessFramework[] = [
  SYSTEM_DESIGN_FRAMEWORK,
  FEATURE_DESIGN_FRAMEWORK,
  INCIDENT_FRAMEWORK,
];

export function getSdFramework(key: string): ProcessFramework | null {
  return SD_FRAMEWORKS.find((framework) => framework.key === key) ?? null;
}
