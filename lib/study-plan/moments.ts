/**
 * Extracts the student turns (plus the report growth areas they map to) that
 * a knowledge-check or coached-practice generator may draw content from.
 *
 * WHY THIS EXISTS: knowledge-check and coached-practice content is generated
 * from the student's OWN session moments, not a generic authored bank (see
 * 21-CONTEXT.md). This module is the boundary that hands a generator exactly
 * the student turns it is allowed to quote from, paired with the growth area
 * that identified the gap.
 *
 * Every `studentText` this function emits is guaranteed quotable: only
 * `role: "user"` turns at or above `MIN_QUOTABLE_LENGTH` are emitted, and
 * that threshold is imported from `./verbatim` rather than restated, so the
 * two gates can never drift apart.
 *
 * `competencyKeys` is deliberately left empty here and populated by the
 * caller — this module does NOT import the mastery catalog module under
 * `lib/mastery/`, so it stays usable even if that catalog is later replaced.
 */
import type { InterviewTranscript } from "../interview/transcript";
import type { StructuredReport } from "../report/structured";
import { MIN_QUOTABLE_LENGTH } from "./verbatim";

export interface SessionMoment {
  reportId: string;
  turnIndex: number;
  studentText: string;
  precedingAvatarText: string | null;
  /** `m:ss` on the session clock, matching `ReportGrowthArea.timecodes`. */
  timecode: string;
  linkedGrowthAreaTitles: string[];
  /** Populated by the caller; intentionally empty from this module. */
  competencyKeys: string[];
}

/**
 * Elapsed time from session start, rendered as `m:ss` — the exact convention
 * `ReportGrowthArea.timecodes` already uses (see
 * `formatTranscriptForEvaluator` in `lib/interview/transcript.ts`), so a
 * growth area's timecode can be compared to a moment's by string equality.
 */
function computeTimecode(timestamp: number, startedAt: number): string {
  const elapsed = Math.max(0, Math.round((timestamp - startedAt) / 1000));
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function extractSessionMoments(
  transcript: InterviewTranscript,
  report: StructuredReport,
  reportId: string,
): SessionMoment[] {
  const moments: SessionMoment[] = [];

  transcript.turns.forEach((turn, turnIndex) => {
    if (turn.role !== "user") return;
    if (turn.content.length < MIN_QUOTABLE_LENGTH) return;

    let precedingAvatarText: string | null = null;
    for (let j = turnIndex - 1; j >= 0; j -= 1) {
      if (transcript.turns[j].role === "assistant") {
        precedingAvatarText = transcript.turns[j].content;
        break;
      }
    }

    const timecode = computeTimecode(turn.timestamp, transcript.startedAt);

    // A growth area links to a moment ONLY when its timecode equals this
    // moment's exactly. A growth area whose timecode matches no turn must
    // link to nothing — never fall back to attaching it to the nearest turn.
    const linkedGrowthAreaTitles = report.growth_areas
      .filter((area) => area.timecodes.includes(timecode))
      .map((area) => area.title);

    moments.push({
      reportId,
      turnIndex,
      studentText: turn.content,
      precedingAvatarText,
      timecode,
      linkedGrowthAreaTitles,
      competencyKeys: [],
    });
  });

  return moments;
}
