/**
 * Difficult-conversation record type — a NEW S3 object type with its own
 * prefix and index (not a retrofit of the Phase 9 case-study record).
 *
 * Field limits and bands live here so the server validator and the builder UI
 * share one source of truth. Plans 15-04 / 15-05 / 15-07 code against this shape.
 */

/**
 * Three difficulty bands — a Claude's-Discretion choice recorded here.
 * Gives a real spread without pretending to a precision a prompt cannot deliver.
 *
 * - `receptive` — defensive but reachable
 * - `guarded` — deflects, needs to be pinned down
 * - `hostile` — counter-attacks and has a bottom line they will state late
 *
 * The band is chosen in the wizard and is **hidden entirely during the session**.
 */
export const DIFFICULTY_BANDS = ["receptive", "guarded", "hostile"] as const;

export type DifficultyBand = (typeof DIFFICULTY_BANDS)[number];

/**
 * Character-count bounds for every text field on a difficult-conversation
 * record. Chosen so a scenario is gradeable without becoming an essay:
 * roles stay short labels, situation/backstory/hidden position carry enough
 * concrete facts for an evaluator, and objective/stakes stay crisp.
 */
export const DC_LIMITS = {
  TITLE_MIN: 4,
  TITLE_MAX: 80,
  AVATAR_ROLE_MIN: 2,
  AVATAR_ROLE_MAX: 80,
  STUDENT_ROLE_MIN: 2,
  STUDENT_ROLE_MAX: 80,
  SITUATION_MIN: 40,
  SITUATION_MAX: 1200,
  SHARED_BACKSTORY_MIN: 40,
  SHARED_BACKSTORY_MAX: 2000,
  HIDDEN_POSITION_MIN: 40,
  HIDDEN_POSITION_MAX: 2000,
  STUDENT_OBJECTIVE_MIN: 10,
  STUDENT_OBJECTIVE_MAX: 400,
  STAKES_MIN: 10,
  STAKES_MAX: 600,
} as const;

export interface DifficultConversationLastCheck {
  status: "passed" | "rejected";
  checkedAt: string;
  reason?: string;
  fix?: string;
}

export interface DifficultConversationRecord {
  id: string;
  title: string;
  avatarRole: string;
  studentRole: string;
  situation: string;
  sharedBackstory: string;
  /**
   * Never sent to a client except to the record's own owner in the authoring
   * UI. It is omitted from the student-facing briefing and from the report
   * snapshot (15-01). Any new read path must be checked against that rule.
   */
  hiddenPosition: string;
  studentObjective: string;
  stakes: string;
  /**
   * Default difficulty band for this record. The student may pick another
   * band at session setup; the live session never surfaces which band is active.
   */
  difficulty: DifficultyBand;
  /** Always set together with voiceId — never cross-paired. */
  avatarId: string;
  /** Always set together with avatarId — that avatar's own default voice. */
  voiceId: string;
  /**
   * Real per-user ownership. Set SERVER-SIDE from the authenticated session,
   * never from a client-supplied request body. Null marks an ownerless /
   * legacy record that no user may edit.
   */
  ownerId: string | null;
  /**
   * Discovery-layer visibility. `true` means students can find this conversation
   * in the catalog index. Absent or false means draft: hidden from browsing, but
   * still playable by direct URL so the author can preview. This is NOT an
   * access control — that semantic is unchanged from Phase 9: a direct read by
   * id stays untouched by `published`.
   */
  published: boolean;
  createdAt: string;
  updatedAt: string;
  /**
   * Last pre-publish check verdict (plan 15-03 writes it, 15-05 stores it,
   * 15-07 renders it). Null until a check has run.
   */
  lastCheck: DifficultConversationLastCheck | null;
}
