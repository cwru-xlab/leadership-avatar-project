/**
 * Golden transcripts: Cleveland–New York route (case-airline-cle-nyc).
 * The strong run follows the shape of the firms' published good-answer
 * walk-throughs (McKinsey/Bain practice cases): play back the question,
 * clarify the objective, structure, prioritize with a hypothesis, request and
 * read data, do the math aloud with a sanity check, recommend answer-first.
 */

import type { GoldenTranscript, GoldenTurn } from "./types";

const PROMPT =
  "Let's move to the case. Our client is Lakefront Air, a small regional airline based in Cleveland. They're considering adding a new route between Cleveland and New York, and they've asked us whether they should do it. How would you approach this?";

function fitOpening(answer: string): GoldenTurn[] {
  return [
    {
      role: "assistant",
      t: 0,
      content:
        "Hi, thanks for coming in today. We'll start with a quick question about you, spend most of our time on a case, and leave a few minutes at the end for your questions. So to start, why consulting?",
    },
    { role: "user", t: 14, content: answer },
    { role: "assistant", t: 95, content: `Thanks, that's helpful. ${PROMPT}` },
  ];
}

const CLOSE: GoldenTurn[] = [
  { role: "assistant", t: 900, content: "Okay, let's stop the case there. What questions do you have for me?" },
  {
    role: "user",
    t: 910,
    content:
      "I'd love to know how first-year associates get staffed — do you get to choose industries early on, or is it more of a generalist model?",
  },
  {
    role: "assistant",
    t: 930,
    content:
      "Mostly generalist for the first year or two, and then people tend to specialize. Thanks for your time today — you'll hear from the recruiting team soon.",
  },
];

const STRONG_FIT =
  "Two reasons. First, I like being dropped into an unfamiliar problem and having to make sense of it quickly. Last spring I led a four-person team for the Cleveland Food Bank on volunteer no-shows — we interviewed twelve shift leads, found that most no-shows came from people who signed up more than three weeks ahead, and moved to a two-week signup window with text reminders. No-shows fell about thirty percent over the next two months. Second, I want to learn from people who are better than me at this, and consulting gives me a lot of that in a short time.";

export const AIRLINE_STRONG: GoldenTranscript = {
  id: "airline-strong",
  caseId: "case-airline-cle-nyc",
  variant: "strong",
  nudgesIssued: [],
  turns: [
    ...fitOpening(STRONG_FIT),
    {
      role: "user",
      t: 120,
      content:
        "Let me make sure I have it. Lakefront is a small regional carrier based in Cleveland, and they're deciding whether to add a Cleveland to New York route — so the question is whether the route makes sense for them. Is that right? Before I structure anything, what's their objective here — is it profit on the route itself, or something more strategic like feeding their other routes? And over what time frame?",
    },
    {
      role: "assistant",
      t: 150,
      content: "Right. They need the route to at least break even in its first full year. Leadership won't subsidize it beyond that.",
    },
    {
      role: "user",
      t: 162,
      content:
        "Got it, break-even in year one. A couple more: what does Lakefront fly today — fleet size, and have they served New York before? And who else flies the route?",
    },
    {
      role: "assistant",
      t: 178,
      content:
        "They fly twelve regional jets with seventy seats each to mid-sized Midwest cities, and they've never served New York. On the competition, here's what we have on the market — take a look.",
    },
    {
      role: "user",
      t: 196,
      content:
        "Okay. Two major carriers have eighty-five percent of passengers between them, at around two hundred ten dollars one way, and a low-cost carrier has fifteen percent at a hundred twenty-nine. So the route is dominated by the majors and there's already a cheap option. Is the market growing?",
    },
    { role: "assistant", t: 214, content: "It's about 1.1 million one-way passengers a year, and it's been flat for three years." },
    {
      role: "user",
      t: 226,
      content:
        "Flat, so any passengers we get, we take from someone. Let me take thirty seconds to structure this. ... Okay. I'd look at it in three buckets. First, revenue: how many passengers we can win times the fare, which depends on demand and on what competitors charge. Second, costs: the operating cost of each flight plus any fixed cost of launching in New York, like gates and marketing. Third, risks and feasibility: how the majors respond, and whether we have the aircraft. Since the goal is break-even in year one, my hypothesis is that the deciding question is whether we can fill enough seats at our fare to cover costs. So I'd start by computing the break-even load factor, then test whether it's achievable against the market. Does that work?",
    },
    { role: "assistant", t: 290, content: "Sure. What would you like to know?" },
    { role: "user", t: 298, content: "What fare and schedule are they planning, and what do the flights cost to operate?" },
    { role: "assistant", t: 312, content: "Here are their route economics." },
    {
      role: "user",
      t: 330,
      content:
        "So six one-way flights a day times 360 days is 2,160 flights a year. Operating cost: 2,160 times 8,400 — 2,000 times 8,400 is 16.8 million, plus 160 times 8,400 is about 1.34 million, so about 18.1 million. Add the 2 million fixed and total cost is about 20.1 million. Revenue on a full flight is seventy seats times 159, which is 11,130 dollars. Per flight we need 20.1 million over 2,160 flights, about 9,330 dollars. 9,330 over 11,130 is about eighty-four percent. So Lakefront has to fill about eighty-four percent of its seats just to break even. What load factor do they usually get?",
    },
    { role: "assistant", t: 404, content: "About seventy percent across their network. The industry average is roughly eighty to eighty-four." },
    {
      role: "user",
      t: 414,
      content:
        "That's the crux. They need eighty-four, they run seventy, and even the industry average barely reaches break-even. At seventy percent a flight carries forty-nine passengers, about 7,800 dollars of revenue, times 2,160 is about 16.8 million — so a loss of roughly 3.3 million in year one. Sanity check on demand: forty-nine passengers on 2,160 flights is about 106,000 passengers, roughly ten percent of a flat 1.1 million market. That's a lot to take from the majors as a newcomer, so even seventy percent may be optimistic. Do we know how the majors react to new entrants?",
    },
    { role: "assistant", t: 472, content: "They've historically matched new entrants' fares on their Cleveland routes within a few months." },
    {
      role: "user",
      t: 482,
      content:
        "Then the price advantage disappears quickly too. Let me pull this together. My recommendation is that Lakefront should not launch the route as currently planned. Three reasons: it needs an eighty-four percent load factor to break even against a seventy percent network average, which means a loss of around three million dollars in year one; it would need about ten percent of a flat market; and the majors are likely to match the fare within months. If they still want New York, I'd look at two round trips a day instead of three, pricing for business travelers rather than undercutting, or a cheaper airport like Newark. The main risk of saying no is that a competitor takes the opportunity first. As next steps, I'd model the reduced schedule and get firm gate quotes before revisiting.",
    },
    ...CLOSE,
  ],
  expect: { processRigorMin: 4, allHit: true, quantitativeMin: 4, synthesisMin: 4 },
};

export const AIRLINE_JUMP: GoldenTranscript = {
  id: "airline-jump",
  caseId: "case-airline-cle-nyc",
  variant: "jump",
  nudgesIssued: [
    { stepKey: "structure", atSeconds: 140 },
    { stepKey: "clarify_objective", atSeconds: 175 },
  ],
  turns: [
    ...fitOpening(
      "I think consulting is a great way to learn about a lot of industries fast, and I like solving problems. I've done a lot of group projects in my classes and I usually end up organizing them.",
    ),
    {
      role: "user",
      t: 118,
      content:
        "I think they should do it. New York is a huge market with tons of business travelers from Cleveland, and a smaller airline can offer a lower fare and pull people away from the big airlines. They already have planes, so it should be pretty easy for them.",
    },
    { role: "assistant", t: 140, content: "Okay. How are you thinking about tackling this?" },
    {
      role: "user",
      t: 148,
      content: "I'd mainly just look at whether people want to fly it, and they definitely do, New York is one of the busiest routes anywhere.",
    },
    { role: "assistant", t: 175, content: "Is there anything you'd want to know about the client before you get going?" },
    { role: "user", t: 182, content: "Not really, I think the logic holds. Maybe what fare are they charging?" },
    { role: "assistant", t: 192, content: "They plan a one-way fare of 159 dollars." },
    {
      role: "user",
      t: 200,
      content: "That's cheaper than the big airlines, so they'd fill their planes and make money. So yes, I'd add the route.",
    },
    { role: "assistant", t: 214, content: "If the CEO walked in right now, what would you tell her?" },
    { role: "user", t: 220, content: "Launch it. It's a big market and they'd be cheaper." },
    ...CLOSE.map((t) => ({ ...t, t: t.t - 600 })),
  ],
  expect: {
    processRigorMax: 2,
    synthesisMax: 3,
    steps: { clarify_objective: ["missed"], structure: ["missed"], analyze_data: ["missed"] },
  },
};

export const AIRLINE_BOTCH: GoldenTranscript = {
  id: "airline-botch",
  caseId: "case-airline-cle-nyc",
  variant: "botch",
  nudgesIssued: [],
  turns: [
    ...fitOpening(STRONG_FIT),
    {
      role: "user",
      t: 120,
      content:
        "So Lakefront, a small Cleveland airline, wants to know whether to add a Cleveland–New York route — is that the question? And what's their goal, profit on the route or something broader? Over what time frame?",
    },
    { role: "assistant", t: 140, content: "That's the question. They need the route to at least break even in its first full year." },
    {
      role: "user",
      t: 150,
      content: "Okay. And what do they fly today, and who are the competitors on the route?",
    },
    {
      role: "assistant",
      t: 162,
      content:
        "Twelve regional jets with seventy seats, mid-sized Midwest cities, never New York. On competitors, here's what we have on the market.",
    },
    {
      role: "user",
      t: 180,
      content:
        "So the two majors have eighty-five percent at around two hundred ten dollars, and a low-cost carrier has fifteen percent. Let me structure it: I'd look at revenue — passengers times fare; costs — per-flight operating costs and fixed launch costs; and then risks like competitor response. Because the goal is break-even, I want to start with costs versus revenue per flight, since that tells us how full the planes need to be.",
    },
    { role: "assistant", t: 236, content: "Okay. Here are their route economics." },
    {
      role: "user",
      t: 252,
      content:
        "Six flights a day for 360 days is 2,160 flights. 2,160 times 8,400 is about 1.8 million in operating cost, plus 2 million fixed, so around 3.8 million total. A full flight brings in seventy times 159, about 11,000 dollars, so a full year at full planes is around 24 million. So they'd only need to fill about sixteen percent of seats to break even. That's very achievable.",
    },
    { role: "assistant", t: 318, content: "Can you walk me through how you got there?" },
    {
      role: "user",
      t: 326,
      content:
        "Sure, 2,160 times 8,400 is roughly 1.8 million, plus the 2 million fixed — so costs are small compared to the revenue. The planes don't need to be very full.",
    },
    { role: "assistant", t: 350, content: "Okay. What else would you look at?" },
    {
      role: "user",
      t: 358,
      content:
        "On the marketing side I'd think about a loyalty program, maybe partnerships with Cleveland companies for business travel, and advertising at the airport. They could also bundle hotels in New York. There's also the question of which New York airport — LaGuardia is closer to Manhattan but busier. And the majors could react somehow, which is worth thinking about. There are a lot of moving pieces with an airline.",
    },
    ...CLOSE.map((t) => ({ ...t, t: t.t - 450 })),
  ],
  expect: {
    quantitativeMax: 2,
    // The candidate does conclude "very achievable" off the wrong math, so a
    // 3 ("buried/hedged") is defensible; the synthesize STEP must be missed.
    synthesisMax: 3,
    steps: { structure: ["hit"], analyze_data: ["missed"], synthesize: ["missed"] },
  },
};

export const AIRLINE_NUDGED: GoldenTranscript = {
  id: "airline-nudged",
  caseId: "case-airline-cle-nyc",
  variant: "nudged",
  nudgesIssued: [
    { stepKey: "structure", atSeconds: 186 },
    { stepKey: "hypothesis_prioritize", atSeconds: 262 },
    { stepKey: "synthesize", atSeconds: 470 },
  ],
  turns: [
    ...fitOpening(STRONG_FIT),
    {
      role: "user",
      t: 120,
      content:
        "Okay, so a small Cleveland airline is deciding whether to add a route to New York, and we need to tell them if it's worth it — is that right? What's the objective — profit on the route, and over what time frame?",
    },
    { role: "assistant", t: 140, content: "Right. They need it to at least break even in the first full year." },
    { role: "user", t: 150, content: "And who flies it today, and what does Lakefront's fleet look like?" },
    {
      role: "assistant",
      t: 160,
      content: "Twelve regional jets, seventy seats each, never served New York. Here's what we have on the market.",
    },
    {
      role: "user",
      t: 172,
      content: "Two majors with eighty-five percent at about two-ten, and a low-cost carrier at one twenty-nine. What fare is Lakefront planning?",
    },
    { role: "assistant", t: 186, content: "Before we get into that — how are you thinking about tackling this overall?" },
    {
      role: "user",
      t: 194,
      content:
        "Right, fair. I'd break it into revenue — passengers times fare; costs — operating cost per flight plus fixed costs of opening in New York; and risks — competitor response and whether they have the capacity. Then I'd go through revenue, then costs, then risks.",
    },
    { role: "assistant", t: 262, content: "Where would you start, and why there?" },
    {
      role: "user",
      t: 270,
      content:
        "I'd start with costs against revenue per flight, because the goal is break-even, so the question is how full the planes need to be. Could I see the cost data?",
    },
    { role: "assistant", t: 290, content: "Here are their route economics." },
    {
      role: "user",
      t: 306,
      content:
        "Six a day times 360 is 2,160 flights. Times 8,400 is about 18.1 million, plus 2 million fixed is 20.1 million. A full flight is seventy times 159, 11,130 dollars. 20.1 million over 2,160 is about 9,300 per flight, so about eighty-four percent load factor to break even. What's their usual load factor?",
    },
    { role: "assistant", t: 380, content: "About seventy percent across their network; the industry runs roughly eighty to eighty-four." },
    {
      role: "user",
      t: 390,
      content:
        "So they're well short — at seventy percent revenue is about 16.8 million against 20.1 million of cost, a loss of around 3.3 million. And seventy percent would already be around ten percent of a flat market. I guess there are other things too, like how the majors respond, and the airport choice, and whether they could use the planes better elsewhere.",
    },
    { role: "assistant", t: 470, content: "If the CEO walked in right now, what would you tell her?" },
    {
      role: "user",
      t: 478,
      content:
        "I'd tell her not to launch the route as planned. It needs eighty-four percent of seats filled to break even, Lakefront runs seventy, so they'd lose about three million in year one, and they'd need to take ten percent of a flat market from the majors. If they want New York, test a smaller schedule or a higher business fare. The risk is the majors matching the fare; next step is modeling two round trips a day and getting gate quotes.",
    },
    ...CLOSE.map((t) => ({ ...t, t: t.t - 300 })),
  ],
  expect: {
    processRigorMax: 3,
    synthesisMax: 3,
    steps: {
      restate_prompt: ["hit"],
      clarify_objective: ["hit"],
      structure: ["prompted"],
      hypothesis_prioritize: ["prompted"],
      analyze_data: ["hit"],
      synthesize: ["prompted"],
    },
  },
};

export const AIRLINE_GOLDENS = [AIRLINE_STRONG, AIRLINE_JUMP, AIRLINE_BOTCH, AIRLINE_NUDGED];
