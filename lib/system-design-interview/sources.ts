/**
 * Public sources the system-design interview is modeled on.
 *
 * One list, referenced by the frameworks, the question bank and the validity
 * doc (docs/interviews/system-design-validity.md) so a citation is written
 * once. Everything built from them is paraphrased: question wording, product
 * names, numbers and exhibits in this folder are original.
 */

export const SD_SOURCES = {
  /** 4-step process (scope → high-level design → deep dive → wrap-up); ch. 2 back-of-envelope; ch. 4 rate limiter, ch. 8 URL shortener, ch. 10 notifications, ch. 11 news feed. */
  xuVol1: "Alex Xu, System Design Interview – An Insider's Guide, Vol. 1 (2020)",
  /** Ch. 10 real-time gaming leaderboard; ch. 7 hotel reservation (inventory contention). */
  xuVol2: "Alex Xu & Sahn Lam, System Design Interview – An Insider's Guide, Vol. 2 (2022)",
  /** Reliability/scalability/maintainability (ch. 1), replication (ch. 5), partitioning (ch. 6), transactions (ch. 7), consistency (ch. 9). */
  kleppmann: "Martin Kleppmann, Designing Data-Intensive Applications (O'Reilly, 2017)",
  /** "How to approach a system design interview question": use cases & constraints → high-level design → core components → scale the design; back-of-envelope tables. */
  primer: "Donne Martin, The System Design Primer (github.com/donnemartin/system-design-primer)",
  /** Delivery framework: requirements → core entities → API → high-level design → deep dives; estimate only when it changes a design decision; Ticketmaster write-up. */
  helloInterview: "Hello Interview, “System Design in a Hurry” delivery framework and question breakdowns (hellointerview.com/learn/system-design)",
  /** Meta's software-engineer loop: “System Design” (distributed systems) vs “Product Architecture” (APIs, data model, client–server for a product feature). */
  metaPrep: "Meta Careers, software engineer full-loop interview preparation guides (system design / product architecture)",
  /** Google's guidance for engineering candidates: think out loud, clarify ambiguity, state tradeoffs. */
  googlePrep: "Google Careers, “How we hire” — technical interview tips (careers.google.com/how-we-hire)",
  /** Latency numbers every engineer should know (memory vs SSD vs network vs disk). */
  dean: "Jeff Dean, “Numbers Everyone Should Know” (Stanford CS295 / LADIS 2009 talk), as reprinted in the System Design Primer",
  /** Ch. 12 Effective Troubleshooting (triage → examine → diagnose → test/treat); ch. 14 Managing Incidents; ch. 15 Postmortem Culture. */
  sreBook: "Beyer, Jones, Petoff & Murphy (eds.), Site Reliability Engineering (Google/O'Reilly, 2016)",
  /** SLOs, error budgets, alerting on symptoms. */
  sreWorkbook: "Beyer et al. (eds.), The Site Reliability Workbook (Google/O'Reilly, 2018)",
  /** USE method: utilization, saturation, errors for every resource. */
  gregg: "Brendan Gregg, “The USE Method” (brendangregg.com/usemethod.html)",
} as const;
