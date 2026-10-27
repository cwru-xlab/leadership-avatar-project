/**
 * Metric-gated Delivery diagnosis. Picks up to two closely related library
 * moves from measured WPM / pauses / fillers / volume / eye contact / framing.
 * A well-paced attempt cannot be told to "cut pace by a third".
 *
 * Two focuses in one session only when they share a TechniqueCluster
 * (vocal_landing vs visual_presence). Different clusters stay on separate
 * path steps — the path already creates more than one Delivery drill.
 */
import {
  techniquesForCompetency,
  type Technique,
} from "./coached/tips";
import type { CameraMode, VisualMetrics, VocalMetrics } from "../metrics/types";
import type { CompetencyKey } from "../mastery/competencies";

/** Matches `bandPace` in lib/metrics/bands.ts: Well paced is WPM < 160. */
export const WELL_PACED_MAX_WPM = 160;
/** Matches `bandPauseRate`: Natural starts at 1 pause per minute. */
export const PAUSE_NATURAL_PER_MIN = 1;
/** Matches `bandEyeContact`: Solid starts at 50%. */
export const EYE_SOLID_PCT = 50;
/** Matches `bandFraming`: Mostly centred starts at 65%. */
export const FRAME_MOSTLY_CENTRED_PCT = 65;
/** Matches on-camera "Mostly present". */
export const FACE_MOSTLY_PRESENT_PCT = 75;
/** Matches `bandVolume`: Uneven is consistency < 0.5. */
export const VOLUME_UNEVEN = 0.5;
/** Matches Frequent filler density per 100 words. */
export const FILLER_FREQUENT_PER_100 = 3;

export const MAX_FOCUSES_PER_SESSION = 2;
const WEAK_ENOUGH = 0.25;

export interface DiagnosisFocus {
  technique: Technique;
  reason: string;
  weakness: number;
}

export interface DeliveryDiagnosis {
  focuses: DiagnosisFocus[];
  ineligibleIds: string[];
  /** Catalog did not cover a remaining weakness — generate a phrasing approach. */
  freeform: boolean;
}

export interface DiagnosisInput {
  competencyKey: CompetencyKey;
  cameraMode?: CameraMode | string | null;
  vocal?: VocalMetrics | null;
  visual?: VisualMetrics | null;
  spokenSeconds?: number | null;
  wordsPerMinute?: number | null;
  fillerWordCount?: number | null;
  pauseCount?: number | null;
  usedTechniqueIds?: readonly string[];
  eyeContactPct?: number | null;
  cameraCenteredPct?: number | null;
  facePresencePct?: number | null;
}

function spokenSecondsOf(input: DiagnosisInput): number | null {
  if (typeof input.spokenSeconds === "number" && Number.isFinite(input.spokenSeconds)) {
    return input.spokenSeconds;
  }
  const fromVocal = input.vocal?.coverage?.spoken_seconds;
  return typeof fromVocal === "number" && Number.isFinite(fromVocal) ? fromVocal : null;
}

function wpmOf(input: DiagnosisInput): number | null {
  if (typeof input.wordsPerMinute === "number" && Number.isFinite(input.wordsPerMinute)) {
    return input.wordsPerMinute;
  }
  const fromVocal = input.vocal?.words_per_minute;
  return typeof fromVocal === "number" && Number.isFinite(fromVocal) ? fromVocal : null;
}

function pauseRatePerMin(input: DiagnosisInput): number | null {
  const pauses = input.pauseCount ?? input.vocal?.pause_count;
  const seconds = spokenSecondsOf(input);
  if (typeof pauses !== "number" || !Number.isFinite(pauses) || seconds == null) return null;
  const minutes = Math.max(1, seconds / 60);
  return pauses / minutes;
}

function fillerDensityPer100(input: DiagnosisInput): number | null {
  const fillers = input.fillerWordCount ?? input.vocal?.filler_word_count;
  const wpm = wpmOf(input);
  const seconds = spokenSecondsOf(input);
  if (typeof fillers !== "number" || wpm == null || seconds == null) return null;
  const totalWords = Math.round(wpm * (seconds / 60));
  if (totalWords <= 0) return fillers > 0 ? 3 : 0;
  return (fillers / totalWords) * 100;
}

function scoreTechnique(t: Technique, input: DiagnosisInput): { weakness: number; reason: string; ineligible: boolean } {
  const wpm = wpmOf(input);
  const pauseRate = pauseRatePerMin(input);
  const fillers = fillerDensityPer100(input);
  const volume = input.vocal?.volume_consistency;
  const cameraOn = input.cameraMode === "ON";
  const eye = cameraOn ? input.eyeContactPct ?? input.visual?.eye_contact_pct ?? null : null;
  const centered = cameraOn ? input.cameraCenteredPct ?? input.visual?.camera_centered_pct ?? null : null;
  const present = cameraOn ? input.facePresencePct ?? input.visual?.face_presence_pct ?? null : null;

  switch (t.id) {
    case "delivery-slow-down":
    case "delivery-dont-rush-the-list": {
      if (wpm == null) return { weakness: 0, reason: "Pace was not measured.", ineligible: true };
      if (wpm < WELL_PACED_MAX_WPM) {
        return {
          weakness: 0,
          reason: `Your pace is already well paced at ${Math.round(wpm)} WPM.`,
          ineligible: true,
        };
      }
      const over = (wpm - WELL_PACED_MAX_WPM) / 40;
      return {
        weakness: Math.min(1, over),
        reason:
          t.id === "delivery-dont-rush-the-list"
            ? `Your last list item is rushed at ${Math.round(wpm)} WPM (target 125–160).`
            : `Your pace is ${Math.round(wpm)} WPM (target 125–160).`,
        ineligible: false,
      };
    }
    case "delivery-pause-after-point":
    case "delivery-hold-the-last-word":
    case "delivery-start-after-a-beat":
    case "delivery-one-breath-per-sentence": {
      if (pauseRate == null) return { weakness: 0, reason: "Pauses were not measured.", ineligible: true };
      if (pauseRate >= PAUSE_NATURAL_PER_MIN) {
        return { weakness: 0, reason: "Your pauses are already in a natural range.", ineligible: true };
      }
      return {
        weakness: Math.min(1, (PAUSE_NATURAL_PER_MIN - pauseRate) / PAUSE_NATURAL_PER_MIN),
        reason: `You had ${pauseRate < 0.05 ? "no" : "almost no"} pauses ≥1.5s.`,
        ineligible: false,
      };
    }
    case "delivery-filler-at-the-turn": {
      if (fillers == null) return { weakness: 0, reason: "Fillers were not measured.", ineligible: true };
      if (fillers < FILLER_FREQUENT_PER_100) {
        return { weakness: 0, reason: "Your filler density is already low.", ineligible: true };
      }
      return {
        weakness: Math.min(1, (fillers - FILLER_FREQUENT_PER_100) / 6),
        reason: `Your filler words are frequent (${fillers.toFixed(1)} per 100 words).`,
        ineligible: false,
      };
    }
    case "delivery-level-the-close": {
      if (typeof volume !== "number") return { weakness: 0, reason: "Volume was not measured.", ineligible: true };
      if (volume >= VOLUME_UNEVEN) {
        return { weakness: 0, reason: "Your volume is already steady enough.", ineligible: true };
      }
      return {
        weakness: Math.min(1, (VOLUME_UNEVEN - volume) / VOLUME_UNEVEN),
        reason: "Your volume trails off or varies enough to lose the close.",
        ineligible: false,
      };
    }
    case "delivery-eyes-up":
    case "delivery-own-the-room": {
      if (!cameraOn || eye == null) return { weakness: 0, reason: "Camera was off, so gaze was not measured.", ineligible: true };
      if (eye >= EYE_SOLID_PCT) {
        return { weakness: 0, reason: `Your eye contact is already ${Math.round(eye)}% toward the camera.`, ineligible: true };
      }
      return {
        weakness: Math.min(1, (EYE_SOLID_PCT - eye) / EYE_SOLID_PCT),
        reason: `Your eyes were toward the camera ${Math.round(eye)}% of the time (solid starts at 50%).`,
        ineligible: false,
      };
    }
    case "delivery-recenter-frame": {
      if (!cameraOn || centered == null) return { weakness: 0, reason: "Camera was off, so framing was not measured.", ineligible: true };
      if (centered >= FRAME_MOSTLY_CENTRED_PCT) {
        return { weakness: 0, reason: "Your framing is already mostly centred.", ineligible: true };
      }
      return {
        weakness: Math.min(1, (FRAME_MOSTLY_CENTRED_PCT - centered) / FRAME_MOSTLY_CENTRED_PCT),
        reason: `Your framing was centred ${Math.round(centered)}% of the time.`,
        ineligible: false,
      };
    }
    case "delivery-stay-in-frame": {
      if (!cameraOn || present == null) return { weakness: 0, reason: "Camera was off, so presence was not measured.", ineligible: true };
      if (present >= FACE_MOSTLY_PRESENT_PCT) {
        return { weakness: 0, reason: "You stayed on camera for most of the answer.", ineligible: true };
      }
      return {
        weakness: Math.min(1, (FACE_MOSTLY_PRESENT_PCT - present) / FACE_MOSTLY_PRESENT_PCT),
        reason: `Your face was in frame ${Math.round(present)}% of the time.`,
        ineligible: false,
      };
    }
    default:
      return { weakness: 0, reason: "", ineligible: false };
  }
}

export function ineligibleDeliveryTechniqueIds(input: DiagnosisInput): Set<string> {
  const ids = new Set<string>();
  if (input.competencyKey !== "delivery_presence") return ids;
  for (const t of techniquesForCompetency("delivery_presence")) {
    if (scoreTechnique(t, input).ineligible) ids.add(t.id);
  }
  return ids;
}

export function diagnoseDelivery(input: DiagnosisInput): DeliveryDiagnosis {
  if (input.competencyKey !== "delivery_presence") {
    return { focuses: [], ineligibleIds: [], freeform: false };
  }
  const used = new Set(input.usedTechniqueIds ?? []);
  const ranked: DiagnosisFocus[] = [];
  const ineligibleIds: string[] = [];
  for (const t of techniquesForCompetency("delivery_presence")) {
    const scored = scoreTechnique(t, input);
    if (scored.ineligible) {
      ineligibleIds.push(t.id);
      continue;
    }
    if (scored.weakness < WEAK_ENOUGH) continue;
    ranked.push({ technique: t, reason: scored.reason, weakness: scored.weakness });
  }
  ranked.sort((a, b) => b.weakness - a.weakness || (used.has(a.technique.id) ? 1 : 0) - (used.has(b.technique.id) ? 1 : 0));

  const focuses: DiagnosisFocus[] = [];
  for (const row of ranked) {
    if (focuses.length >= MAX_FOCUSES_PER_SESSION) break;
    if (focuses.length === 0) {
      focuses.push(row);
      continue;
    }
    const first = focuses[0];
    if (row.technique.cluster && row.technique.cluster === first.technique.cluster) {
      focuses.push(row);
    }
  }

  const leftover = ranked.some((row) => !focuses.some((f) => f.technique.id === row.technique.id) && row.technique.cluster !== focuses[0]?.technique.cluster);
  return {
    focuses,
    ineligibleIds,
    freeform: focuses.length === 0 || leftover,
  };
}

export function joinFocusReminders(focuses: readonly DiagnosisFocus[]): string {
  return focuses.map((f) => f.technique.reminder).join(" ");
}

export function joinFocusNames(focuses: readonly DiagnosisFocus[]): string {
  return focuses.map((f) => f.technique.name).join(", ");
}
