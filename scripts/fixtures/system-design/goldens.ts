/**
 * Golden transcripts for the system-design grading validity study
 * (scripts/verify-system-design-grading.ts).
 *
 * Variants (link shortener unless noted):
 *  - strong:    every step unprompted, estimates inside the strong band.
 *  - boxes:     jumps straight to components; no requirements, no sizing.
 *  - no-math:   good requirements and design, never sizes the system.
 *  - handwave:  sizes it, then "add caching and sharding, it'll scale" — no
 *               costs, no real deep dive.
 *  - nudged:    needs the interviewer's neutral nudges for requirements,
 *               sizing and the wrap-up, then does each fully.
 *  - slip:      sizes it with an order-of-magnitude error (4,600 writes/s).
 *  - incident:  checkout-latency incident, strong except mitigation needed a
 *               nudge.
 *
 * Interviewer markers are stripped before transcripts are stored, so turns
 * carry none; nudges the server would record are in `nudgesIssued`.
 */

import type { ProcessStepStatus } from "../../../lib/problem-interview/types";

export interface GoldenTurn {
  role: "assistant" | "user";
  t: number;
  content: string;
}

export interface GoldenExpectation {
  /** Bounds on the DERIVED process_rigor (engine: deriveProcessRigorScore). */
  rigorMin?: number;
  rigorMax?: number;
  quantitativeMin?: number;
  quantitativeMax?: number;
  tradeoffMin?: number;
  tradeoffMax?: number;
  depthMin?: number;
  depthMax?: number;
  allHit?: boolean;
  steps?: Record<string, ProcessStepStatus[]>;
}

export interface GoldenTranscript {
  id: string;
  questionId: string;
  nudgesIssued: { stepKey: string; atSeconds: number }[];
  exhibitsRevealed: { exhibitId: string; atSeconds: number }[];
  turns: GoldenTurn[];
  expect: GoldenExpectation;
}

const OPENING: GoldenTurn[] = [
  { role: "assistant", t: 0, content: "Hi, thanks for joining. We'll start with a quick question about you, then spend most of our time designing one system together, and leave a few minutes for your questions. So, what draws you to backend engineering?" },
  { role: "user", t: 12, content: "I like problems where the hard part is scale and reliability. In my internship I worked on a job-scheduling service and spent a lot of time on why jobs got run twice after a failover, and I found that really satisfying." },
  { role: "assistant", t: 40, content: "Thanks. Let's turn to the design. Let's design a link-shortening service — you paste in a long web address and get back a short link that redirects to it. How would you design it?" },
];

const URL_STRONG: GoldenTranscript = {
  id: "url-strong",
  questionId: "sd-url-shortener",
  nudgesIssued: [],
  exhibitsRevealed: [{ exhibitId: "ex1", atSeconds: 110 }],
  turns: [
    ...OPENING,
    { role: "user", t: 55, content: "Before I design anything, let me pin down scope. Core features: create a short link from a long URL, and redirect when someone opens it. Are custom aliases or click analytics in scope? And how long do links live?" },
    { role: "assistant", t: 70, content: "Create and redirect are the core. Aliases and analytics are out of scope for now. Links are kept at least five years." },
    { role: "user", t: 80, content: "Great. Non-functionally I'm assuming redirects have to be fast, say well under 100 milliseconds, and highly available, and it's fine if a brand-new link takes a second to become visible everywhere — so availability over strict consistency. Is that right? And can you tell me about traffic and storage?" },
    { role: "assistant", t: 105, content: "That's right on latency and availability. I'm putting the usage numbers on your screen." },
    { role: "user", t: 120, content: "Okay, so 40 million new links a day. A day is about 86,400 seconds, so 40 million divided by 86,400 is about 460 writes per second. Reads are 25 times that, about 11,600 redirects per second, and with a 3x peak that's roughly 35,000 reads a second at peak. So this is very read heavy, which tells me the redirect path needs a cache. Storage: 40 million times 365 times 5 years is 73 billion links, times 500 bytes is about 36.5 terabytes. That also tells me the key: 62 to the 6th is about 57 billion, not enough, so I need 7 base-62 characters, which gives about 3.5 trillion." },
    { role: "assistant", t: 175, content: "Okay, go on." },
    { role: "user", t: 185, content: "Two main calls. POST /links with a body of longUrl, returns the shortCode and the short URL. And GET /{shortCode}, which returns a 302 redirect to the long URL — I'd pick 302 over 301 so browsers don't cache it forever, in case we add analytics later or need to take down an abusive link. Data model is one table, really: shortCode as the key, longUrl, createdAt, and the creator id. The access pattern is a pure key lookup with 73 billion rows and no joins, so a key-value store or a wide-column store partitioned by shortCode fits better than a relational database." },
    { role: "user", t: 230, content: "High level, the write path: client hits a load balancer, then a stateless link service, which gets a unique ID from an ID generator, base-62 encodes it into the 7-character code, writes code to URL into the key-value store, and returns the short link. Read path: the browser hits GET /code, load balancer, redirect service checks an in-memory cache like Redis first, on a miss reads the key-value store, fills the cache, and returns the 302." },
    { role: "user", t: 270, content: "The part I think is hardest is generating the codes: 460 a second across many servers with no collisions. Option one is hashing the long URL, say MD5, and taking 7 characters, but then I need a collision check and retry on every write, which is a read before every write. Option two is a counter: each link-service instance leases a block of, say, a million IDs from a coordination service like ZooKeeper or a database sequence, and hands them out locally. No collisions, no read-before-write, and if an instance dies we just lose the rest of its block, which is fine with 3.5 trillion codes. To avoid sequential, guessable codes I'd run the ID through a reversible shuffle before base-62. I'd go with block leasing." },
    { role: "user", t: 340, content: "Reads first: 35,000 a second at peak, and link popularity is very skewed, so an LRU cache in front of the store should absorb most of it. The cost is memory and a little staleness, but links never change, so stale data is basically harmless — the real risk is a deleted abusive link living on in cache, so deletes need to invalidate. The store gets partitioned by shortCode with consistent hashing; the tradeoff is that any query not by code, like 'all links by this user', becomes a scatter-gather, which I'd serve from a separate index if needed. For failures, I'd replicate each partition three ways and read from replicas; with async replication a just-created link might 404 for a moment on a replica, which we said was acceptable. The ID-block service is a single point of failure, but instances hold a block in memory, so it can be down for minutes without hurting writes." },
    { role: "user", t: 400, content: "To wrap up: a read-heavy service, about 460 writes and 11,600 reads per second, 36.5 terabytes over five years, with block-leased IDs encoded to 7 base-62 characters, a key-value store partitioned by code, and a cache in front of redirects. The biggest risks are hot links overwhelming one cache node, which I'd handle with replicated hot keys, and abuse — people shortening malware links — so I'd add URL scanning. I'd also want monitoring on redirect p99 latency and cache hit rate." },
    { role: "assistant", t: 440, content: "Thanks, that's a good place to stop. Do you have any questions for me?" },
  ],
  expect: { allHit: true, rigorMin: 5, quantitativeMin: 4, tradeoffMin: 4, depthMin: 4 },
};

const URL_BOXES: GoldenTranscript = {
  id: "url-boxes",
  questionId: "sd-url-shortener",
  nudgesIssued: [],
  exhibitsRevealed: [],
  turns: [
    ...OPENING,
    { role: "user", t: 50, content: "Sure. So I'd put a load balancer in front, then a bunch of app servers, then Redis for caching and Cassandra for the database. Kafka for events. Everything in Kubernetes so it autoscales." },
    { role: "assistant", t: 70, content: "Okay. Tell me more." },
    { role: "user", t: 78, content: "The app servers take the long URL and make a short one with a hash and save it in Cassandra, and when you visit it they look it up in Redis, and if it's not there, Cassandra. Cassandra scales really well and Redis is fast, so it should handle a lot of traffic." },
    { role: "assistant", t: 105, content: "How many users are you expecting?" },
    { role: "user", t: 112, content: "Probably a lot, like millions. That's why I picked Cassandra and Kubernetes." },
    { role: "assistant", t: 125, content: "Which part do you think is hardest?" },
    { role: "user", t: 132, content: "Probably the scaling, but with autoscaling and Cassandra it should be fine. I think that's my design." },
    { role: "assistant", t: 150, content: "Okay. Do you have any questions for me?" },
  ],
  expect: {
    rigorMax: 2,
    quantitativeMax: 2,
    tradeoffMax: 2,
    depthMax: 2,
    steps: {
      clarify_requirements: ["missed"],
      estimate_scale: ["missed"],
      scaling_tradeoffs: ["missed"],
      wrap_up: ["missed"],
    },
  },
};

const URL_NO_MATH: GoldenTranscript = {
  id: "url-no-math",
  questionId: "sd-url-shortener",
  nudgesIssued: [],
  exhibitsRevealed: [{ exhibitId: "ex1", atSeconds: 100 }],
  turns: [
    ...OPENING,
    { role: "user", t: 55, content: "Let me start with scope. The core features are creating a short link and redirecting. Are custom aliases or analytics in scope, and do links expire?" },
    { role: "assistant", t: 68, content: "Create and redirect are the core; aliases and analytics are out of scope. Links are kept at least five years." },
    { role: "user", t: 78, content: "Okay. I'm assuming redirects need to be fast, under 100 milliseconds, and highly available, and a new link can take a second to propagate. What does traffic look like?" },
    { role: "assistant", t: 95, content: "Yes on those. I'm putting the usage numbers on your screen." },
    { role: "user", t: 110, content: "Okay, thanks — that's a lot of links, and clearly way more reads than writes. Let's move on to the API. POST /links with longUrl returns a shortCode; GET /{code} returns a 302 redirect. I'd store code, longUrl, createdAt, creatorId in a key-value store keyed by code, because every read is a single key lookup and there are no joins." },
    { role: "user", t: 150, content: "Write path: load balancer, link service, get a unique ID, base-62 encode it, store it, return the link. Read path: load balancer, redirect service, check the Redis cache, on a miss read the store and fill the cache, return the 302." },
    { role: "user", t: 185, content: "The hardest part is generating codes without collisions across servers. Hashing the URL needs a collision check on every write; a counter with each server leasing a block of IDs from a coordination service avoids collisions and the extra read. I'd lease blocks and shuffle the ID before encoding so codes aren't sequential." },
    { role: "user", t: 230, content: "For scale, the cache takes most reads because popular links are skewed; the cost is memory and staleness, but links don't change, so staleness only matters for deleted links, which must invalidate. I'd partition the store by code with consistent hashing — queries by user become scatter-gather, which is the tradeoff — and replicate three ways with async replication, accepting that a brand-new link might briefly 404 on a replica." },
    { role: "user", t: 280, content: "To sum up: key-value store partitioned by code, block-leased IDs, a cache on the read path. Main risks are hot links on one cache node and abuse, so I'd add replicated hot keys and URL scanning, plus monitoring of redirect latency." },
    { role: "assistant", t: 310, content: "Thanks. Any questions for me?" },
  ],
  expect: {
    rigorMax: 3,
    quantitativeMax: 2,
    steps: { estimate_scale: ["missed"], clarify_requirements: ["hit"], high_level_design: ["hit"] },
  },
};

const URL_HANDWAVE: GoldenTranscript = {
  id: "url-handwave",
  questionId: "sd-url-shortener",
  nudgesIssued: [
    { stepKey: "deep_dive", atSeconds: 175 },
    { stepKey: "scaling_tradeoffs", atSeconds: 210 },
  ],
  exhibitsRevealed: [{ exhibitId: "ex1", atSeconds: 95 }],
  turns: [
    ...OPENING,
    { role: "user", t: 55, content: "First, scope: create a short link and redirect. Analytics or custom aliases? And how long are links kept? I'd also assume redirects need to be fast and the service highly available." },
    { role: "assistant", t: 75, content: "Create and redirect only; links kept five years. Yes on fast and available. I'm putting usage numbers on your screen." },
    { role: "user", t: 95, content: "So 40 million a day over 86,400 seconds is about 460 writes per second, and 25 times that is about 11,600 reads per second. Storage is 40 million times 365 times 5, 73 billion links, times 500 bytes, about 36.5 terabytes." },
    { role: "user", t: 130, content: "API: POST /links with longUrl gives back a code, and GET /{code} redirects. I'll store code and longUrl in a NoSQL database keyed by code since it's just lookups." },
    { role: "user", t: 155, content: "Requests come in to a load balancer, then app servers. To create, the app server makes a code and saves it; to redirect, it looks up the code and redirects." },
    { role: "assistant", t: 175, content: "Which part of this do you think is going to be hardest to get right?" },
    { role: "user", t: 182, content: "Honestly it's all pretty standard. I'd generate codes with a hash. To scale I'd add caching and sharding, use Kafka for async stuff, and add more servers behind the load balancer. Replication for reliability. With all of that it'll scale to whatever we need." },
    { role: "assistant", t: 210, content: "What happens when traffic grows tenfold, or one of those machines goes down?" },
    { role: "user", t: 218, content: "We'd just add more shards and more cache, and replication handles machines going down. That's what big companies do. I think that covers it." },
    { role: "assistant", t: 235, content: "Okay. Any questions for me?" },
  ],
  expect: {
    rigorMax: 2,
    tradeoffMax: 2,
    depthMax: 3,
    steps: { deep_dive: ["missed"], scaling_tradeoffs: ["missed"], estimate_scale: ["hit"], wrap_up: ["missed"] },
  },
};

const URL_NUDGED: GoldenTranscript = {
  id: "url-nudged",
  questionId: "sd-url-shortener",
  nudgesIssued: [
    { stepKey: "clarify_requirements", atSeconds: 70 },
    { stepKey: "estimate_scale", atSeconds: 125 },
    { stepKey: "wrap_up", atSeconds: 395 },
  ],
  exhibitsRevealed: [{ exhibitId: "ex1", atSeconds: 140 }],
  turns: [
    ...OPENING,
    { role: "user", t: 52, content: "Okay. So we'll need a service that takes a long URL and gives back a short code, and then something that redirects." },
    { role: "assistant", t: 70, content: "Before we go further, what exactly does this need to do, and how well does it need to do it?" },
    { role: "user", t: 78, content: "Good point. Functionally: create a short link and redirect. I'd leave custom aliases and analytics out of scope unless you want them. Do links expire? Non-functionally, redirects need to be fast, under 100 milliseconds, and highly available; I'm fine with a new link taking a second to propagate, so availability over strict consistency." },
    { role: "assistant", t: 110, content: "Aliases and analytics are out; links are kept at least five years. Your assumptions are right." },
    { role: "user", t: 118, content: "Okay, so I'd have a link service and a redirect service behind a load balancer." },
    { role: "assistant", t: 125, content: "Roughly how much load and data are we talking about here?" },
    { role: "user", t: 132, content: "Can you share usage numbers?" },
    { role: "assistant", t: 140, content: "I'm putting them on your screen." },
    { role: "user", t: 150, content: "40 million new links a day divided by about 86,400 seconds is about 460 writes a second. Reads are 25x, so about 11,600 a second, and 35,000 at a 3x peak. Over five years that's 73 billion links, at 500 bytes about 36.5 terabytes. And 62 to the 6th is only 57 billion, so codes need 7 characters. It's read heavy, so the redirect path needs a cache." },
    { role: "user", t: 200, content: "API: POST /links with longUrl returns shortCode; GET /{code} returns a 302. The record is code, longUrl, createdAt, creatorId in a key-value store keyed by code, because it's single-key lookups at 73 billion rows with no joins." },
    { role: "user", t: 235, content: "Write path: load balancer, link service, take an ID, base-62 encode, write to the store, return the link. Read path: load balancer, redirect service, Redis cache, on a miss the store, fill the cache, return the 302." },
    { role: "user", t: 270, content: "The hardest part is collision-free code generation. Hashing needs a collision check on every write; leasing blocks of IDs from a coordination service per server avoids that, and losing a block when a server dies is fine with trillions of codes. I'd shuffle IDs so codes aren't guessable. I'd go with leased blocks." },
    { role: "user", t: 320, content: "For growth, the cache absorbs skewed reads — staleness is harmless since links don't change, except deletes must invalidate. Partition by code with consistent hashing; the cost is that per-user queries become scatter-gather. Replicate three ways with async replication, accepting that a new link may briefly 404 on a lagging replica." },
    { role: "assistant", t: 395, content: "If we had to stop here, how would you sum up where this design stands?" },
    { role: "user", t: 402, content: "It's a read-heavy key-value service: about 460 writes and 11,600 reads a second, 36.5 terabytes over five years, block-leased IDs, partitioned store, cache on redirects. The main risks are hot links on one cache node and abuse, so I'd add hot-key replication and URL scanning, and monitor redirect latency and hit rate." },
    { role: "assistant", t: 430, content: "Thanks. Any questions for me?" },
  ],
  expect: {
    rigorMax: 2,
    rigorMin: 2,
    steps: {
      clarify_requirements: ["prompted"],
      estimate_scale: ["prompted"],
      wrap_up: ["prompted"],
      api_data_model: ["hit"],
      high_level_design: ["hit"],
      deep_dive: ["hit"],
      scaling_tradeoffs: ["hit"],
    },
  },
};

const URL_SLIP: GoldenTranscript = {
  id: "url-slip",
  questionId: "sd-url-shortener",
  nudgesIssued: [],
  exhibitsRevealed: [{ exhibitId: "ex1", atSeconds: 95 }],
  turns: [
    ...OPENING,
    { role: "user", t: 55, content: "Let me scope it first: create and redirect are the core features, and I'd leave analytics and custom aliases out. I'm assuming fast redirects, under 100 milliseconds, high availability, and a new link can take a second to show up everywhere. Can I see the expected usage?" },
    { role: "assistant", t: 80, content: "That scope is right; links are kept five years. I'm putting the usage numbers on your screen." },
    { role: "user", t: 100, content: "40 million a day divided by 86,400 seconds is about 4,600 writes per second. Reads are 25 times that, so about 115,000 reads per second, and 3x peak is about 350,000 reads per second. Storage is 73 billion links at 500 bytes, about 36.5 terabytes. With 350,000 reads a second, I'll need a very large cache cluster and probably a CDN in front." },
    { role: "user", t: 150, content: "API: POST /links {longUrl} returns shortCode; GET /{code} returns a 302. Store code, longUrl and createdAt in a key-value store keyed by code — single-key lookups, no joins." },
    { role: "user", t: 180, content: "Write: load balancer, link service, unique ID from leased ID blocks, base-62 to 7 characters, store, return. Read: load balancer, redirect service, cache, store on a miss, 302." },
    { role: "user", t: 215, content: "The hardest part is the read volume — at 350,000 a second the cache tier is critical. I'd use a large Redis cluster with consistent hashing, and compare that with pushing redirects to a CDN edge: the CDN cuts latency and origin load, but makes deletes of abusive links slower to take effect because of edge TTLs." },
    { role: "user", t: 260, content: "For growth and failure: partition the store by code — the cost is that per-user queries scatter — and replicate three ways asynchronously, accepting a brief 404 for a brand-new link on a lagging replica. Cache staleness is mostly harmless because links are immutable." },
    { role: "user", t: 300, content: "In summary: a read-dominated service with a big cache and CDN tier, a partitioned key-value store, and leased IDs. Risks are hot keys and abuse; I'd monitor hit rate and redirect latency." },
    { role: "assistant", t: 330, content: "Thanks. Any questions for me?" },
  ],
  expect: { quantitativeMax: 2, rigorMax: 3, steps: { estimate_scale: ["missed"] } },
};

const INCIDENT_CHECKOUT: GoldenTranscript = {
  id: "incident-checkout",
  questionId: "inc-checkout-latency",
  nudgesIssued: [{ stepKey: "mitigate_first", atSeconds: 175 }],
  exhibitsRevealed: [
    { exhibitId: "ex1", atSeconds: 120 },
    { exhibitId: "ex2", atSeconds: 230 },
  ],
  turns: [
    { role: "assistant", t: 0, content: "Hi, thanks for joining. A quick question about you first, then one problem to work through, then your questions. What's a production issue you've dealt with?" },
    { role: "user", t: 10, content: "In my internship a cron job double-charged a handful of test accounts; I helped trace it to a retry without an idempotency key." },
    { role: "assistant", t: 40, content: "Thanks. Here's the scenario. It's mid-afternoon and the checkout page of our online store has gotten very slow — customers are complaining and some are abandoning their carts. You're the engineer on call. How do you handle it?" },
    { role: "user", t: 55, content: "First I want to understand the impact. Is it all users or some regions? When did it start, how slow is it against our target, and did anything change recently — a deploy, a config change, a traffic spike?" },
    { role: "assistant", t: 75, content: "It started around 14:05 and it's 14:50 now. A release went out at 14:05 adding promotion badges to every cart item; nothing else changed and traffic is normal. The target is 99.9% of checkouts under one second over 30 days." },
    { role: "user", t: 100, content: "Okay, so it's been 45 minutes. Can I see latency by endpoint?" },
    { role: "assistant", t: 120, content: "I'm putting it on your screen." },
    { role: "user", t: 130, content: "So checkout p99 went from 380 milliseconds to 4,200 — about 11 times worse — while cart and search are flat. That rules out a general database or network outage; it's specific to checkout, and the timing lines up with the 14:05 release. My hypotheses are the new release, a checkout-only dependency like the payment provider, or some bad data. I'd check traces next." },
    { role: "assistant", t: 175, content: "Users are hurting right now. What would you do in the next five minutes?" },
    { role: "user", t: 182, content: "Right — I'd restore service first. Is the badge feature behind a flag? If so I'd turn it off immediately; that's instant and low risk because it only removes badges. If not, I'd roll back the 14:05 release. I'd watch checkout p99 to confirm it recovers, and keep investigating in parallel." },
    { role: "assistant", t: 205, content: "It's behind a flag you can switch off instantly." },
    { role: "user", t: 212, content: "Then flag off now. For root cause, can I see what the database is doing for checkout requests?" },
    { role: "assistant", t: 230, content: "I'm putting it on your screen." },
    { role: "user", t: 240, content: "Queries per checkout went from 6 to 46, and DB CPU doubled from 35 to 70 percent. 40 extra queries with a 10-item average cart is 4 per item — the promotion lookup is called per item per promotion type. That's an N+1 query. It's not the payment provider, because the extra time shows up as database queries, and it's not bad data because every checkout is slow. So root cause: the release added per-item promotion lookups, multiplying queries and database load on the checkout path." },
    { role: "user", t: 300, content: "On the SLO: the budget is 0.1% of 30 days, which is 0.001 times 43,200 minutes, about 43 minutes. We've had about 45 minutes of nearly every checkout over a second, so we've burned the whole month's budget." },
    { role: "user", t: 330, content: "Next steps: fix the code to fetch promotions in one batched query for the whole cart, or cache them; add a test that fails if checkout query count jumps; ship behind a canary gated on checkout p99; add a burn-rate alert on the checkout SLO so we're paged in minutes; and run a blameless postmortem with owners for each action." },
    { role: "assistant", t: 370, content: "Thanks. Any questions for me?" },
  ],
  expect: {
    rigorMin: 4,
    rigorMax: 4,
    quantitativeMin: 4,
    steps: {
      assess_impact: ["hit"],
      mitigate_first: ["prompted"],
      gather_signals: ["hit"],
      form_hypotheses: ["hit"],
      root_cause: ["hit"],
      prevent_recurrence: ["hit"],
    },
  },
};

export const SD_GOLDENS: GoldenTranscript[] = [
  URL_STRONG,
  URL_BOXES,
  URL_NO_MATH,
  URL_HANDWAVE,
  URL_NUDGED,
  URL_SLIP,
  INCIDENT_CHECKOUT,
];
