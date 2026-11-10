/**
 * The system-design question bank.
 *
 * Every question is modeled on a public example (see each `source`) and
 * paraphrased: product names, numbers and exhibits are original. Three
 * families:
 *   - "system-design": a large distributed system (Xu, the Primer, Hello
 *     Interview) — the main family;
 *   - "feature-design": one product feature for engineers (Meta's "product
 *     architecture" round) — lighter on scale, heavier on APIs and edge cases;
 *   - "incident": debug a production incident (Google SRE book ch. 12/14).
 *
 * Difficulty is the candidate's level: Beginner = intern / new grad,
 * Intermediate = new grad to early-career, Advanced = mid-level (L4/E4–L5/E5).
 *
 * VERBAL ONLY: there is no whiteboard yet (the research ranked it as the most
 * expensive capability and deferred it), so exhibits are requirement,
 * traffic, SLO and dashboard tables, and the candidate describes components
 * and request flows out loud.
 *
 * NUMBERS ARE CHECKED: `scripts/verify-system-design-bank.ts` recomputes every
 * figure `strongAnswerNotes` quotes from the exhibit cells. Each math-bearing
 * question states a TOLERANCE: back-of-the-envelope estimates are graded on
 * order of magnitude and narrated method (Xu ch. 2: the process matters more
 * than the exact result), so the strong band is roughly ±50% of the reference
 * and the acceptable band is within 3×.
 *
 * SERVER-ONLY: registered in lib/problem-interview/banks.server.ts; never
 * import this module from client code or from the engine registry.
 */

import type { ProblemQuestion } from "@/lib/problem-interview/types";

import { SD_SOURCES } from "./sources";

export const SD_FAMILIES = ["system-design", "feature-design", "incident"] as const;
export type SdFamily = (typeof SD_FAMILIES)[number];

// ---------------------------------------------------------------------------
// System design (large-scale)
// ---------------------------------------------------------------------------

const URL_SHORTENER: ProblemQuestion = {
  id: "sd-url-shortener",
  family: "system-design",
  frameworkKey: "system-design",
  title: "Link shortener",
  prompt:
    "Let's design a link-shortening service — you paste in a long web address and get back a short link that redirects to it. " +
    "How would you design it?",
  interviewerFacts: [
    "Core features: create a short link from a long URL, and redirect anyone who opens the short link. Custom aliases and analytics are nice-to-haves, out of scope unless the candidate wants them.",
    "Links never expire unless the candidate proposes it; they're kept for at least five years.",
    "Redirects must be fast (aim for well under 100 ms) and the service should stay up even if a server dies; a brand-new link being unavailable for a second or two is acceptable.",
    "Short links should not be guessable in sequence, but they don't need to be secret.",
    "If asked about traffic, users or storage: put the usage exhibit on screen rather than reciting numbers.",
  ],
  exhibits: [
    {
      id: "ex1",
      title: "Usage forecast, year one",
      kind: "table",
      caption: "Product team's estimates for year one; plan for five years at this rate.",
      columns: ["Metric", "Value"],
      rows: [
        ["New links per day", "40 million"],
        ["Redirects per new link (read:write ratio)", "25"],
        ["Peak-to-average traffic", "3×"],
        ["Retention", "5 years"],
        ["Stored size per link (URL + metadata)", "500 bytes"],
      ],
      revealWhen: "after the candidate asks about traffic, number of users, scale, read/write ratio or storage",
      keyInsight:
        "Read-heavy (25:1): ~460 writes/s vs ~11,600 redirects/s (~35,000 at peak). 73 billion links over 5 years → ~36.5 TB, and 7 base-62 characters (3.52 trillion codes) are needed because 6 (56.8 billion) run out.",
    },
  ],
  strongAnswerNotes:
    "Reference math: writes = 40 million / 86,400 s ≈ 460 writes/s; reads = 25 × that ≈ 11,600 reads/s; peak 3× ≈ 35,000 reads/s. " +
    "Records = 40 million × 365 × 5 = 73 billion links; storage = 73 billion × 500 bytes ≈ 36.5 TB. Redirect bandwidth ≈ 11,600 × 500 bytes ≈ 5.8 MB/s. " +
    "Key length: 62^6 ≈ 56.8 billion < 73 billion, so 7 base-62 characters (62^7 ≈ 3.52 trillion). " +
    "TOLERANCE: strong band — writes 300–700/s, reads 8,000–17,000/s, storage 25–55 TB; acceptable band — within 3× (writes 150–1,400/s, reads 4,000–35,000/s, storage 12–110 TB); outside that, or an uncorrected order-of-magnitude slip, is wrong. Rounding a day to 100,000 s is fine. " +
    "Strong design: POST /links {longUrl} → shortCode; GET /{code} → 301/302 redirect (302 if analytics matter). Key-value store keyed by code (simple lookups, huge row count). " +
    "Code generation: base-62 of a unique ID from a distributed ID generator or pre-allocated ranges (no collisions, not sequential if shuffled/encoded) vs hashing + collision check. " +
    "Read path behind a cache (hot links, LRU) since reads dominate; replicate the store, partition by code; tradeoffs: 301 caches in browsers (less load, lost analytics), cache staleness is harmless because links are immutable. " +
    "Wrap-up risks: abuse/malicious links, hot keys, ID-generator availability.",
  difficulty: "Beginner",
  source: `${SD_SOURCES.xuVol1} ch. 8; ${SD_SOURCES.primer} (Pastebin / link-shortener exercise)`,
};

const LEADERBOARD: ProblemQuestion = {
  id: "sd-game-leaderboard",
  family: "system-design",
  frameworkKey: "system-design",
  title: "Game leaderboard",
  prompt:
    "A mobile game wants a leaderboard: players win points in matches, and anyone can see the top players and their own rank. " +
    "How would you design the system behind it?",
  interviewerFacts: [
    "Core features: record a player's points after each match, show the top 10, and show any player their own rank and score. Friends-only boards are out of scope.",
    "The leaderboard resets every month; past months only need to be archived, not served live.",
    "Rank updates should appear within a couple of seconds of a match ending; the board should survive a server failure without losing scores.",
    "Scores come from the game servers, not directly from players' phones.",
    "If asked about players, traffic or data size: put the usage exhibit on screen rather than reciting numbers.",
  ],
  exhibits: [
    {
      id: "ex1",
      title: "Player activity dashboard",
      kind: "table",
      caption: "Current month; product expects this to hold for the next year.",
      columns: ["Metric", "Value"],
      rows: [
        ["Monthly active players", "25 million"],
        ["Daily active players", "5 million"],
        ["Matches per daily player per day", "10"],
        ["Leaderboard views per daily player per day", "4"],
        ["Peak-to-average traffic", "5×"],
        ["Memory per leaderboard entry (incl. index overhead)", "100 bytes"],
      ],
      revealWhen: "after the candidate asks about number of players, traffic, update rate or data size",
      keyInsight:
        "~580 score updates/s on average, ~2,900/s at peak; ~230 board reads/s. The whole monthly board is 25 million × 100 bytes ≈ 2.5 GB — it fits in memory on one node, so an in-memory sorted set beats SQL rank queries and sharding is unnecessary.",
    },
  ],
  strongAnswerNotes:
    "Reference math: score updates = 5 million × 10 = 50 million/day ÷ 86,400 ≈ 580 updates/s; peak 5× ≈ 2,900 updates/s. " +
    "Board reads = 5 million × 4 = 20 million/day ≈ 230 reads/s. Memory = 25 million × 100 bytes = 2.5 GB. " +
    "TOLERANCE: strong band — updates 400–900/s average (2,000–4,500/s peak), memory 1.5–4 GB; acceptable — within 3×. " +
    "Strong design: game server → score service → in-memory sorted set (e.g. Redis ZINCRBY / ZREVRANGE for top 10 / ZREVRANK for own rank, O(log n)) plus a durable store (relational table of match results) as the source of truth to rebuild from. " +
    "Deep dive: why `SELECT COUNT(*) WHERE score > mine` on a SQL table is too slow at 25 million rows under write load; ties; monthly reset via a new key per month. " +
    "Tradeoffs: a single in-memory node is simple at 2.5 GB but needs a replica and persistence (snapshot/append log) for failover, with a few seconds of possible loss or rebuild from the durable store; sharding by score range only if it grows ~100×. " +
    "Wrap-up risks: cheating (scores only from game servers), hot reads on the top 10 (cache it), replica lag on own-rank reads.",
  difficulty: "Beginner",
  source: `${SD_SOURCES.xuVol2} ch. 10`,
};

const RATE_LIMITER: ProblemQuestion = {
  id: "sd-api-rate-limiter",
  family: "system-design",
  frameworkKey: "system-design",
  title: "API rate limiter",
  prompt:
    "We run a public API, and some clients send far too many requests. Design a rate limiter that sits in front of the API and enforces per-client limits.",
  interviewerFacts: [
    "Limits are per API key. The default rule is a fixed number of requests per minute; enterprise keys can have custom limits.",
    "Requests over the limit get an HTTP 429 with a header saying when to retry.",
    "The API runs behind a fleet of gateway servers; a client's requests can land on any of them.",
    "The limiter must add very little latency and must not take the API down if it fails — letting traffic through for a short time is better than blocking everyone.",
    "Limits should be accurate to within a few percent; a client briefly getting slightly more than its limit is acceptable.",
    "If asked about traffic, number of clients, the latency budget or memory: put the requirements exhibit on screen rather than reciting numbers.",
  ],
  exhibits: [
    {
      id: "ex1",
      title: "Gateway traffic and budget sheet",
      kind: "table",
      caption: "Current traffic and the platform team's budget.",
      columns: ["Item", "Value"],
      rows: [
        ["Peak API requests per second (all gateways)", "50,000"],
        ["Active API keys", "1 million"],
        ["Default limit per key", "100 requests per minute"],
        ["Gateway servers", "40"],
        ["Added latency budget (p99)", "5 ms"],
        ["Memory per counter entry (key + 2 fields)", "50 bytes"],
        ["Memory per stored request timestamp", "8 bytes"],
      ],
      revealWhen: "after the candidate asks about traffic, number of clients, limits, latency or memory",
      keyInsight:
        "A counter-based algorithm (token bucket / sliding-window counter) needs ~1 million × 50 bytes ≈ 50 MB; a sliding-window LOG needs up to 1 million × 100 × 8 bytes ≈ 800 MB — 16× more. 50,000 checks/s with a 5 ms budget means an in-memory shared store; splitting the limit across 40 gateways (2.5 requests/min each) is inaccurate.",
    },
  ],
  strongAnswerNotes:
    "Reference math: counter state = 1 million × 50 bytes = 50 MB; sliding-window log = 1 million × 100 timestamps × 8 bytes = 800 MB (16× more). " +
    "Peak 50,000 limit checks/s against the shared store. Local-only limits split 100/min across 40 gateways = 2.5 requests/min per gateway — inaccurate when traffic is uneven. " +
    "TOLERANCE: strong band — counter memory 25–100 MB and log memory 0.4–1.6 GB (or the right ratio between them); acceptable — within 3×. " +
    "Strong design: middleware in the gateway calling a shared in-memory store (Redis cluster) with an atomic check-and-decrement (Lua script or INCR + EXPIRE) to avoid the read-then-write race; rules loaded from config and cached in the gateway. " +
    "Algorithm comparison: fixed window (burst at boundary), sliding log (exact but memory-heavy), sliding-window counter or token bucket (approximate, cheap, allows bursts). " +
    "Tradeoffs: central store gives accuracy but adds a network hop (~0.5 ms in-datacenter) and a dependency → fail open on store timeout; local caching/batching of counts cuts latency at the cost of accuracy; shard counters by API key. " +
    "Wrap-up risks: hot keys from one abusive client, clock skew across nodes, monitoring 429 rates.",
  difficulty: "Intermediate",
  source: `${SD_SOURCES.xuVol1} ch. 4; ${SD_SOURCES.dean}`,
};

const NOTIFICATIONS: ProblemQuestion = {
  id: "sd-notification-service",
  family: "system-design",
  frameworkKey: "system-design",
  title: "Notification service",
  prompt:
    "Our company's apps need to send people notifications — push notifications, text messages and emails — for things like order updates and marketing campaigns. " +
    "Design the notification service.",
  interviewerFacts: [
    "Other internal services call the notification service; it decides channel and formatting and hands messages to third-party providers (a push gateway, an SMS provider, an email provider).",
    "Users can opt out per channel and per category (e.g. no marketing texts); opt-outs must be respected.",
    "Transactional notifications (order shipped) matter more than marketing ones and should not be delayed by a campaign.",
    "A notification may arrive a few seconds late, but must not be lost and should not be sent twice.",
    "Providers sometimes fail or throttle; they return errors we can retry.",
    "If asked about volume, peaks, provider limits or retention: put the volume exhibit on screen rather than reciting numbers.",
  ],
  exhibits: [
    {
      id: "ex1",
      title: "Notification volume sheet",
      kind: "table",
      caption: "Daily averages; campaigns are scheduled by marketing.",
      columns: ["Item", "Value"],
      rows: [
        ["Push notifications per day", "10 million"],
        ["Text messages per day", "1 million"],
        ["Emails per day", "5 million"],
        ["Largest push campaign (must finish within 10 minutes)", "2 million"],
        ["Planned text campaign (must finish within 1 hour)", "500,000"],
        ["SMS provider limit (messages per second)", "100"],
        ["Delivery log size per notification", "1 KB"],
        ["Delivery log retention", "90 days"],
      ],
      revealWhen: "after the candidate asks about volume, peaks, campaigns, provider limits or storage",
      keyInsight:
        "Average load is small (~185/s) but campaigns spike push to ~3,300/s, and the 500,000-text campaign needs ~139/s while the SMS provider allows 100/s — it would take ~83 minutes, so the hour can't be met without a second provider or a higher limit. Log storage ≈ 1.44 TB.",
    },
  ],
  strongAnswerNotes:
    "Reference math: total = 10 + 1 + 5 = 16 million/day ÷ 86,400 ≈ 185 notifications/s. Push campaign = 2 million ÷ 600 s ≈ 3,300 per second. " +
    "Text campaign = 500,000 ÷ 3,600 s ≈ 139 per second needed vs a 100/s provider limit → 500,000 ÷ 100 = 5,000 s ≈ 83 minutes, so the 1-hour goal fails with one provider. " +
    "Log storage = 16 million × 1 KB × 90 days ≈ 1.44 TB. " +
    "TOLERANCE: strong band — average 120–280/s, push peak 2,200–5,000/s, log 1–2.2 TB, and the SMS conclusion (cannot finish in an hour at 100/s) must be right; acceptable — within 3× on the rates. " +
    "Strong design: API → validation + preference/opt-out check → per-channel (and per-priority) message queues → channel workers → providers; delivery log; templates. " +
    "Deep dive: separate queues/priorities so campaigns never delay transactional messages; rate-limited SMS workers; retries with backoff + dead-letter queue; idempotency key per notification to avoid duplicates on retry (at-least-once queue + dedupe). " +
    "Tradeoffs: at-least-once + dedupe vs exactly-once cost; second SMS provider (cost, complexity) vs a longer campaign window; queues add seconds of latency but absorb spikes. " +
    "Wrap-up risks: provider outages (failover), opt-out cache staleness, monitoring delivery rates.",
  difficulty: "Intermediate",
  source: `${SD_SOURCES.xuVol1} ch. 10`,
};

const NEWS_FEED: ProblemQuestion = {
  id: "sd-news-feed",
  family: "system-design",
  frameworkKey: "system-design",
  title: "Social news feed",
  prompt:
    "Design the home feed for a social network: when people open the app they see recent posts from the accounts they follow.",
  interviewerFacts: [
    "Core features: publish a post (text, optional image link), follow accounts, and load a home feed of posts from followed accounts, newest first, paginated. Ranking, ads and comments are out of scope.",
    "The feed should load fast (a few hundred milliseconds) and is allowed to be a few seconds stale — a post appearing in followers' feeds after a short delay is fine.",
    "Some accounts are celebrities with tens of millions of followers.",
    "Images are stored in object storage and served from a CDN; the feed only carries their links.",
    "If asked about users, traffic, followers or storage: put the usage exhibit on screen rather than reciting numbers.",
  ],
  exhibits: [
    {
      id: "ex1",
      title: "Feed usage dashboard",
      kind: "table",
      caption: "Current daily averages.",
      columns: ["Metric", "Value"],
      rows: [
        ["Daily active users", "200 million"],
        ["Posts per daily user per day", "0.5"],
        ["Feed loads per daily user per day", "10"],
        ["Peak-to-average traffic", "2×"],
        ["Average followers per account", "300"],
        ["Largest account's followers", "50 million"],
        ["Stored size per post (text + metadata)", "1 KB"],
        ["Post IDs kept per user's cached feed", "500"],
        ["Bytes per post ID", "8 bytes"],
      ],
      revealWhen: "after the candidate asks about users, traffic, followers, read/write ratio or storage",
      keyInsight:
        "~1,160 posts/s vs ~23,000 feed loads/s (~46,000 at peak): read-heavy. Pushing every post to every follower is ~350,000 feed inserts/s and 50 million writes for one celebrity post — so a hybrid (push for normal accounts, pull for celebrities) is needed. Cached feeds ≈ 800 GB; posts ≈ 100 GB/day.",
    },
  ],
  strongAnswerNotes:
    "Reference math: posts = 200 million × 0.5 = 100 million/day ≈ 1,160 posts/s; feed loads = 200 million × 10 = 2 billion/day ≈ 23,000 reads/s; peak 2× ≈ 46,000 reads/s. " +
    "Fan-out on write = 100 million posts × 300 followers = 30 billion inserts/day ≈ 350,000 feed inserts/s; one celebrity post = 50 million inserts. " +
    "Post storage = 100 million × 1 KB = 100 GB/day (≈ 36.5 TB/year). Feed cache = 200 million × 500 × 8 bytes = 800 GB. " +
    "TOLERANCE: strong band — posts 800–1,700/s, feed reads 15,000–35,000/s, fan-out 230,000–520,000/s, feed cache 500 GB–1.2 TB; acceptable — within 3×. " +
    "Strong design: post service writes to a post store (partitioned by post ID) and publishes to a fan-out queue; fan-out workers push post IDs into followers' cached feeds (in-memory lists keyed by user); feed service reads the cached list, hydrates posts from a post cache, paginates by cursor. Social graph store for follows. " +
    "Deep dive: fan-out on write vs on read; hybrid for celebrities (merge their recent posts at read time); feed cache size cap; rebuild for inactive users on demand. " +
    "Tradeoffs: push = fast reads but write amplification and wasted work for inactive users; pull = cheap writes but slow reads; eventual consistency accepted (seconds of staleness); replication of caches; partition by user ID (hot users). " +
    "Wrap-up risks: celebrity hot keys, cache-node loss (rebuild cost), monitoring fan-out lag.",
  difficulty: "Advanced",
  source: `${SD_SOURCES.xuVol1} ch. 11; ${SD_SOURCES.primer} (Twitter timeline exercise); ${SD_SOURCES.kleppmann} ch. 1`,
};

const TICKET_BOOKING: ProblemQuestion = {
  id: "sd-ticket-booking",
  family: "system-design",
  frameworkKey: "system-design",
  title: "Concert ticket sales",
  prompt:
    "Design a ticketing system for big concerts: fans browse events, pick seats on a seat map, and buy tickets — including the moment a hugely popular show goes on sale.",
  interviewerFacts: [
    "Core features: browse/search events, view a seat map with availability, hold seats while paying, and complete purchase. Resale and dynamic pricing are out of scope.",
    "A seat must NEVER be sold twice. Browsing and the seat map may be a few seconds out of date.",
    "Once a fan picks seats, they should be held for them for 10 minutes while they pay; unpaid holds are released.",
    "Payment goes through an external payment provider that can take several seconds and occasionally times out.",
    "If asked about the on-sale traffic, seats, or order sizes: put the on-sale exhibit on screen rather than reciting numbers.",
  ],
  exhibits: [
    {
      id: "ex1",
      title: "Big on-sale event",
      kind: "table",
      caption: "Biggest show this year: one stadium, all seats released at 10:00.",
      columns: ["Metric", "Value"],
      rows: [
        ["Seats in the stadium", "50,000"],
        ["Fans arriving in the first 10 minutes", "2 million"],
        ["Requests per fan while shopping (pages, seat-map refreshes)", "20"],
        ["Average tickets per order", "4"],
        ["Seat hold time", "10 minutes"],
      ],
      revealWhen: "after the candidate asks about traffic, the on-sale spike, number of seats or orders",
      keyInsight:
        "2 million fans in 10 minutes ≈ 3,300 arrivals/s and ~67,000 requests/s, but at most 50,000 ÷ 4 = 12,500 orders (~21 orders/s) can ever succeed: the hard problems are the read spike and contention on a small set of seats, not write volume — hence a virtual waiting room plus strongly consistent seat holds.",
    },
  ],
  strongAnswerNotes:
    "Reference math: arrivals = 2 million ÷ 600 s ≈ 3,300 fans/s; requests = 3,300 × 20 ≈ 67,000 requests/s; successful orders ≤ 50,000 ÷ 4 = 12,500, about 21 orders/s over the 10 minutes. " +
    "TOLERANCE: strong band — 2,200–5,000 arrivals/s, 45,000–100,000 requests/s, and recognizing orders are in the ~10,000s; acceptable — within 3×. " +
    "Strong design: event/search service (read replicas, cache, search index; stale is fine) vs booking service backed by a relational DB with strong consistency. " +
    "Deep dive: seat holds with a status + expiry (conditional UPDATE … WHERE status = 'available', or a row lock / optimistic version check; or a distributed lock with TTL) so two fans can't hold the same seat; holds expire after 10 minutes; payment confirmed idempotently (idempotency key) and the seat flipped to sold only on success. " +
    "Virtual waiting room / queue that admits fans at a rate the booking path can handle; seat-map availability served from a cache updated by events (seconds stale). " +
    "Tradeoffs: strong consistency only where money and seats are (booking), eventual elsewhere; pessimistic vs optimistic locking under heavy contention; waiting room fairness vs latency. " +
    "Wrap-up risks: bots, payment timeouts leaving seats in limbo, hold expiry races.",
  difficulty: "Advanced",
  source: `${SD_SOURCES.helloInterview} (Ticketmaster breakdown); ${SD_SOURCES.xuVol2} ch. 7; ${SD_SOURCES.kleppmann} ch. 7`,
};

// ---------------------------------------------------------------------------
// Feature design for engineers (product architecture)
// ---------------------------------------------------------------------------

const THREADED_COMMENTS: ProblemQuestion = {
  id: "fd-threaded-comments",
  family: "feature-design",
  frameworkKey: "feature-design",
  title: "Comments with replies",
  prompt:
    "Our photo-sharing app wants to add comments on photos, with replies to comments. Walk me through how you'd build this feature, from the app to the database.",
  interviewerFacts: [
    "Replies are one level deep: you can reply to a comment, but not to a reply.",
    "Comments show newest first by default; a 'top' sort by likes is a nice-to-have.",
    "The photo's owner can delete any comment on their photo; authors can delete their own. Editing is out of scope for v1.",
    "Most photos get a handful of comments, but viral photos can get over 100,000.",
    "Mobile and web clients; new comments do not need to appear live — on the next refresh is fine for v1.",
    "If asked about scale: about 10 million daily users, who post around 3 comments and open about 50 comment lists per day each.",
  ],
  strongAnswerNotes:
    "Reference math (light; only if the candidate sizes it): 10 million × 3 = 30 million comments/day ≈ 350 writes/s; 10 million × 50 = 500 million list loads/day ≈ 5,800 reads/s — read-heavy. " +
    "TOLERANCE: strong band — writes 230–520/s, reads 3,900–8,700/s; acceptable — within 3×. Estimation is optional in this family; do not penalize its absence in quantitative if no other math was needed (return null then). " +
    "Strong design: POST /photos/{id}/comments {text, parentCommentId?}; GET /photos/{id}/comments?cursor=…&limit=20 (top-level) and GET /comments/{id}/replies?cursor=…; DELETE /comments/{id}. " +
    "Data: comments(id, photo_id, parent_id NULL, author_id, text, created_at, deleted, like_count, reply_count); index on (photo_id, created_at) and (parent_id, created_at); cursor pagination (not offset) because viral photos have 100k+ comments. " +
    "Flow: client → API → comment service → DB; denormalized comment_count on the photo; cache first page for viral photos. " +
    "Edge cases: deleting a parent with replies (soft delete, show 'deleted'), duplicate submits on retry (client idempotency key), permission checks, spam/abuse, counts drifting (async recount). " +
    "Tradeoffs: one-level replies keep queries simple; denormalized counts are fast but can drift; refresh-only (no live updates) for v1.",
  difficulty: "Beginner",
  source: `${SD_SOURCES.metaPrep} (product architecture round); ${SD_SOURCES.helloInterview}`,
};

const EVENT_WAITLIST: ProblemQuestion = {
  id: "fd-event-waitlist",
  family: "feature-design",
  frameworkKey: "feature-design",
  title: "Event RSVP with waitlist",
  prompt:
    "A campus events app wants an RSVP feature: events have a capacity, students can RSVP or cancel, and once an event is full new RSVPs go on a waitlist. How would you build it?",
  interviewerFacts: [
    "When someone cancels, the first person on the waitlist automatically gets the spot and is notified.",
    "Capacity must never be exceeded — the venue enforces fire-code limits.",
    "Students see whether they're confirmed or their waitlist position.",
    "About 30,000 students use the app; popular events have around 200 seats.",
    "For the most popular events, about 2,000 students try to RSVP within the first minute.",
    "Organizers can raise the capacity, which should promote people from the waitlist.",
  ],
  strongAnswerNotes:
    "Reference math (light): 2,000 RSVPs in 60 s ≈ 33 per second for one event, so ~1,800 land on the waitlist. The load is tiny; the problem is concurrency on the last seats. " +
    "TOLERANCE: strong band — 20–50 RSVPs/s; acceptable — within 3×. Estimation is optional in this family; return quantitative null if no math was needed. " +
    "Strong design: POST /events/{id}/rsvp → {status: confirmed|waitlisted, position}; DELETE /events/{id}/rsvp; GET /events/{id}/rsvp/me; PATCH /events/{id} {capacity} for organizers. " +
    "Data: events(id, capacity, confirmed_count), rsvps(event_id, user_id, status, created_at, unique(event_id,user_id)); waitlist order by created_at. " +
    "Concurrency: confirm with an atomic conditional update (UPDATE events SET confirmed_count = confirmed_count + 1 WHERE id = ? AND confirmed_count < capacity) inside a transaction, or row lock; otherwise waitlist. Cancel + promote in one transaction. " +
    "Edge cases: double-tap RSVP (unique constraint / idempotency), cancel racing with promotion, capacity lowered below confirmed count, notification fails after promotion (outbox / retry), promoted student no longer wants it. " +
    "Tradeoffs: strong consistency in one DB is fine at this scale (no need to shard); notifications async via a queue.",
  difficulty: "Beginner",
  source: `${SD_SOURCES.metaPrep} (product architecture round); ${SD_SOURCES.kleppmann} ch. 7`,
};

const READ_RECEIPTS: ProblemQuestion = {
  id: "fd-read-receipts",
  family: "feature-design",
  frameworkKey: "feature-design",
  title: "Read receipts in group chat",
  prompt:
    "Our messaging app wants read receipts: in one-on-one and group chats, people can see who has read each message. Design this feature.",
  interviewerFacts: [
    "Groups have up to 200 members. In a group you can tap a message to see who has read it; the chat list shows a 'seen by' summary for the latest message.",
    "Receipts should show up within a few seconds; they don't need to be perfectly real time.",
    "Users can turn read receipts off in settings; then they neither send nor see receipts.",
    "Messages are already delivered over a persistent connection (websocket) to online clients; offline clients sync when they reconnect.",
    "Clients are mostly mobile, so battery and data use matter.",
    "If asked about volume: put the messaging volume exhibit on screen rather than reciting numbers.",
  ],
  exhibits: [
    {
      id: "ex1",
      title: "Messaging volume dashboard",
      kind: "table",
      caption: "Daily averages across all chats.",
      columns: ["Metric", "Value"],
      rows: [
        ["Daily active users", "20 million"],
        ["Messages sent per daily user per day", "40"],
        ["Average chat size (members)", "10"],
        ["Chat opens per daily user per day", "30"],
      ],
      revealWhen: "after the candidate asks about volume, number of users, group sizes or how often people read",
      keyInsight:
        "A receipt per message per reader is 800 million × 9 ≈ 7.2 billion/day (~83,000/s); a per-user 'read up to message X' watermark updated when a chat is opened is ~600 million/day (~6,900/s) — about 12× less, and it answers 'who read this' by comparing watermarks.",
    },
  ],
  strongAnswerNotes:
    "Reference math: messages = 20 million × 40 = 800 million/day; per-message receipts = 800 million × 9 other members = 7.2 billion/day ≈ 83,000 receipts/s. " +
    "Watermark updates = 20 million × 30 chat opens = 600 million/day ≈ 6,900 updates/s — about 12× fewer. " +
    "TOLERANCE: strong band — per-message receipts 55,000–125,000/s, watermark 4,600–10,400/s (or the ~10× ratio); acceptable — within 3×. " +
    "Strong design: client sends POST/ws event read(chatId, lastReadMessageId) when the chat is visible (debounced); server stores read_state(chat_id, user_id, last_read_message_id, updated_at) — a watermark, not a row per message; 'who read message M' = members whose last_read ≥ M (message IDs ordered within a chat). " +
    "Flow: read event → receipt service → upsert watermark (monotonic: only move forward) → fan out a small update to online members over websockets; offline members pull on sync. " +
    "Edge cases: out-of-order or duplicate read events (max() upsert), privacy setting off (don't store/send), user leaves group, multi-device (per user, not per device), large groups (batch/throttle fan-out, fetch the reader list on tap instead of pushing). " +
    "Tradeoffs: watermark is cheap but can't express 'read a later message but skipped an earlier one'; push vs pull for receipts (battery vs freshness); eventual consistency of a few seconds.",
  difficulty: "Intermediate",
  source: `${SD_SOURCES.xuVol1} ch. 12 (chat system); ${SD_SOURCES.metaPrep} (product architecture round)`,
};

// ---------------------------------------------------------------------------
// Debug a production incident
// ---------------------------------------------------------------------------

const DISK_FULL: ProblemQuestion = {
  id: "inc-disk-full",
  family: "incident",
  frameworkKey: "incident-debug",
  title: "Overnight API errors",
  prompt:
    "You're on call. At 2:10 in the morning you get paged: the order-history API is returning errors for some users. Talk me through how you'd handle it.",
  interviewerFacts: [
    "The order-history API runs on 4 identical servers behind a load balancer that spreads traffic evenly.",
    "The errors are HTTP 500s. Customers can still place orders; they just can't see their past orders on some page loads.",
    "It started around 1:50 a.m. and has stayed steady since.",
    "Nothing was deployed today. Yesterday at 5 p.m. an engineer changed the logging level on one server to debug an issue and went home.",
    "If asked for error rates by server, put the errors exhibit on screen. If asked for that server's health metrics or logs, put the host exhibit on screen.",
    "Taking one server out of the load balancer is safe: the other three can carry the traffic.",
    "Each server has a 200 GB disk.",
  ],
  exhibits: [
    {
      id: "ex1",
      title: "Error rate by server",
      kind: "table",
      caption: "Last 15 minutes. Traffic is split evenly across servers.",
      columns: ["Server", "Error rate"],
      rows: [
        ["api-1", "0.2%"],
        ["api-2", "0.1%"],
        ["api-3", "38%"],
        ["api-4", "0.3%"],
      ],
      revealWhen: "after the candidate asks for error rates, a breakdown by server, or which machines are affected",
      keyInsight: "Only api-3 is failing; the overall error rate is ≈ (0.2 + 0.1 + 38 + 0.3) ÷ 4 ≈ 9.7%, so this is one bad host, not the code or the database.",
    },
    {
      id: "ex2",
      title: "api-3 host health",
      kind: "table",
      caption: "Disk capacity 200 GB. Log line sampled from the application log.",
      columns: ["Signal", "Yesterday 5 p.m.", "Now"],
      rows: [
        ["Disk used", "61%", "100%"],
        ["CPU", "14%", "12%"],
        ["Memory", "41%", "40%"],
        ["Top log error", "—", "ENOSPC: no space left on device (writing debug.log)"],
      ],
      revealWhen: "after the candidate asks for the failing server's metrics, disk, CPU, memory, or logs",
      keyInsight: "The disk filled from 61% to 100% in ~9 hours (≈ 78 GB, ~8.7 GB/hour) because debug logging was left on; writes fail with ENOSPC.",
    },
  ],
  strongAnswerNotes:
    "Reference math: overall error rate ≈ (0.2 + 0.1 + 38 + 0.3) ÷ 4 ≈ 9.7%. Disk growth = (100% − 61%) × 200 GB = 78 GB over ~9 hours (5 p.m. → 2 a.m.) ≈ 8.7 GB/hour. " +
    "TOLERANCE: strong band — overall error rate 7–13%, growth 6–13 GB/hour; acceptable — within 3× (or simply recognizing one host of four at ~38%). " +
    "Strong handling: size impact (some users, ~1 in 4 requests on one host, reads only, since 1:50) → mitigate first by draining api-3 from the load balancer (safe; three hosts carry traffic) → gather per-host errors and host metrics → hypotheses (bad host vs code vs DB; disk vs memory vs CPU) ruled in/out by the exhibits → root cause: debug log level left on yesterday filled the disk, writes fail with ENOSPC → fix: revert log level, rotate/delete logs, return host. " +
    "Prevention: log rotation with size caps, disk-usage alert at ~80%, temporary config changes with an expiry/owner, blameless postmortem.",
  difficulty: "Beginner",
  source: `${SD_SOURCES.sreBook} ch. 12 and 14; ${SD_SOURCES.gregg}`,
};

const CHECKOUT_LATENCY: ProblemQuestion = {
  id: "inc-checkout-latency",
  family: "incident",
  frameworkKey: "incident-debug",
  title: "Slow checkout after a deploy",
  prompt:
    "It's mid-afternoon and the checkout page of our online store has gotten very slow — customers are complaining and some are abandoning their carts. You're the engineer on call. How do you handle it?",
  interviewerFacts: [
    "The slowdown began at about 14:05. It's now 14:50.",
    "A release went out at 14:05 that added promotion badges to every item in the cart. It is behind a feature flag that can be switched off instantly.",
    "Nothing else changed: no infrastructure or traffic changes; traffic is normal for a weekday.",
    "The service-level objective: 99.9% of checkout requests complete in under 1 second, measured over 30 days. Before today the month had been clean.",
    "If asked for latency by endpoint or dashboards, put the latency exhibit on screen. If asked about database load, query counts or traces, put the database exhibit on screen.",
    "The average cart has 10 items.",
  ],
  exhibits: [
    {
      id: "ex1",
      title: "p99 latency by endpoint",
      kind: "table",
      caption: "Milliseconds. Before = 13:00–14:00; after = 14:10–14:50.",
      columns: ["Endpoint", "Before", "After"],
      rows: [
        ["/checkout", "380 ms", "4,200 ms"],
        ["/cart", "120 ms", "130 ms"],
        ["/search", "200 ms", "210 ms"],
      ],
      revealWhen: "after the candidate asks for latency metrics, dashboards, or which endpoints are slow",
      keyInsight: "Only /checkout regressed (~11× slower at p99); /cart and /search are flat, so it's not a general infrastructure or database outage.",
    },
    {
      id: "ex2",
      title: "Checkout database activity",
      kind: "table",
      caption: "Per checkout request, from traces. Average cart: 10 items.",
      columns: ["Signal", "Before", "After"],
      rows: [
        ["Database queries per checkout request", "6", "46"],
        ["Database CPU", "35%", "70%"],
        ["Slowest new query", "—", "SELECT promotions WHERE item_id = ? (called per item, per promotion type)"],
      ],
      revealWhen: "after the candidate asks about database load, query counts, traces, or what the slow requests are doing",
      keyInsight: "Queries jumped from 6 to 46 per checkout — 4 extra per item × 10 items — an N+1 query pattern introduced by the promotion-badge release.",
    },
  ],
  strongAnswerNotes:
    "Reference math: extra queries = 46 − 6 = 40 = 4 per item × 10 items (N+1). p99 went from 380 ms to 4,200 ms (≈ 11×). " +
    "Error budget: 0.1% of 30 days = 0.001 × 30 × 24 × 60 = 43.2 minutes; ~45 minutes of nearly all checkouts over 1 s (14:05–14:50) has burned the whole month's budget. " +
    "TOLERANCE: strong band — budget 30–60 minutes and the conclusion that it is exhausted; acceptable — within 3× or a correct qualitative read (only checkout regressed; queries jumped ~8×). " +
    "Strong handling: impact (checkout only, all users, since 14:05, SLO breached, revenue at risk) → mitigate first: turn off the feature flag (instant, low-risk) or roll back, before root-causing → signals: latency by endpoint, traces/query counts, DB CPU → hypotheses: the 14:05 release vs DB capacity vs traffic, ruled in/out by ex1/ex2 → root cause: per-item promotion lookups (N+1) multiplied queries and DB load. " +
    "Prevention: batch the promotion lookup (one query with IN / join, or cache promotions), query-count test or tracing check in CI, canary release gated on p99, SLO burn-rate alert, blameless postmortem.",
  difficulty: "Intermediate",
  source: `${SD_SOURCES.sreBook} ch. 12, 14 and 15; ${SD_SOURCES.sreWorkbook} ch. 2 and 5`,
};

const CACHE_STAMPEDE: ProblemQuestion = {
  id: "inc-cache-stampede",
  family: "incident",
  frameworkKey: "incident-debug",
  title: "Errors after cache maintenance",
  prompt:
    "At 9 a.m. our product-catalog service starts throwing server errors and timing out across the board, and it's not recovering on its own. You're leading the response. How do you approach it?",
  interviewerFacts: [
    "The catalog service reads product data from a cache cluster of 3 nodes, falling back to the database on a cache miss.",
    "No code was deployed this week.",
    "Clients of the catalog service retry failed requests up to 3 times, immediately, with no backoff.",
    "If asked for metrics over time (cache hit rate, database load, errors), put the metrics exhibit on screen. If asked what changed, maintenance, or the change log, put the change-log exhibit on screen.",
    "The database can serve about 8,000 queries per second before it saturates.",
    "Mitigation options available if asked: shed or rate-limit traffic at the load balancer, turn off client retries via config, serve stale data from a secondary read-only snapshot, or add database read replicas (takes ~20 minutes).",
  ],
  exhibits: [
    {
      id: "ex1",
      title: "Catalog metrics, 8:55–9:10",
      kind: "table",
      caption: "Incoming traffic steady at 50,000 requests/s throughout.",
      columns: ["Time", "Cache hit rate", "Database queries/s", "Database p99", "5xx rate"],
      rows: [
        ["8:55", "96%", "2,000", "15 ms", "0.1%"],
        ["9:00", "60%", "20,000", "2,400 ms", "31%"],
        ["9:05", "58%", "23,000", "timeouts", "47%"],
        ["9:10", "61%", "24,000", "timeouts", "45%"],
      ],
      revealWhen: "after the candidate asks for metrics over time, cache hit rate, database load or error rates",
      keyInsight:
        "Hit rate fell from 96% to ~60%, so database load went from 50,000 × 4% = 2,000/s to 50,000 × 40% = 20,000/s — 2.5× the database's ~8,000/s capacity; immediate retries push it higher still, so it can't recover on its own.",
    },
    {
      id: "ex2",
      title: "Change log",
      kind: "table",
      caption: "Infrastructure changes in the last 24 hours.",
      columns: ["Time", "Change"],
      rows: [
        ["Yesterday 16:00", "Upgraded monitoring agent on all hosts"],
        ["8:58 today", "Cache node 2 restarted for a kernel patch (came back empty)"],
      ],
      revealWhen: "after the candidate asks what changed, about maintenance, deploys, or the change log",
      keyInsight: "A cache node restarted empty at 8:58 — a cold cache — immediately before the spike.",
    },
  ],
  strongAnswerNotes:
    "Reference math: database load = 50,000 × (1 − 0.96) = 2,000 queries/s before; 50,000 × (1 − 0.60) = 20,000 queries/s after — 10× more and 2.5× the database's 8,000/s capacity. " +
    "With up to 3 immediate retries each failed request can become 4 attempts, so offered load can climb toward several times that. " +
    "TOLERANCE: strong band — database load 15,000–25,000/s and the over-capacity conclusion; acceptable — within 3× or a correct qualitative chain (hit rate fell → database overloaded). " +
    "Strong handling: impact (all catalog reads, ~45% errors, since 9:00, not recovering) → mitigate first: stop the retry storm (disable retries / shed load at the load balancer) and serve stale data from the snapshot so the database can recover and the cache can warm; add replicas only as a slower step → signals: hit rate, DB QPS/latency, change log → hypotheses: cold cache vs bad deploy (none) vs traffic spike (traffic flat) vs database fault → root cause: a cache node restarted empty (cold cache) sent ~10× load to the database, and immediate retries turned overload into a self-sustaining thundering herd / retry storm. " +
    "Prevention: warm a node before returning it to rotation (or restart one at a time with consistent hashing + replicas), request coalescing / single-flight on misses, exponential backoff with jitter and retry budgets, load shedding at the database tier, alert on hit-rate drop, blameless postmortem.",
  difficulty: "Advanced",
  source: `${SD_SOURCES.sreBook} ch. 12 and 14 (and ch. 22, “Addressing Cascading Failures”); ${SD_SOURCES.kleppmann} ch. 1`,
};

export const SD_BANK: readonly ProblemQuestion[] = [
  URL_SHORTENER,
  LEADERBOARD,
  RATE_LIMITER,
  NOTIFICATIONS,
  NEWS_FEED,
  TICKET_BOOKING,
  THREADED_COMMENTS,
  EVENT_WAITLIST,
  READ_RECEIPTS,
  DISK_FULL,
  CHECKOUT_LATENCY,
  CACHE_STAMPEDE,
];

export function getSdQuestion(id: string): ProblemQuestion | null {
  return SD_BANK.find((question) => question.id === id) ?? null;
}
