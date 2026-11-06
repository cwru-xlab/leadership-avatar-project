/**
 * The consulting case bank.
 *
 * Every case is modeled on a public example (see each `source`) and
 * paraphrased — client names, figures and exhibits here are original, so no
 * copyrighted case text is reproduced. Business scenarios cover Vault's eight
 * scenario types as listed on the CWRU Career Center page (falling profits,
 * new product, new market, new geographic market, facility location, M&A,
 * competitive response, regulatory change).
 *
 * NUMBERS ARE CHECKED: `scripts/verify-case-interview-bank.ts` recomputes the
 * figures each `strongAnswerNotes` quotes from the exhibits and facts, so an
 * edit that breaks internal consistency fails loudly.
 *
 * Tolerance rule (orchestrator note 2026-11-06): every math-bearing case
 * states an explicit acceptable range in `strongAnswerNotes`, and the
 * evaluator grades `quantitative` against that tolerance, not exact match.
 *
 * `interviewerFacts` are released ONLY when asked. Exhibit `keyInsight` and
 * `strongAnswerNotes` are evaluator-only and never spoken.
 */

import type { ProblemQuestion } from "@/lib/problem-interview/types";

import { CASE_SOURCES } from "./sources";

export const CASE_FAMILIES = ["business-scenario", "guesstimate", "brainteaser"] as const;
export type CaseFamily = (typeof CASE_FAMILIES)[number];

/** Vault's scenario type for each business case, for coverage checks and the doc. */
export const VAULT_SCENARIO_TYPES = [
  "falling-profits",
  "new-product",
  "new-market",
  "new-geographic-market",
  "facility-location",
  "m-and-a",
  "competitive-response",
  "regulatory-change",
] as const;
export type VaultScenarioType = (typeof VAULT_SCENARIO_TYPES)[number];

// ---------------------------------------------------------------------------
// Business scenarios
// ---------------------------------------------------------------------------

const AIRLINE_CLE_NYC: ProblemQuestion = {
  id: "case-airline-cle-nyc",
  family: "business-scenario",
  frameworkKey: "case-business",
  title: "Cleveland–New York route",
  prompt:
    "Our client is Lakefront Air, a small regional airline based in Cleveland. They're considering adding a new route " +
    "between Cleveland and New York, and they've asked us whether they should do it. How would you approach this?",
  interviewerFacts: [
    "Lakefront flies 12 regional jets with 70 seats each to mid-sized Midwest cities; it has never served New York.",
    "The goal: the route must at least break even in its first full year; leadership will not subsidize it beyond that.",
    "The route would use 2 aircraft flying 3 round trips a day (6 one-way flights), 360 days a year, into LaGuardia.",
    "About 1.1 million one-way passengers fly Cleveland–New York each year across all carriers; the market has been flat for three years.",
    "Lakefront plans a one-way fare of $159 to undercut the two majors.",
    "Lakefront's network-wide average load factor is 70%; the US industry average is roughly 80–84%.",
    "If asked about competitor reaction: the two major carriers have historically matched new entrants' fares on their Cleveland routes within a few months.",
    "If asked about operating costs or fixed costs: point to the route economics exhibit rather than reciting numbers.",
  ],
  exhibits: [
    {
      id: "ex1",
      title: "Cleveland–New York market, last 12 months",
      kind: "table",
      caption: "One-way passengers, all New York-area airports. Total ≈ 1.1M.",
      columns: ["Carrier", "Share of passengers", "Average one-way fare"],
      rows: [
        ["Major carrier A", "48%", "$214"],
        ["Major carrier B", "37%", "$206"],
        ["Low-cost carrier C", "15%", "$129"],
      ],
      revealWhen: "after the candidate asks about the market, competitors, demand, or pricing",
      keyInsight:
        "Two majors hold 85% at ~$210 fares; a low-cost carrier already sits at $129, so Lakefront's $159 is neither the cheapest nor premium. Flat 1.1M-passenger market means share must be taken.",
    },
    {
      id: "ex2",
      title: "Proposed route economics",
      kind: "table",
      caption: "Lakefront estimates, first full year of operation.",
      columns: ["Item", "Value"],
      rows: [
        ["Seats per aircraft", 70],
        ["One-way flights per day", 6],
        ["Operating days per year", 360],
        ["Operating cost per one-way flight (fuel, crew, maintenance, landing fees)", "$8,400"],
        ["Fixed annual route cost (LaGuardia gates, launch marketing)", "$2.0M"],
        ["Planned one-way fare", "$159"],
      ],
      revealWhen: "after the candidate asks about costs, profitability, or break-even",
      keyInsight:
        "2,160 flights/yr × $8,400 = $18.1M variable + $2.0M fixed = $20.1M. Full-plane revenue per flight is 70 × $159 = $11,130, so break-even load factor ≈ 84% — above Lakefront's 70% and at the top of the industry range.",
    },
  ],
  strongAnswerNotes:
    "Benchmark: 6 × 360 = 2,160 one-way flights; total cost ≈ $20.1M ($18.14M operating + $2.0M fixed); revenue per full flight $11,130; " +
    "break-even load factor ≈ 84% (≈ 9,326 revenue per flight). At Lakefront's 70% load factor revenue ≈ $16.8M → loss ≈ $3.3M; even at 80% ≈ $19.2M → loss ≈ $0.9M. " +
    "At 70% it would carry ~106k passengers ≈ 10% of a flat 1.1M market. " +
    "TOLERANCE: a break-even load factor anywhere in 80–88%, or a year-one loss of roughly $2.5–4M at 70%, with correct method is strong; " +
    "concluding the route is profitable at $159 is a material error. " +
    "Recommendation: do not launch as planned; options are fewer frequencies, a higher fare aimed at business travelers, or a cheaper airport. " +
    "Risks: majors match fares; LaGuardia slot costs. Next steps: test demand at 2 round trips/day, negotiate gate costs.",
  difficulty: "Intermediate",
  source: `${CASE_SOURCES.cwru} — the Cleveland–New York airline route example; route economics original.`,
};

const RETAILER_FALLING_PROFITS: ProblemQuestion = {
  id: "case-retail-falling-profits",
  family: "business-scenario",
  frameworkKey: "case-business",
  title: "Outdoor retailer's falling profits",
  prompt:
    "Our client is Northpeak Outfitters, a US outdoor-apparel retailer with about 120 stores and a website. " +
    "Over the last two years its operating profit has fallen sharply even though sales have grown a little. The CEO wants to know why, and what to do about it.",
  interviewerFacts: [
    "Operating profit fell from $48M in FY2022 to $30M in FY2024.",
    "Revenue grew from $600M to $618M over the same period.",
    "The CEO wants profit back above $45M within two years.",
    "Competitors (other outdoor specialists) report roughly stable margins.",
    "Northpeak cut its free-shipping threshold from $99 to $0 in early FY2023 and offers free returns.",
    "Store count has been flat at 120; no major price changes in stores.",
  ],
  exhibits: [
    {
      id: "ex1",
      title: "Northpeak profit & loss",
      kind: "table",
      caption: "$M, fiscal years.",
      columns: ["Line", "FY2022", "FY2024"],
      rows: [
        ["Revenue", 600, 618],
        ["Cost of goods sold", 330, 346],
        ["Store labor", 90, 93],
        ["Store rent", 72, 76],
        ["E-commerce shipping & returns", 12, 30],
        ["Marketing", 48, 43],
        ["Operating profit", 48, 30],
      ],
      revealWhen: "after the candidate asks about revenue and costs, or lays out a profitability structure",
      keyInsight:
        "Revenue +$18M but costs +$36M. Biggest single driver is e-commerce shipping & returns +$18M (2.5×); COGS +$16M (gross margin 45.0% → 44.0%). Store costs and marketing roughly flat.",
    },
    {
      id: "ex2",
      title: "Sales by channel",
      kind: "table",
      caption: "Share of revenue and product return rate.",
      columns: ["Channel", "FY2022 share", "FY2024 share", "Return rate"],
      rows: [
        ["Stores", "90%", "75%", "8%"],
        ["E-commerce", "10%", "25%", "30%"],
      ],
      revealWhen: "after the candidate asks about channels, online sales, or why shipping costs rose",
      keyInsight:
        "E-commerce grew from $60M to ~$154.5M; shipping & returns run ~20% of online revenue in both years, so the cost spike is a MIX shift toward a structurally lower-margin channel, accelerated by free shipping.",
    },
  ],
  strongAnswerNotes:
    "Benchmark: profit −$18M = revenue +$18M minus costs +$36M; shipping & returns +$18M is the largest driver, COGS +$16M second (margin 45%→44%). " +
    "Online revenue $60M → $154.5M; shipping & returns ≈ 20% of online revenue both years → cost growth is channel mix, triggered by removing the free-shipping threshold. " +
    "TOLERANCE: identifying shipping/returns as the top driver with roughly correct deltas (±$2M) is strong; blaming marketing or store costs is a misread. " +
    "Recommendation: restore a free-shipping threshold, cut returns (fit guidance, return fee or store returns), push buy-online-pick-up-in-store; protect gross margin by reviewing discounting. " +
    "Risk: slowing online growth. Next steps: channel-level P&L, test threshold levels.",
  difficulty: "Beginner",
  source: `${CASE_SOURCES.bain} — modeled on the FashionCo. declining-performance case and the classic profitability case (${CASE_SOURCES.caseInterviewCom}); figures original.`,
};

const SPORTS_DRINK_LAUNCH: ProblemQuestion = {
  id: "case-sports-drink-launch",
  family: "business-scenario",
  frameworkKey: "case-business",
  title: "Sports drink launch",
  prompt:
    "Our client is a large US soft-drink company that has never sold sports drinks. Its R&D team has developed one, and the leadership team " +
    "wants our advice on whether to launch it nationally. What would you want to look at?",
  interviewerFacts: [
    "The client's objective: the product should earn at least $50M a year in contribution after marketing by year three.",
    "The client already has national distribution to grocery, convenience and big-box stores.",
    "The product would retail at $2.00 per bottle; the client nets $1.00 per bottle after retailer and distributor margins.",
    "Production cost (ingredients, bottling, freight) is $0.45 per bottle.",
    "Launch marketing would be $60M a year for the first three years.",
    "The client's internal target is a 5% share of the sports-drink market by year three.",
  ],
  exhibits: [
    {
      id: "ex1",
      title: "US sports-drink market",
      kind: "table",
      caption: "Retail sales value. Market ≈ $9B and growing about 6% a year.",
      columns: ["Brand", "Share of retail sales"],
      rows: [
        ["Market leader", "67%"],
        ["Number two", "22%"],
        ["All others", "11%"],
      ],
      revealWhen: "after the candidate asks about the market, competition, or size",
      keyInsight:
        "Two brands hold 89%; the entire long tail holds 11%, so a 5% share would make the client the clear #3 — ambitious for a new entrant.",
    },
  ],
  strongAnswerNotes:
    "Benchmark at 5% share: $9B × 5% = $450M retail = 225M bottles → $225M net revenue; contribution per bottle $0.55 → $123.75M gross contribution; minus $60M marketing ≈ $64M (meets the $50M goal). " +
    "Share needed to hit $50M after marketing: (50 + 60) / 0.55 = 200M bottles = $400M retail ≈ 4.4% share; break-even share ≈ 109M bottles ≈ $218M retail ≈ 2.4%. " +
    "TOLERANCE: contribution within ±15% of $64M, or a break-even/threshold share computed by a sound method, is strong. " +
    "Recommendation: launch is attractive only if ~4.5%+ share is credible; incumbents hold 89%, so de-risk with a regional test, differentiated positioning, and leverage existing distribution. " +
    "Risks: incumbents' promotional response, cannibalization of the client's own drinks. Next steps: consumer test, regional pilot.",
  difficulty: "Intermediate",
  source: `${CASE_SOURCES.mckinsey} — modeled on the Electro-Light / SuperSoda sports-drink launch practice case; figures original.`,
};

const HEAT_PUMP_ENTRY: ProblemQuestion = {
  id: "case-heat-pump-entry",
  family: "business-scenario",
  frameworkKey: "case-business",
  title: "Entering residential heat pumps",
  prompt:
    "Our client is a US home-appliance manufacturer best known for washers and refrigerators sold through big retailers. " +
    "They're considering entering the residential heat-pump market. Should they, and if so, how?",
  interviewerFacts: [
    "Objective: a new business that earns at least $50M operating profit a year by 2028 and pays back its investment within about three years.",
    "Building a heat-pump production line would cost about $150M up front.",
    "The client's average selling price to channel would be about $2,500 per unit, with a 20% operating margin once at scale.",
    "Management believes a 3% unit share is achievable by 2028.",
    "About 85% of residential heat pumps are bought through HVAC installers, not retail stores; the client has no installer relationships.",
    "Five incumbent HVAC brands hold roughly 80% of the market.",
  ],
  exhibits: [
    {
      id: "ex1",
      title: "US residential heat-pump shipments",
      kind: "bar",
      caption: "Millions of units per year (forecast from 2026).",
      columns: ["Year", "Units (M)"],
      rows: [
        ["2025", 4.0],
        ["2026", 4.5],
        ["2027", 5.0],
        ["2028", 5.6],
      ],
      revealWhen: "after the candidate asks about market size or growth",
      keyInsight: "Market grows ~12% a year to 5.6M units by 2028; 3% share = 168k units.",
    },
  ],
  strongAnswerNotes:
    "Benchmark: 5.6M × 3% = 168,000 units × $2,500 = $420M revenue × 20% = $84M operating profit in 2028 (meets $50M goal); $150M investment pays back in under 2 years at that run-rate. " +
    "TOLERANCE: profit within ±20% of $84M with sound method is strong. " +
    "Key insight: the economics work but the channel does not — 85% of sales go through installers the client lacks, while incumbents hold 80%. " +
    "Recommendation: enter, but via acquisition of or partnership with an installer-facing brand/distributor rather than building alone. " +
    "Risks: incumbent installer loyalty, service/warranty capability, policy-driven demand swings. Next steps: screen acquisition targets, installer interviews.",
  difficulty: "Advanced",
  source: `${CASE_SOURCES.bain} — modeled on market-entry practice cases linked from Bain's prep page; ${CASE_SOURCES.caseInterviewCom} business-situation framework. Figures original.`,
};

const COFFEE_SHOP: ProblemQuestion = {
  id: "case-campus-coffee-shop",
  family: "business-scenario",
  frameworkKey: "case-business",
  title: "Campus coffee shop",
  prompt:
    "A friend of yours wants to open a specialty coffee shop next to a large university campus and has asked for your advice on whether it's a good idea. How would you think about it?",
  interviewerFacts: [
    "Your friend wants the shop to at least break even within its first year and would like to earn a modest income from it after that.",
    "The average order is $4.50; ingredients and cups cost about $1.50 per order.",
    "Monthly fixed costs: rent $8,000, staff $14,000, utilities and other $3,000.",
    "About 6,000 students and staff walk past the location on a typical day.",
    "There are two other coffee options within a five-minute walk, including a national chain.",
    "Assume the shop is open 30 days a month.",
  ],
  exhibits: [
    {
      id: "ex1",
      title: "Capture rate at comparable campus cafés",
      kind: "table",
      caption: "Orders per day as a share of daily passers-by.",
      columns: ["Café", "Daily passers-by", "Orders per day", "Capture rate"],
      rows: [
        ["Café A (no nearby competitor)", 5000, 400, "8%"],
        ["Café B (one competitor)", 7000, 350, "5%"],
        ["Café C (two competitors)", 6000, 240, "4%"],
      ],
      revealWhen: "after the candidate asks how many customers to expect or about demand",
      keyInsight:
        "With two nearby competitors, comparable cafés capture ~4–5%, i.e. 240–300 orders a day at this location — straddling break-even (~278).",
    },
  ],
  strongAnswerNotes:
    "Benchmark: contribution $3.00/order; fixed $25,000/month → break-even 8,333 orders/month ≈ 278/day ≈ 4.6% of 6,000 passers-by. " +
    "At 5% capture (300/day) profit ≈ $2,000/month; at 4% (240/day) loss ≈ $3,400/month. " +
    "TOLERANCE: break-even within 260–300 orders/day is strong. " +
    "Recommendation: marginal — proceed only with a lower rent, a differentiated offer that can beat a 5% capture rate, or added revenue (food); otherwise look for another site. " +
    "Risks: summer/holiday traffic drop, chain competitor. Next steps: count foot traffic, negotiate rent.",
  difficulty: "Beginner",
  source: `${CASE_SOURCES.bain} — modeled on the Coffee Shop Co. practice case; figures original.`,
};

const DC_LOCATION: ProblemQuestion = {
  id: "case-distribution-center-site",
  family: "business-scenario",
  frameworkKey: "case-business",
  title: "Choosing a distribution-center site",
  prompt:
    "Our client makes orthopedic implants and ships them to hospitals across the US. It needs a new national distribution center and has narrowed the choice to " +
    "Columbus, Ohio, or Memphis, Tennessee. Which should it pick?",
  interviewerFacts: [
    "Objective: lowest total cost over ten years while meeting a next-day delivery promise to hospitals.",
    "Today 60% of hospital demand can be reached by next-day ground from Columbus, versus 72% from Memphis; the rest ships by air at a higher cost, already included in the outbound shipping line.",
    "Warehouse labor is tighter in Memphis — local vacancy rates for warehouse jobs are about twice Columbus's.",
    "Both sites are available within six months.",
  ],
  exhibits: [
    {
      id: "ex1",
      title: "Site comparison",
      kind: "table",
      caption: "$M. Annual figures are steady-state operating costs.",
      columns: ["Cost", "Columbus", "Memphis"],
      rows: [
        ["Labor (annual)", 14.0, 12.5],
        ["Lease (annual)", 3.2, 2.6],
        ["Outbound shipping (annual)", 9.0, 8.2],
        ["One-time build-out", 20, 24],
      ],
      revealWhen: "after the candidate asks about costs of the two sites",
      keyInsight:
        "Annual cost: Columbus $26.2M vs Memphis $23.3M → Memphis saves $2.9M/yr; it costs $4M more to build, so payback ≈ 1.4 years; over ten years Memphis is ≈ $25M cheaper.",
    },
  ],
  strongAnswerNotes:
    "Benchmark: annual cost Columbus 14.0+3.2+9.0 = $26.2M, Memphis 12.5+2.6+8.2 = $23.3M → $2.9M/yr savings; extra build-out $4M → payback ≈ 1.4 years; ten-year total ≈ $282M vs $257M (≈ $25M cheaper). " +
    "Memphis also reaches more hospitals next-day (72% vs 60%). " +
    "TOLERANCE: annual savings $2.5–3.3M and payback 1–2 years is strong. " +
    "Recommendation: Memphis, with a plan for the tighter labor market (wage premium, automation). Risks: labor availability, single-site concentration. Next steps: labor market study, negotiate incentives.",
  difficulty: "Beginner",
  source: `${CASE_SOURCES.vault} — facility site selection scenario type; figures original.`,
};

const CAR_WASH_ACQUISITION: ProblemQuestion = {
  id: "case-car-wash-acquisition",
  family: "business-scenario",
  frameworkKey: "case-business",
  title: "Car-wash chain acquisition",
  prompt:
    "Our client is a private-equity fund that already owns a national car-wash chain. It's been offered the chance to buy SparkleWay, a regional car-wash chain, " +
    "for $240 million. Should it do the deal?",
  interviewerFacts: [
    "The fund's objective: buy at a price that can be justified by the target's earnings plus realistic synergies, and exit in about five years.",
    "SparkleWay has 45 locations in the Southeast, a region where the client has few sites.",
    "If asked about synergies: combining chemical and equipment purchasing would save about $1.5M a year; moving SparkleWay customers onto the client's monthly-membership program would add about $6M of revenue at a 50% margin.",
    "The seller says two other bidders are interested.",
  ],
  exhibits: [
    {
      id: "ex1",
      title: "SparkleWay financials",
      kind: "table",
      caption: "$M.",
      columns: ["Year", "Revenue", "EBITDA", "EBITDA margin"],
      rows: [
        ["2023", 70, 16.8, "24.0%"],
        ["2024", 75, 18.4, "24.5%"],
        ["2025", 80, 20.0, "25.0%"],
      ],
      revealWhen: "after the candidate asks about the target's financial performance",
      keyInsight: "Steady ~7% revenue growth and expanding margins; $240M is 12.0× 2025 EBITDA of $20M.",
    },
    {
      id: "ex2",
      title: "Recent car-wash transactions",
      kind: "table",
      caption: "Enterprise value / trailing EBITDA.",
      columns: ["Deal", "Multiple"],
      rows: [
        ["Deal A", "9.5×"],
        ["Deal B", "10.2×"],
        ["Deal C", "10.8×"],
      ],
      revealWhen: "after the candidate asks about valuation, comparable deals, or what a fair price is",
      keyInsight: "Comparable multiples average ≈ 10.2×; at that multiple SparkleWay alone is worth ≈ $204M — the asking price is ~$36M above market.",
    },
  ],
  strongAnswerNotes:
    "Benchmark: $240M / $20M = 12.0× vs comparables ≈ 10.2× → standalone value ≈ $204M. Synergies: $1.5M + $6M × 50% = $4.5M → pro forma EBITDA $24.5M → $240M ≈ 9.8× pro forma. " +
    "TOLERANCE: multiples within ±0.5×, synergies ≈ $4–5M, standalone value $190–215M are strong. " +
    "Key insight: the price only works if the client pays away nearly all synergies to the seller. " +
    "Recommendation: pursue but bid ~$205–220M or use an earn-out tied to membership conversion; walk away above ~$240M. " +
    "Risks: membership conversion slower than planned, integration, competitive bidding. Next steps: diligence on site-level economics and membership uptake.",
  difficulty: "Advanced",
  source: `${CASE_SOURCES.vault} — mergers & acquisitions scenario type; ${CASE_SOURCES.caseInterviewCom} M&A framework. Figures original.`,
};

const GROCERY_DISCOUNTER: ProblemQuestion = {
  id: "case-grocery-discounter-response",
  family: "business-scenario",
  frameworkKey: "case-business",
  title: "Responding to a discount grocer",
  prompt:
    "Our client, Harbor Market, is a regional supermarket chain with 60 stores and about $3 billion in annual sales. " +
    "A no-frills discount grocer is opening 15 stores in Harbor's region with prices about 20% lower. How should Harbor respond?",
  interviewerFacts: [
    "Objective: protect Harbor's total gross profit over the next three years; the board will not accept a plan that cuts gross profit by more than 5%.",
    "15 of Harbor's 60 stores are within a ten-minute drive of a planned discounter location.",
    "Harbor's sales mix: dry grocery and household 50%, fresh produce/meat/bakery 35%, prepared foods 15%.",
    "The discounter carries ~1,500 items vs Harbor's ~30,000; it has a very small fresh and prepared-food offer.",
    "Harbor's loyalty program covers about 60% of its sales.",
  ],
  exhibits: [
    {
      id: "ex1",
      title: "Early results where the discounter already opened",
      kind: "table",
      caption: "Same-store sales change, Harbor stores near three pilot discounter openings vs all other Harbor stores.",
      columns: ["Category", "Near discounter", "Elsewhere"],
      rows: [
        ["Dry grocery & household", "−14%", "−1%"],
        ["Fresh produce/meat/bakery", "−2%", "0%"],
        ["Prepared foods", "+3%", "+1%"],
        ["Total", "−8%", "−1%"],
      ],
      revealWhen: "after the candidate asks how customers or sales are responding, or which categories are at risk",
      keyInsight: "Losses are concentrated in dry grocery; fresh is nearly untouched and prepared foods grow — the discounter competes on packaged staples, not on fresh.",
    },
    {
      id: "ex2",
      title: "Harbor gross margin by category",
      kind: "table",
      caption: "Gross margin as % of category sales.",
      columns: ["Category", "Share of sales", "Gross margin"],
      rows: [
        ["Dry grocery & household", "50%", "22%"],
        ["Fresh produce/meat/bakery", "35%", "34%"],
        ["Prepared foods", "15%", "45%"],
      ],
      revealWhen: "after the candidate asks about margins or the cost of cutting prices",
      keyInsight:
        "Gross profit ≈ $330M (dry) + $357M (fresh) + $202.5M (prepared) ≈ $890M. Matching a 20% price cut across dry grocery would cost ≈ $300M — almost all of dry grocery's profit and ~34% of total gross profit.",
    },
  ],
  strongAnswerNotes:
    "Benchmark: dry grocery sales $1.5B; a 20% cut ≈ $300M ≈ 34% of total gross profit (~$890M) — far beyond the 5% limit. " +
    "Exposure: 15/60 stores ≈ $750M of sales; −8% there ≈ $60M of sales at risk. " +
    "TOLERANCE: total gross profit $850–930M and price-match cost $270–330M are strong; any method showing across-the-board matching is unaffordable earns credit. " +
    "Recommendation: do not match across the board; sharpen prices on a small set of key value items via loyalty, and double down on fresh and prepared foods where the discounter is weak. " +
    "Risks: discounter expands fresh; traffic loss erodes fresh sales too. Next steps: identify key value items, model loyalty-targeted offers.",
  difficulty: "Advanced",
  source: `${CASE_SOURCES.vault} — competitive response scenario type; ${CASE_SOURCES.oliverWyman} practice-case themes (grocery). Figures original.`,
};

const SODA_TAX: ProblemQuestion = {
  id: "case-beverage-tax",
  family: "business-scenario",
  frameworkKey: "case-business",
  title: "City beverage tax",
  prompt:
    "Our client is a regional soft-drink bottler. The largest city it serves has just passed a tax on sugar-sweetened drinks that starts in six months. " +
    "The client wants to know how it will be hit and what it should do.",
  interviewerFacts: [
    "The tax is 1.5 cents per ounce on sugar-sweetened drinks; zero-sugar drinks are exempt.",
    "In the city the client sells 30M regular and 10M zero-sugar 12-ounce cans a year, at about $1.00 a can.",
    "The client earns $0.30 per regular can and $0.32 per zero-sugar can.",
    "Industry studies suggest price elasticity of about −1.3 for regular soft drinks in this kind of market.",
    "If asked: about 30% of drinkers who give up a regular soda switch to a zero-sugar soda; the rest drop out of the category or buy outside the city.",
    "The client's objective: limit the hit to its city profit, currently about $12.2M a year.",
  ],
  exhibits: [
    {
      id: "ex1",
      title: "Two pricing options for regular soda",
      kind: "table",
      caption: "Per 12-ounce can, before any volume change.",
      columns: ["Option", "Shelf price", "Client profit per can"],
      rows: [
        ["Pass the tax through to shoppers", "$1.18", "$0.30"],
        ["Absorb the tax", "$1.00", "$0.12"],
      ],
      revealWhen: "after the candidate asks about pricing or how the tax reaches consumers",
      keyInsight:
        "Tax = 12 oz × 1.5¢ = 18¢. Passing through raises price 18% → volume −23.4% at −1.3 elasticity → regular profit $9.0M → $6.9M. Absorbing keeps volume but drops profit to $3.6M. Pass-through is better.",
    },
  ],
  strongAnswerNotes:
    "Benchmark: tax 18¢/can; pass-through → regular volume 30M × (1 − 0.234) ≈ 22.98M cans × $0.30 ≈ $6.89M (−$2.1M); absorbing → 30M × $0.12 = $3.6M (−$5.4M). " +
    "Switchers: 7.02M lost cans × 30% ≈ 2.1M zero-sugar cans × $0.32 ≈ +$0.67M → net hit ≈ −$1.4M on ~$12.2M (≈ −12%). " +
    "TOLERANCE: pass-through loss $1.8–2.5M and choosing pass-through over absorbing is strong. " +
    "Recommendation: pass the tax through, push zero-sugar (exempt) and smaller pack sizes, adjust promotions. Risks: cross-border shopping, retailer pushback, tax spreading to other cities. Next steps: pack-size pricing tests.",
  difficulty: "Intermediate",
  source: `${CASE_SOURCES.vault} — regulatory change scenario type; figures original.`,
};

// ---------------------------------------------------------------------------
// Guesstimates
// ---------------------------------------------------------------------------

const HAIR_GEL_OHIO: ProblemQuestion = {
  id: "estimate-hair-gel-ohio",
  family: "guesstimate",
  frameworkKey: "case-guesstimate",
  title: "Hair gel spend in Ohio",
  prompt: "How much do people in Ohio spend on hair gel in a year?",
  interviewerFacts: [
    "Scope if asked: retail spending by consumers, hair gel specifically (not all styling products), one year.",
    "If asked: Ohio has about 11.8 million people. Accept any reasonable assumption the candidate states for usage or price.",
  ],
  strongAnswerNotes:
    "Benchmark ≈ $40M/year. Example path: 11.8M people; ~3.5M men aged 15–64, ~25% use gel → ~0.9M; ~5% of ~6M women → ~0.3M; ~1.2M users × ~6 tubes/yr × ~$6 ≈ $43M. " +
    "Sanity check: ≈ $3.60 per Ohioan per year; Ohio is ~3.5% of the US. " +
    "TOLERANCE: anything $20–80M with stated, realistic assumptions is strong; within 3× ($13–130M) with sound method is acceptable; more than 3× off with no sanity check is weak.",
  difficulty: "Beginner",
  source: `${CASE_SOURCES.cwru} — the hair-gel-in-Ohio guesstimate example; modernized.`,
};

const PICKLEBALL_PADDLES: ProblemQuestion = {
  id: "estimate-pickleball-paddles",
  family: "guesstimate",
  frameworkKey: "case-guesstimate",
  title: "US pickleball paddle market",
  prompt: "Estimate how much Americans spend on pickleball paddles in a year.",
  interviewerFacts: [
    "Scope if asked: US retail spending on paddles only (not balls, courts, apparel), this year.",
    "If asked how many people play: industry surveys put US players at roughly 14 million, about 30% of them playing regularly.",
  ],
  strongAnswerNotes:
    "Benchmark ≈ $350M/year. Example path: 14M players; 30% core (4.2M) replace a ~$80 paddle every 1.5 years → 2.8M paddles ≈ $224M; " +
    "9.8M casual replace a ~$40 paddle every 3 years → ~3.3M ≈ $131M; total ≈ $355M. " +
    "TOLERANCE: $200–550M with stated, realistic assumptions is strong; within 3× ($120M–1.05B) acceptable; more than 3× off with no sanity check is weak.",
  difficulty: "Intermediate",
  source: `${CASE_SOURCES.cwru} — guesstimate type ("how many / how much"), modern consumer topic; ${CASE_SOURCES.caseInterviewCom} market-sizing approach.`,
};

const US_SMARTPHONES: ProblemQuestion = {
  id: "estimate-us-smartphones",
  family: "guesstimate",
  frameworkKey: "case-guesstimate",
  title: "Smartphones sold in the US",
  prompt: "How many smartphones are sold in the United States each year?",
  interviewerFacts: [
    "Scope if asked: new smartphones sold to US consumers and businesses in a year; refurbished devices don't count.",
    "If asked: the US population is about 335 million.",
  ],
  strongAnswerNotes:
    "Benchmark ≈ 120M units/year (industry shipments run roughly 120–140M). Example path: ~335M people; ~85% own one (~285M); replaced every ~2.5–3 years → ~95–115M; plus business/second devices ~10–15M → ~110–130M. " +
    "TOLERANCE: 80–180M with stated assumptions is strong; within 3× (40–360M) acceptable; further off with no sanity check is weak.",
  difficulty: "Beginner",
  source: `${CASE_SOURCES.cwru} — modernizes the "how many CDs were sold in the US last year" example.`,
};

const DRIVE_THRU_KIOSK: ProblemQuestion = {
  id: "estimate-drive-thru-coffee-revenue",
  family: "guesstimate",
  frameworkKey: "case-guesstimate",
  title: "Drive-thru coffee kiosk revenue",
  prompt: "Estimate the annual revenue of a single drive-thru coffee kiosk on a busy suburban road.",
  interviewerFacts: [
    "Scope if asked: one kiosk, drive-thru only, no seating; open 5:30 a.m. to 7 p.m., every day.",
    "If asked: it has one drive-thru lane and one service window, and a typical order takes about a minute at the window at peak.",
  ],
  strongAnswerNotes:
    "Benchmark ≈ $1.0M/year. Example path: peak 3 hours at ~1 car/min = 180 cars; 10.5 off-peak hours at ~1 car/4 min ≈ 160 cars; ~340 cars × ~1.3 drinks × ~$6 ≈ $2,650/day × 360 ≈ $0.95M. " +
    "Sanity check: well-run drive-thru coffee chains report average unit volumes of roughly $1–2M. " +
    "TOLERANCE: $0.5M–2.0M is strong; within 3× acceptable; a capacity-blind estimate (e.g. more cars than one window can serve) is weak.",
  difficulty: "Intermediate",
  source: `${CASE_SOURCES.cwru} — guesstimate type; capacity-constrained estimation as in ${CASE_SOURCES.caseInterviewCom}.`,
};

// ---------------------------------------------------------------------------
// Brainteasers
// ---------------------------------------------------------------------------

const MANHOLE_COVERS: ProblemQuestion = {
  id: "teaser-manhole-covers",
  family: "brainteaser",
  frameworkKey: "case-brainteaser",
  title: "Round manhole covers",
  prompt: "Why are manhole covers round?",
  interviewerFacts: [
    "If asked: think of a typical city street cover, heavy cast iron.",
    "Accept any well-reasoned explanation; push gently for more than one reason.",
  ],
  strongAnswerNotes:
    "Strong answers give several reasons and test them: a circle cannot fall through its own opening (a square or rectangle can, along the diagonal); " +
    "no orientation needed to drop it back in; heavy covers can be rolled; round shafts are easy to dig and resist pressure; easy to manufacture. " +
    "Checking an alternative (e.g. why a square fails) or noting other constant-width shapes would also work is the 'check' step.",
  difficulty: "Beginner",
  source: `${CASE_SOURCES.cwru} — brainteaser example.`,
};

const CLOCK_HANDS: ProblemQuestion = {
  id: "teaser-clock-hands",
  family: "brainteaser",
  frameworkKey: "case-brainteaser",
  title: "Clock hands overlapping",
  prompt: "How many times a day do the hour and minute hands of a clock overlap?",
  interviewerFacts: [
    "If asked: a standard 12-hour analog clock; a day is 24 hours; count midnight once.",
  ],
  strongAnswerNotes:
    "Answer: 22. The minute hand gains 330°/hour on the hour hand, so they meet every 12/11 h ≈ 65.45 min → 11 times in 12 hours → 22 in 24 hours. " +
    "Common mistake: 24 (once per hour); a good check notices there's no overlap between 11 and 1 other than at 12.",
  difficulty: "Intermediate",
  source: `${CASE_SOURCES.cwru} — brainteaser type (logical puzzle); classic puzzle.`,
};

const WATER_JUGS: ProblemQuestion = {
  id: "teaser-water-jugs",
  family: "brainteaser",
  frameworkKey: "case-brainteaser",
  title: "Measuring four gallons",
  prompt: "You have a 3-gallon jug, a 5-gallon jug, and a tap. How do you measure exactly 4 gallons?",
  interviewerFacts: [
    "If asked: the jugs have no markings; you can fill, empty, and pour between them as often as you like.",
  ],
  strongAnswerNotes:
    "One solution: fill 5, pour into 3 (leaves 2 in the 5), empty 3, pour the 2 into 3, fill 5, top up 3 (uses 1) → 4 left in the 5. " +
    "Alternative: fill 3 into 5 twice (5 holds 5 after the second pour leaves 1 in the 3), empty 5, pour the 1 in, add 3 → 4. A good check walks back through the states.",
  difficulty: "Beginner",
  source: `${CASE_SOURCES.cwru} — brainteaser type (logical puzzle); classic puzzle.`,
};

export const CASE_BANK: ProblemQuestion[] = [
  AIRLINE_CLE_NYC,
  RETAILER_FALLING_PROFITS,
  SPORTS_DRINK_LAUNCH,
  HEAT_PUMP_ENTRY,
  COFFEE_SHOP,
  DC_LOCATION,
  CAR_WASH_ACQUISITION,
  GROCERY_DISCOUNTER,
  SODA_TAX,
  HAIR_GEL_OHIO,
  PICKLEBALL_PADDLES,
  US_SMARTPHONES,
  DRIVE_THRU_KIOSK,
  MANHOLE_COVERS,
  CLOCK_HANDS,
  WATER_JUGS,
];

/** Vault scenario type per business case (coverage evidence for the doc). */
export const CASE_VAULT_TYPE: Record<string, VaultScenarioType> = {
  [AIRLINE_CLE_NYC.id]: "new-geographic-market",
  [RETAILER_FALLING_PROFITS.id]: "falling-profits",
  [SPORTS_DRINK_LAUNCH.id]: "new-product",
  [HEAT_PUMP_ENTRY.id]: "new-market",
  [COFFEE_SHOP.id]: "new-market",
  [DC_LOCATION.id]: "facility-location",
  [CAR_WASH_ACQUISITION.id]: "m-and-a",
  [GROCERY_DISCOUNTER.id]: "competitive-response",
  [SODA_TAX.id]: "regulatory-change",
};

export function getCase(id: string): ProblemQuestion | null {
  return CASE_BANK.find((q) => q.id === id) ?? null;
}
