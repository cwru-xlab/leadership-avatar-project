/**
 * Public sources the data / product-analytics interview is modeled on.
 *
 * One list, referenced by the frameworks, the question bank and the validity
 * doc (docs/interviews/data-analytics-validity.md), so a citation is written
 * once. Retrieved 2026-11-06. Where a source was read through a secondary
 * summary rather than the original, that is said.
 */

export const ANALYTICS_SOURCES = {
  /**
   * The experimentation reference: OEC and guardrail metrics, randomization
   * unit, power (rule of thumb n ≈ 16σ²/δ² per variant), novelty/primacy,
   * interference, and Ch. 21 "Sample Ratio Mismatch and Other Trust-Related
   * Guardrail Metrics" (pp. 219–225, Cambridge listing).
   */
  kohavi:
    "Ron Kohavi, Diane Tang & Ya Xu, Trustworthy Online Controlled Experiments: A Practical Guide to A/B Testing " +
    "(Cambridge University Press, 2020), esp. ch. 7 (metrics), 17 (statistics), 21 (SRM), 22 (interference), 23 (novelty)",
  /** Puzzling outcomes: novelty, carryover, why a "winning" metric misleads. */
  kohaviPuzzles:
    "Kohavi, Deng, Frasca, Longbotham, Walker & Xu, “Trustworthy Online Controlled Experiments: Five Puzzling Outcomes Explained”, KDD 2012",
  /** SRM taxonomy: how often it happens and where it comes from. */
  fabijanSrm:
    "Fabijan, Gupchup, Gupta, Omhover, Qin, Vermeer & Dmitriev, “Diagnosing Sample Ratio Mismatch in Online Controlled Experiments”, KDD 2019",
  /** Interview-prep book: product sense, A/B testing, SQL, stats chapters. */
  aceTheDsInterview:
    "Nick Singh & Kevin Huo, Ace the Data Science Interview (2021), chapters on product sense, A/B testing, SQL and statistics; companion site datalemur.com",
  /** Meta's Product Analytics loop: analytical execution vs. analytical reasoning, as summarized by prep guides. */
  metaLoop:
    "Meta Data Scientist (Product Analytics) loop as described by Exponent (tryexponent.com/guides/meta-data-scientist-interview), " +
    "DataLemur (datalemur.com/blog/meta-data-scientist-interview-guide) and Prepfully (prepfully.com/interview-guides/meta-ds-analytical-execution)",
  /** Metric-drop five-step framework: validate data, scope by segment, decompose, hypothesize, act. */
  interviewQueryDrop:
    "Interview Query, “How to Answer a Metrics Drop Question in a Data Science Interview” (interviewquery.com/p/metrics-drop-data-science-interview) " +
    "and “How to Answer A/B Testing Interview Questions: A 6-Step Guide” (interviewquery.com/p/how-to-answer-ab-testing-interview-questions)",
  /** A/B testing interview problems (novelty, network effects, multiple testing). Not re-verified online 2026-11-06. */
  emmaDing:
    "Emma Ding (Data Interview Pro), “A Guide to A/B Testing for Data Science Interviews” / “The 7 Most Common A/B Testing Interview Problems” (Towards Data Science, 2020–21)",
  /** Exponent / IGotAnOffer: product-sense and metric questions for data scientists. */
  exponent:
    "Exponent, Data Science interview course: product sense, metrics and A/B testing modules (tryexponent.com/courses/data-science)",
  igotanoffer:
    "IGotAnOffer, “Meta data scientist interview” and “Data science product sense questions” guides (igotanoffer.com)",
  /** Peeking: repeated significance testing inflates false positives. */
  evanMiller: "Evan Miller, “How Not To Run an A/B Test” (evanmiller.org/how-not-to-run-an-ab-test.html, 2010)",
  /** Airbnb: dynamic p-values / stopping early, context-aware readouts. */
  airbnb: "Jan Overgoor, “Experiments at Airbnb” (Airbnb Engineering & Data Science blog, 2014)",
  /** Marketplace interference and switchback designs. */
  doordash:
    "DoorDash Engineering, “Switchback Tests and Randomized Experimentation Under Network Effects at DoorDash” (2018)",
  /** What a p-value is and is not. */
  asaPValue:
    "Wasserstein & Lazar, “The ASA Statement on p-Values: Context, Process, and Purpose”, The American Statistician 70(2), 2016",
  /** Mix shift / Simpson's paradox. */
  simpson: "Bickel, Hammel & O'Connell, “Sex Bias in Graduate Admissions: Data from Berkeley”, Science 187, 1975 (Simpson's paradox)",
  /** North-star metric with input and counter metrics. */
  northStar:
    "Amplitude, “The North Star Playbook” (2019); Lenny Rachitsky, “Choosing your North Star metric” (Lenny's Newsletter, 2021)",
} as const;
