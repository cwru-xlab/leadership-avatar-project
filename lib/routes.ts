/** Canonical browser paths for the student practice experience. API paths remain local to callers. */
const segment = (value: string) => encodeURIComponent(value);

/**
 * Interview engine slugs whose public URL segment differs from the slug.
 * Report slugs never change; only the browser path does. `/practice/interviews/technical`
 * is the coding interview, so the behavioral `technical` preset lives elsewhere.
 */
const INTERVIEW_SEGMENTS: Record<string, string> = {
  technical: "technical-behavioral",
  "technical-coding": "technical",
};

/** Public URL segment for an interview engine slug. */
export const interviewSegment = (slug: string) => INTERVIEW_SEGMENTS[slug] ?? slug;

/** Engine slug served by a `/practice/interviews/[type]` segment (inverse of `interviewSegment`). */
export const interviewSlugFromSegment = (value: string) =>
  Object.keys(INTERVIEW_SEGMENTS).find((slug) => INTERVIEW_SEGMENTS[slug] === value) ?? value;

export const routes = {
  practice: () => "/practice",
  interviews: () => "/practice/interviews",
  interview: (type: string) => `/practice/interviews/${segment(interviewSegment(type))}`,
  /** Second page of the interview picker: every specialized preset. */
  industryInterviews: () => "/practice/interviews/industry-specific",
  /**
   * A preset's customization page, keyed by ENGINE slug (the handoff key is
   * `interview:customization:{engine slug}`); Continue goes to `interview(type)`.
   */
  customizeInterview: (type: string) =>
    `/practice/interviews/customize/${segment(type)}`,
  caseStudies: () => "/practice/case-studies",
  caseStudy: (caseId: string) => `/practice/case-studies/${segment(caseId)}`,
  newCaseStudy: () => "/practice/case-studies/new",
  editCaseStudy: (caseId: string) =>
    `/practice/case-studies/${segment(caseId)}/edit`,
  courageousConversations: () => "/practice/courageous-conversations",
  courageousConversation: (id: string) =>
    `/practice/courageous-conversations/${segment(id)}`,
  newCourageousConversation: () => "/practice/courageous-conversations/new",
  editCourageousConversation: (id: string) =>
    `/practice/courageous-conversations/${segment(id)}/edit`,
  pitches: () => "/practice/pitches",
  elevatorPitch: () => "/practice/pitches/elevator",
  deckPitches: () => "/practice/pitches/deck",
  deckPitch: (mode: string) => `/practice/pitches/deck/${segment(mode)}`,
  networking: () => "/practice/networking",
  clinicalCommunication: () => "/practice/clinical-communication",
  motivationalInterviewing: () => "/practice/motivational-interviewing",
  /** Resolve engine slugs used by plans into canonical browser paths. */
  practiceType: (type: string, instanceId?: string) => {
    const id = instanceId ? segment(instanceId) : null;
    switch (type) {
      case "case-study":
        return id ? `/practice/case-studies/${id}` : "/practice/case-studies";
      case "difficult-conversation":
        return id
          ? `/practice/courageous-conversations/${id}`
          : "/practice/courageous-conversations";
      case "pitch-elevator":
        return "/practice/pitches/elevator";
      case "pitch-deck":
      case "pitch-funding":
      case "pitch-product":
      case "pitch-talk":
      case "pitch-general":
        return `/practice/pitches/deck/${segment(type)}`;
      case "networking":
        return "/practice/networking";
      case "clinical-communication":
      case "motivational-interviewing":
        return id ? `/practice/${type}/${id}` : `/practice/${type}`;
      default:
        return routes.interview(type);
    }
  },
  reports: () => "/reports",
  report: (reportId: string) => `/reports/${segment(reportId)}`,
} as const;
