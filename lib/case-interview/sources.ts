/**
 * Public sources the consulting case interview is modeled on.
 *
 * One list, referenced by the frameworks, the case bank and the validity doc
 * (docs/interviews/case-interview-validity.md) so a citation is written once.
 * Retrieved 2026-11-06. Firm pages were read as published; where a firm page
 * moved or blocked automated reading, that is noted rather than guessed.
 */

export const CASE_SOURCES = {
  /** Primary: types, Vault's 8 scenario types, 9 candidate steps, criteria. */
  cwru:
    "CWRU Career Center, “Case-Style Interviews” " +
    "(case.edu/studentlife/careercenter/career-development/career-resources/tips-job-seekers/interviewing/case-style-interviews)",
  /** Vault Guide to the Case Interview, as summarized on the CWRU page. */
  vault: "Vault Guide to the Case Interview (8th ed.), via the CWRU Career Center page",
  /** Candidate-led; clarify objective, framework, think aloud, highlight key numbers. */
  bain:
    "Bain & Company, “Case interview preparation” " +
    "(bain.com/careers/hiring-process/case-interview) incl. Coffee Shop Co. and FashionCo. practice cases",
  /** Structure, thoughtful questions, data & quick math, key factors, clear logic. */
  bcg: "BCG, “Case Interview Preparation” (careers.bcg.com/global/en/case-interview-preparation)",
  /** Interviewer-led problem-solving interview; Electro-Light / Beautify / Diconsa practice cases. */
  mckinsey:
    "McKinsey & Company, “Interviewing” (mckinsey.com/careers/interviewing) and its practice cases " +
    "(Electro-Light/SuperSoda, Beautify, Diconsa)",
  /** Treat interviewer as client; restate problem; use numbers; recommend. */
  oliverWyman:
    "Oliver Wyman, “Interview preparation” (oliverwyman.com/careers/entry-level/interview-preparation.html)",
  /** Practice-tool case library (federal and commercial). The linked page now redirects to deloitte.com/us/en/careers. */
  deloitte: "Deloitte Consulting case interview prep tool (linked from the CWRU page; page now redirects)",
  /** Hypothesis-driven, 3–4 core frameworks (profitability, business situation, M&A, capacity). */
  caseInterviewCom: "Victor Cheng, CaseInterview.com (caseinterview.com), frameworks pages",
  /** Ivy Case System: summarize, verify objective, clarify, structure. */
  caseQuestions: "Marc Cosentino, Case in Point / CaseQuestions.com (casequestions.com)",
} as const;
