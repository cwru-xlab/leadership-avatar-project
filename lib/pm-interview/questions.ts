/**
 * Product-management interview question bank.
 *
 * Prompts are deliberately ABSTRACT, as they are in real FAANG PM loops
 * ("Design an alarm clock for the deaf"): the candidate is expected to supply
 * the goal, user and scope by asking or assuming. `interviewerFacts` are
 * answers the interviewer gives ONLY when asked; `strongAnswerNotes` describe
 * what a strong answer covers — a grading reference, never an answer key.
 *
 * Families and their frameworks (see ./frameworks.ts):
 *   product-design       → circle
 *   product-improvement  → circle
 *   metrics-execution    → metrics-execution (two are metric-drop cases with exhibits)
 *   estimation           → estimation
 *   strategy             → strategy
 *
 * Every exhibit's numbers were checked for internal consistency (rows sum to
 * totals, percentage changes recomputed from the raw values); the arithmetic
 * is reproduced in comments beside each exhibit and re-checked by
 * scripts/verify-pm-interview-bank.ts.
 *
 * Sources: question TYPES come from McDowell & Bavaro, "Cracking the PM
 * Interview" (2013) and Lewis C. Lin, "Decode and Conquer"; specific prompts
 * are modeled on questions that circulate publicly in PM-prep material
 * (Exponent's PM question database, IGotAnOffer's Google/Meta/Amazon PM
 * guides, Product Alliance, candidate reports on Glassdoor). Where a prompt
 * is our own, `source` says so. No text is copied from those sources.
 */

import type { ProblemQuestion } from "@/lib/problem-interview/types";

const CPI = "McDowell & Bavaro, Cracking the PM Interview";
const DAC = "Lewis C. Lin, Decode and Conquer";

// ---------------------------------------------------------------------------
// Product design (CIRCLES)
// ---------------------------------------------------------------------------

const DESIGN: ProblemQuestion[] = [
  {
    id: "pm-design-alarm-clock-deaf",
    family: "product-design",
    frameworkKey: "circle",
    title: "Alarm clock for the deaf",
    prompt: "Design an alarm clock for the deaf.",
    interviewerFacts: [
      "There's no company constraint — you can assume a startup or a large hardware company, your call.",
      "Assume the US market to start.",
      "Budget and hardware cost are open; tell me what you'd assume.",
      "The goal is a product people would actually choose over what they use now.",
      "If asked what deaf and hard-of-hearing people use today: bed-shaker pads under the pillow, flashing-light alarms, smartwatch vibration, or relying on another person.",
    ],
    strongAnswerNotes:
      "Clarifies goal and scope, then distinguishes segments (profoundly deaf vs hard of hearing; living alone vs with a hearing partner; heavy sleepers; travelers; parents who must also wake to a baby). Picks one with a reason. Needs go beyond 'wake up' to waking reliably without waking a partner, confidence it will work, snooze control, portability, and awareness of other night-time alerts (smoke alarm, doorbell, baby). Prioritizes explicitly (e.g. reliability for those living alone). Solutions range from wearable haptics and light ramps to bed-integrated vibration and a hub that also relays smoke-alarm and doorbell events. Tradeoffs: comfort of wearing something overnight, battery/charging, cost, false wakes. Summary ties back to the chosen user and names a success metric (e.g. on-time wake rate, nights worn per week).",
    difficulty: "Beginner",
    source: `Design-for-a-constrained-user prompt type (${CPI}); this prompt circulates widely in public Google PM prep lists (Exponent, IGotAnOffer).`,
  },
  {
    id: "pm-design-loneliness",
    family: "product-design",
    frameworkKey: "circle",
    title: "A product for loneliness",
    prompt: "Design a product for people who are lonely.",
    interviewerFacts: [
      "You can assume you're at a large consumer tech company with a big existing user base, or a startup — pick one and say why.",
      "No platform constraint.",
      "The company's goal is meaningful impact on wellbeing; a sustainable business model matters but isn't the first priority.",
      "If asked for data: roughly one in two US adults reported measurable loneliness in the 2023 US Surgeon General advisory.",
    ],
    strongAnswerNotes:
      "Recognizes loneliness spans very different segments (older adults living alone, people who just moved cities, new parents, remote workers, college freshmen) with different root causes; picks one deliberately. Needs distinguish surface wants (more contact) from the underlying need (recurring, low-stakes, in-person connection; feeling useful). Prioritizes by severity and by where technology helps rather than replaces human contact. Solutions avoid 'just another social app' and include at least one offline-anchored idea. Evaluates risks honestly: safety, stigma of a 'lonely' label, engagement metrics that work against wellbeing. Recommends with a wellbeing-oriented success metric (e.g. repeat in-person meetups) and a counter-metric.",
    difficulty: "Intermediate",
    source: "Our prompt, in the open-ended 'design a product for <need>' style common in Meta product-sense rounds (IGotAnOffer, Exponent Meta PM guides).",
  },
  {
    id: "pm-design-refrigerator-city",
    family: "product-design",
    frameworkKey: "circle",
    title: "Refrigerator for a city",
    prompt: "Design a refrigerator for a city.",
    interviewerFacts: [
      "'For a city' is intentionally open — tell me how you interpret it.",
      "If asked about the customer: the city government is open to buying or permitting something, but you can also design for residents.",
      "Assume a large US city such as Chicago.",
      "No budget given; state your assumptions.",
    ],
    strongAnswerNotes:
      "Treats the ambiguity as the first problem: a fridge for the city as a buyer (food-waste reduction, food insecurity, emergency cold storage) vs for city dwellers (tiny apartments, shared housing, grocery-delivery handoff). Picks one interpretation explicitly. Identifies stakeholders (residents, restaurants donating surplus, health inspectors, city). Needs might be safe access to surplus food, trust in freshness, or secure delivery handoff. Prioritizes with criteria; solutions might include community fridges with freshness sensing, shared building fridges with lockers, or neighborhood cold-storage for delivery. Tradeoffs: food safety liability, vandalism, maintenance ownership, power cost. Summarizes with a measurable outcome (pounds of food rescued, fill/empty turnover).",
    difficulty: "Advanced",
    source: `Our prompt, modeled on the deliberately ambiguous 'design an X for Y' prompts described in ${CPI} and public Google PM prep lists.`,
  },
  {
    id: "pm-design-elevator-skyscraper",
    family: "product-design",
    frameworkKey: "circle",
    title: "Elevators for a skyscraper",
    prompt: "Design the elevator system for a 100-story office building.",
    interviewerFacts: [
      "It's a new building in a major US city, mostly office tenants, with a restaurant on the top floor.",
      "About 15,000 people work in the building on a typical day.",
      "The developer cares about tenant satisfaction and about how much floor space the elevator shafts take up.",
      "Peak load is the morning arrival window, roughly 8:15–9:15.",
    ],
    strongAnswerNotes:
      "Clarifies who the customer is (developer paying, tenants and visitors riding, maintenance staff, people with disabilities, emergency responders). Needs: short wait at morning peak, predictable trips, accessibility, evacuation, low shaft footprint. Prioritizes morning peak wait time for tenants (or another justified choice). Solutions range from zoned express banks and sky lobbies to destination dispatch (choose floor before entering), double-deck cars, and tenant badge-based calling. Tradeoffs: shaft space vs capacity, learning curve of destination dispatch, cost. Summary names a measurable target (e.g. average peak wait under 30–45 seconds).",
    difficulty: "Intermediate",
    source: `Classic physical-product design prompt type (${CPI}); variants circulate in Google and Amazon PM prep lists.`,
  },
  {
    id: "pm-design-future-wallet",
    family: "product-design",
    frameworkKey: "circle",
    title: "The wallet of the future",
    prompt: "Design a wallet.",
    interviewerFacts: [
      "Physical, digital, or both — your call.",
      "Assume you're a large consumer-electronics company.",
      "Timeline: something that could ship within two years.",
    ],
    strongAnswerNotes:
      "Asks what a wallet is FOR (identity, payment, keys, receipts, cash, memories) and recognizes phones already absorb much of it. Segments users (phone-first young adults, older cash users, travelers, parents managing kids' money, people in cash-heavy economies) and chooses one. Needs might be not losing it, proving identity, splitting costs. Prioritizes deliberately. Solutions span hardware (tracker-enabled, minimal card holder), software (digital ID, shared family wallet) and hybrid. Tradeoffs: security vs convenience, ecosystem lock-in, regulatory acceptance of digital ID. Summarizes with a metric such as weekly active use or 'lost wallet' incidents.",
    difficulty: "Beginner",
    source: `Open-ended everyday-object design prompt type (${CPI}; ${DAC}).`,
  },
  {
    id: "pm-design-better-waiting",
    family: "product-design",
    frameworkKey: "circle",
    title: "A better way to wait",
    prompt: "Design a better way to wait.",
    interviewerFacts: [
      "Waiting anywhere — it's up to you to narrow it.",
      "Assume a large tech company with a popular maps and phone platform, if that helps.",
      "No hardware constraint.",
    ],
    strongAnswerNotes:
      "Narrows the problem explicitly (waiting at the doctor, at the DMV, for a restaurant table, for a delayed flight, on hold with customer service) using criteria such as frequency and frustration. Identifies the users and the other side (the business managing the queue). Needs separate the wait itself from uncertainty about the wait, being tethered to the spot, and wasted time. Prioritizes (e.g. uncertainty + being tethered). Solutions include virtual queues with live ETA, 'leave now' nudges, and productive-wait content; at least one should change the business's side of the queue. Tradeoffs: business adoption, no-shows, fairness to people without phones. Recommends with a success metric like perceived wait or walk-away rate.",
    difficulty: "Advanced",
    source: "Our prompt, in the highly abstract style the brief asks for; modeled on the 'improve an experience' prompts in Exponent's PM question database.",
  },
  {
    id: "pm-design-first-kitchen",
    family: "product-design",
    frameworkKey: "circle",
    title: "Kitchen for a first-time cook",
    prompt: "Design a kitchen product for someone who has never cooked.",
    interviewerFacts: [
      "Hardware, software or both is fine.",
      "Assume a mid-size consumer appliance company that wants a new product line.",
      "If asked about the business goal: the company wants a product that keeps being used after the first month, not one that ends up in a cupboard.",
    ],
    strongAnswerNotes:
      "Segments non-cooks (students in a first apartment, recently single older adults, busy professionals relying on delivery, people with dietary needs) and chooses one. Needs center on confidence, knowing what to buy, timing, and food safety, not just recipes. Prioritizes needs against the company's 'still used after a month' goal. Solutions include guided appliances, ingredient kits, step-by-step timing assistance; at least one considers habit formation. Tradeoffs: cost, counter space, crowded meal-kit competition. Summary names a retention-style metric (e.g. meals cooked per week at day 30).",
    difficulty: "Beginner",
    source: `Our prompt, in the 'design for a novice user' style (${CPI}).`,
  },
];

// ---------------------------------------------------------------------------
// Product improvement (CIRCLES-shaped)
// ---------------------------------------------------------------------------

const IMPROVEMENT: ProblemQuestion[] = [
  {
    id: "pm-improve-favorite-product",
    family: "product-improvement",
    frameworkKey: "circle",
    title: "Improve a product you love",
    prompt: "What's a product you use often? How would you improve it?",
    interviewerFacts: [
      "Any product, digital or physical.",
      "If asked about the goal: assume you just became the PM for it and need to pick your first big bet.",
      "If asked for data about the product, say you don't have internal data and they should state reasonable assumptions.",
    ],
    strongAnswerNotes:
      "Briefly explains why they use it and what the product's goal is for the company. Identifies user segments beyond themselves and deliberately picks one (not just 'people like me'). Names pain points or unmet needs grounded in real usage, prioritizes them, proposes several distinct improvements, weighs effort and risk to existing users, and lands on one with a success metric. Weak answers list three features they personally want.",
    difficulty: "Beginner",
    source: `The single most widely reported PM interview opener (${CPI}; Google and Meta reports on Glassdoor).`,
  },
  {
    id: "pm-improve-google-maps",
    family: "product-improvement",
    frameworkKey: "circle",
    title: "Improve Google Maps",
    prompt: "How would you improve Google Maps?",
    interviewerFacts: [
      "Assume you're a PM on the Maps team.",
      "If asked for the goal: leadership cares about engagement beyond navigation — Maps being used when you're not driving.",
      "Assume global, but you can narrow.",
    ],
    strongAnswerNotes:
      "Clarifies the goal and notes Maps serves very different jobs (navigation, discovery of places, transit, local businesses). Segments users (drivers, transit commuters, tourists, local explorers, small businesses) and picks one tied to the goal. Needs for the chosen segment (e.g. tourists: deciding what's worth doing nearby, trusting reviews, navigating transit in a foreign language). Prioritizes, lists several solutions, evaluates against effort, privacy, and fit with existing surfaces, and recommends one with an engagement metric plus a counter-metric.",
    difficulty: "Intermediate",
    source: "Commonly reported Google PM improvement question (IGotAnOffer and Exponent Google PM guides; Glassdoor).",
  },
  {
    id: "pm-improve-spotify",
    family: "product-improvement",
    frameworkKey: "circle",
    title: "Improve Spotify",
    prompt: "How would you improve Spotify?",
    interviewerFacts: [
      "Assume you're a PM at Spotify.",
      "If asked about the goal: the company wants to grow paid subscribers.",
      "Free-tier users can't choose songs on demand on mobile; Premium removes ads and allows downloads.",
    ],
    strongAnswerNotes:
      "Ties the improvement to the subscriber-growth goal. Segments (free users near conversion, families sharing an account, students, podcast-first listeners, artists) and picks one with a reason linked to conversion. States needs of that segment, prioritizes, lists varied solutions (not only 'better recommendations'), weighs cannibalization, label costs and free-tier experience, and recommends one with a conversion metric and a churn guardrail.",
    difficulty: "Intermediate",
    source: "Product-improvement prompt on a named consumer app, a common format in Meta and Spotify PM reports (Exponent PM question database).",
  },
  {
    id: "pm-improve-linkedin-students",
    family: "product-improvement",
    frameworkKey: "circle",
    title: "Improve LinkedIn for students",
    prompt: "How would you improve LinkedIn for college students?",
    interviewerFacts: [
      "Assume you're the PM for LinkedIn's student experience.",
      "If asked about the goal: increase the share of students who are still active one year after graduation.",
      "Many students create a profile for a class or a career fair and then stop using it.",
    ],
    strongAnswerNotes:
      "Recognizes 'students' contains different users (first-years without experience, juniors seeking internships, graduating seniors, international students, community-college students) and picks one tied to the retention goal. Needs might be not knowing what to post, lacking a network, or not seeing relevant roles. Prioritizes, lists varied solutions (including ones involving universities or employers), evaluates two-sided effects (recruiter spam, quality), and recommends with a retention metric.",
    difficulty: "Advanced",
    source: "Our prompt, in the 'improve <product> for <segment>' format used in Meta and LinkedIn PM reports (Exponent).",
  },
];

// ---------------------------------------------------------------------------
// Metrics & execution
// ---------------------------------------------------------------------------

const METRICS: ProblemQuestion[] = [
  {
    id: "pm-metrics-food-delivery-drop",
    family: "metrics-execution",
    frameworkKey: "metrics-execution",
    title: "Food delivery orders down 12%",
    prompt:
      "You're the PM for a food delivery app. Orders this week are down 12% compared to last week. What's going on?",
    interviewerFacts: [
      "The metric is completed orders; the definition and the tracking pipeline haven't changed.",
      "Last week was a normal week — no holiday, no big weather event, no promotion ending.",
      "No competitor launched a promotion that we know of.",
      "If asked about releases: Android app version 7.4 rolled out to 100% of Android users last Tuesday. iOS and web had no release.",
      "If asked about the Android funnel after the platform split is known: app sessions on Android are flat week over week, but checkout conversion fell from about 12% to about 8.5%.",
      "If asked about checkout: payment failures on Android rose sharply, almost all on Google Pay.",
      "Restaurants and couriers are operating normally; delivery times are unchanged.",
    ],
    exhibits: [
      {
        id: "ex1",
        title: "Completed orders by platform",
        kind: "table",
        caption: "Completed orders, this week vs last week (Mon–Sun)",
        // Totals: 420,000 + 380,000 + 200,000 = 1,000,000; 416,000 + 268,000 + 196,000 = 880,000.
        // Changes: 416/420 − 1 = −0.95% → −1.0%; 268/380 − 1 = −29.5%; 196/200 − 1 = −2.0%; 880/1000 − 1 = −12.0%.
        columns: ["Platform", "Last week", "This week", "Change"],
        rows: [
          ["iOS", "420,000", "416,000", "−1.0%"],
          ["Android", "380,000", "268,000", "−29.5%"],
          ["Web", "200,000", "196,000", "−2.0%"],
          ["Total", "1,000,000", "880,000", "−12.0%"],
        ],
        revealWhen:
          "after the candidate asks to break the drop down by platform, device, app version, or any other segment (also acceptable if they ask for a breakdown generally)",
        keyInsight:
          "Almost the whole drop is Android (−112,000 of −120,000 orders); iOS and web are roughly flat, which points to an Android-specific internal cause (the 7.4 release) rather than demand or an external shock.",
      },
    ],
    strongAnswerNotes:
      "Clarifies the metric definition and timeframe and checks the data is real (tracking, definition, seasonality). Separates internal causes (release, experiment, outage, pricing) from external (competitor, holiday, weather). SEGMENTS — by platform, geography, new vs returning users, funnel stage — and on seeing the exhibit localizes the drop to Android, links it to the 7.4 release, walks the Android funnel to checkout, and finds the payment failure. Prioritizes the most likely hypothesis and proposes next steps: roll back or hotfix the payment flow, quantify lost orders (~110k/week), notify affected users, add release guardrail metrics. A candidate who never segments and instead lists generic causes should not be credited with diagnosis.",
    difficulty: "Intermediate",
    source: "Metric-drop (root-cause) question type from Meta 'analytical thinking/execution' rounds; method per Exponent's root-cause guide. Scenario and numbers are ours.",
  },
  {
    id: "pm-metrics-stories-dau-drop",
    family: "metrics-execution",
    frameworkKey: "metrics-execution",
    title: "Stories viewers down 6%",
    prompt:
      "Daily active viewers of the Stories feature in a large photo-sharing app are down 6% month over month. How would you figure out why?",
    interviewerFacts: [
      "The metric is daily users who view at least one story, averaged over the month. Definition and logging are unchanged.",
      "There was no app release that correlates with the start of the decline; it started about five weeks ago and has been gradual.",
      "Other features in the app (feed, messaging) are flat globally.",
      "If asked about creators: the number of people posting stories fell more than viewers did in the affected market — about 22%.",
      "If asked about competitors or external events after the region split is known: a short-video app launched in India about five weeks ago with an aggressive creator payout program.",
      "If asked about India specifically: data-plan prices have not changed; no outage was reported.",
    ],
    exhibits: [
      {
        id: "ex1",
        title: "Stories daily active viewers by region",
        kind: "table",
        caption: "Average daily active viewers, millions",
        // Totals: 12.0 + 14.0 + 16.0 + 8.0 = 50.0; 11.9 + 13.8 + 13.4 + 7.9 = 47.0.
        // Changes: 11.9/12 − 1 = −0.83% → −0.8%; 13.8/14 − 1 = −1.43% → −1.4%;
        // 13.4/16 − 1 = −16.25% → −16.3%; 7.9/8 − 1 = −1.25% → −1.3%; 47/50 − 1 = −6.0%.
        columns: ["Region", "Last month", "This month", "Change"],
        rows: [
          ["North America", 12.0, 11.9, "−0.8%"],
          ["Europe", 14.0, 13.8, "−1.4%"],
          ["India", 16.0, 13.4, "−16.3%"],
          ["Rest of world", 8.0, 7.9, "−1.3%"],
          ["Total", 50.0, 47.0, "−6.0%"],
        ],
        revealWhen:
          "after the candidate asks to break the drop down by region, country or geography (or asks for a segment breakdown generally)",
        keyInsight:
          "India accounts for 2.6M of the 3.0M lost viewers; elsewhere is roughly flat. A gradual, region-specific decline with no correlated release points to an external cause in that market, and creators falling faster than viewers suggests supply (creators) is leaving first.",
      },
    ],
    strongAnswerNotes:
      "Clarifies the metric and checks data validity and seasonality. Considers internal (release, ranking change, notification change) vs external (competitor, regulation, network) causes, notes the decline is gradual (favoring external/behavioral over a bug). SEGMENTS by region, platform, user age, creators vs viewers; on the exhibit localizes to India; asks about creators and competitors; hypothesizes creator migration to the new short-video app, reasoning that fewer creators means less to watch. Prioritizes and proposes how to confirm (cohort of lost creators, cross-app data, surveys) and responses (creator incentives, product parity), with tradeoffs such as payout cost. A candidate who lists causes without segmenting should not get diagnosis credit.",
    difficulty: "Advanced",
    source: "Engagement-drop question type reported for Meta/Instagram execution rounds (IGotAnOffer and Exponent Meta PM guides). Scenario and numbers are ours.",
  },
  {
    id: "pm-metrics-maps-success",
    family: "metrics-execution",
    frameworkKey: "metrics-execution",
    title: "Measuring success for Google Maps",
    prompt: "How would you measure the success of Google Maps?",
    interviewerFacts: [
      "Assume you're the head of product for Maps.",
      "If asked about the business goal: Maps makes money mainly through local-business ads and promoted places.",
      "Global scope.",
    ],
    strongAnswerNotes:
      "Clarifies the mission (help people navigate and explore the world) and business model. Maps user journeys (search a place → choose → navigate → arrive; or browse → discover → visit). Chooses one north-star tied to value delivered, e.g. successful trips or place visits completed, with reasons, plus supporting metrics across the funnel (searches with a selected result, navigation starts, completion, contributions) and counter-metrics (rerouting errors, ETA accuracy, ad load hurting trust). Discusses tradeoffs between ads revenue and result quality. Summarizes a compact metric set. The diagnose step is not applicable here.",
    difficulty: "Beginner",
    source: `Success-metrics question type (${CPI}; ${DAC} AARM); commonly reported in Google PM interviews (IGotAnOffer).`,
  },
  {
    id: "pm-metrics-save-for-later",
    family: "metrics-execution",
    frameworkKey: "metrics-execution",
    title: "Metrics for 'save for later'",
    prompt:
      "A grocery delivery app just launched a 'save for later' button on product pages. How would you decide if it's working?",
    interviewerFacts: [
      "It lets users park an item in a list without adding it to the cart.",
      "It launched to 50% of users as an A/B test two weeks ago.",
      "If asked about the goal: the team hoped it would raise orders per customer by reducing cart abandonment.",
      "If asked for early results: treatment users save about 3 items per week; cart size is flat; orders per customer are up about 1%, not yet statistically significant.",
    ],
    strongAnswerNotes:
      "Clarifies the feature's purpose and the business goal. Maps the user journey (browse → save → return → add to cart → checkout). Picks a primary metric tied to the goal (orders per customer or saved-item conversion to purchase) and supporting metrics (save rate, return visits to saved list), plus counter-metrics (cart size cannibalization, time to checkout, app performance). Interprets the early results carefully — not yet significant, needs duration and power. Weighs tradeoffs (feature could delay purchases). Ends with a decision rule for shipping. Diagnose step is not applicable.",
    difficulty: "Intermediate",
    source: "Feature-success / A/B-test readout question type (Meta and Amazon execution rounds per Exponent and IGotAnOffer guides). Scenario is ours.",
  },
];

// ---------------------------------------------------------------------------
// Estimation
// ---------------------------------------------------------------------------

const ESTIMATION: ProblemQuestion[] = [
  {
    id: "pm-estimate-gmail-storage",
    family: "estimation",
    frameworkKey: "estimation",
    title: "Gmail storage per day",
    prompt: "How much new storage does Gmail need every day?",
    interviewerFacts: [
      "New email storage only, worldwide, per day.",
      "If asked: Gmail has roughly 1.8 billion accounts.",
      "Ignore redundancy and backup copies unless you want to add them at the end.",
    ],
    strongAnswerNotes:
      "Clarifies unit (bytes of newly stored mail per day) and scope. Structures: active users × emails received per user per day × average stored size, segmenting by user type (personal vs business, heavy vs light) or by email type (text vs attachment, spam filtered). Reasonable inputs: ~1B daily active users, ~30–60 non-spam emails/day, average size dominated by attachments, ~50–100 KB. Arithmetic visible. Lands in the low single-digit petabytes per day (≈1–10 PB is reasonable), sanity-checks it (e.g. per user per year ≈ 1 GB, consistent with the free 15 GB quota lasting years), and names the most sensitive assumption (attachment size/share).",
    difficulty: "Intermediate",
    source: "Data-volume estimate reported for Google PM interviews (Glassdoor; IGotAnOffer Google PM guide). Benchmark is our arithmetic.",
  },
  {
    id: "pm-estimate-nyc-rides",
    family: "estimation",
    frameworkKey: "estimation",
    title: "Ride-hail trips in NYC on a Friday",
    prompt: "How many ride-hailing trips happen in New York City on a Friday?",
    interviewerFacts: [
      "All app-based ride-hailing companies combined, not taxis.",
      "The five boroughs, a typical Friday, midnight to midnight.",
      "If asked: New York City's population is about 8.3 million.",
    ],
    strongAnswerNotes:
      "Clarifies scope (all apps, five boroughs, one day). Structures by demand (residents + visitors × share who ride × trips per rider) or supply (drivers active × hours × trips per hour) and ideally cross-checks one against the other. Segments riders (commuters, nightlife, airport trips, visitors). States assumptions with rationale and lands in the high hundreds of thousands — NYC Taxi & Limousine Commission public data shows app-based (high-volume for-hire) trips around 600,000–800,000 per day in 2023–24, higher on Fridays. Within ~2x is a good estimate; process matters more than precision.",
    difficulty: "Beginner",
    source: "Ride-share estimate type reported for Uber/Lyft and Google PM interviews (Exponent). Benchmark from NYC TLC public trip data (nyc.gov/tlc).",
  },
  {
    id: "pm-estimate-youtube-hours",
    family: "estimation",
    frameworkKey: "estimation",
    title: "YouTube hours watched per day",
    prompt: "How many hours of video are watched on YouTube every day?",
    interviewerFacts: [
      "Worldwide, all devices including TV screens.",
      "If asked: about 8 billion people in the world; roughly 5 billion use the internet.",
      "Include Shorts.",
    ],
    strongAnswerNotes:
      "Clarifies scope (worldwide, all devices, per day). Structures internet users × share using YouTube daily × minutes per day, segmented by age group, region or device (mobile vs TV). States assumptions and computes visibly. A reasonable answer is on the order of a billion or more hours per day; YouTube publicly reported passing 1 billion hours watched daily in 2017, so an answer of ~1–2 billion is well-calibrated. Sanity-checks per capita (e.g. ~40 minutes per daily user) and names the most sensitive assumption.",
    difficulty: "Advanced",
    source: "Consumption estimate type (Google PM interviews per IGotAnOffer); benchmark from YouTube's 2017 public announcement of 1 billion hours/day.",
  },
];

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

const STRATEGY: ProblemQuestion[] = [
  {
    id: "pm-strategy-netflix-live-sports",
    family: "strategy",
    frameworkKey: "strategy",
    title: "Netflix and live sports",
    prompt: "Should Netflix get into live sports?",
    interviewerFacts: [
      "Assume you're advising Netflix's product leadership.",
      "If asked about the goal: Netflix wants subscriber growth and ad-tier revenue growth over three years.",
      "Major league broadcast rights cost billions of dollars per season and are usually locked up for many years.",
      "If asked: Netflix has run a handful of one-off live events and found live streaming at scale technically demanding.",
    ],
    strongAnswerNotes:
      "Clarifies the goal (growth, ad revenue, retention) and horizon. Assesses the market (sports viewers, cord-cutters, ad buyers) and Netflix's assets (global distribution, recommendation, brand, ad tier) vs competitors (Amazon, Apple, YouTube, broadcasters holding rights). Generates distinct options: full league rights, niche or emerging sports, one-off marquee events, sports-adjacent documentaries, partnering. Weighs cost, technical risk, rights lock-in, brand fit. Recommends a specific path (often a staged one) with first steps and success metrics (incremental subscribers, ad revenue per live hour, churn).",
    difficulty: "Intermediate",
    source: `Market-entry strategy prompt type (Bavaro & McDowell, Cracking the PM Career; ${CPI}). Prompt is ours.`,
  },
  {
    id: "pm-strategy-spotify-ticketing",
    family: "strategy",
    frameworkKey: "strategy",
    title: "Spotify and concert ticketing",
    prompt: "Should Spotify sell concert tickets?",
    interviewerFacts: [
      "Assume you advise Spotify's CEO.",
      "If asked about the goal: revenue diversification beyond subscriptions while deepening artist relationships.",
      "Spotify already shows concert listings that link out to ticket sellers.",
      "The incumbent ticketing company holds exclusive contracts with many large venues.",
    ],
    strongAnswerNotes:
      "Clarifies the goal and horizon. Assesses customers (fans, artists, venues, promoters) and the market structure (exclusive venue contracts, a dominant incumbent). Names Spotify's assets (listening data to identify true fans, artist tools, audience reach) and weaknesses (no venue relationships, ops and fraud experience). Options: build full ticketing, partner/affiliate (status quo plus), fan presale allocation for top listeners, acquire a smaller ticketing player, artist-direct sales for small venues. Weighs regulatory and reputational risk, margins, and incumbent response. Recommends a path with first steps and metrics.",
    difficulty: "Advanced",
    source: "Adjacent-market strategy prompt type (Exponent PM strategy questions; Cracking the PM Career). Prompt is ours.",
  },
  {
    id: "pm-strategy-airbnb-long-stays",
    family: "strategy",
    frameworkKey: "strategy",
    title: "Airbnb and year-long rentals",
    prompt: "Should Airbnb offer year-long rentals?",
    interviewerFacts: [
      "Airbnb already supports stays of 28+ nights.",
      "If asked about the goal: grow nights booked and reduce seasonality.",
      "Many cities restrict short-term rentals; long-term leases fall under different landlord-tenant laws.",
    ],
    strongAnswerNotes:
      "Clarifies goal and constraints. Assesses customers on both sides (remote workers, relocating professionals, students; landlords, property managers) and the market (traditional rental listing sites, brokers). Names Airbnb's strengths (trust and payments infrastructure, demand, reviews) and weaknesses (leases, tenant screening, legal exposure). Generates options (do nothing, extend mid-term stays to 3–6 months, full lease product, partner with property managers, specific segments like corporate relocation). Weighs regulatory risk, host-supply shifts, and brand. Recommends a path and a measurable first step.",
    difficulty: "Beginner",
    source: `Two-sided marketplace strategy prompt type (${CPI}; Exponent). Prompt is ours.`,
  },
];

export const PM_QUESTION_BANK: ProblemQuestion[] = [
  ...DESIGN,
  ...IMPROVEMENT,
  ...METRICS,
  ...ESTIMATION,
  ...STRATEGY,
];

export const PM_QUESTION_FAMILIES = [
  "product-design",
  "product-improvement",
  "metrics-execution",
  "estimation",
  "strategy",
] as const;

export function getPmQuestion(id: string): ProblemQuestion | null {
  return PM_QUESTION_BANK.find((q) => q.id === id) ?? null;
}
