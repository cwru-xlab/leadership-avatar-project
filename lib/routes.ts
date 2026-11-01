/** Canonical browser paths for the student practice experience. API paths remain local to callers. */
const segment = (value: string) => encodeURIComponent(value);

export const routes = {
  practice: () => "/practice",
  interviews: () => "/practice/interviews",
  interview: (type: string) => `/practice/interviews/${segment(type)}`,
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
      default:
        return `/practice/interviews/${segment(type)}`;
    }
  },
  reports: () => "/reports",
  report: (reportId: string) => `/reports/${segment(reportId)}`,
} as const;
