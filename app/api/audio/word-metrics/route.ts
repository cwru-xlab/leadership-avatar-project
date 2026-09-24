import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";

// REQ-38 (server-side half): this route receives one turn's audio, sends it
// to OpenAI for word-level timestamps, and returns only derived numbers. The
// uploaded blob exists only as the in-memory `File` handed to the SDK — it is
// never persisted to any durable or ephemeral filesystem location, and its
// bytes/transcript text are never logged. Only lengths
// (`{ userId, bytes, wordCount, durationSec }`) are logged, matching the
// `08-03-SUMMARY.md` precedent for sensitive input.
//
// This is a SEPARATE, NON-STREAMING call from the existing live push-to-talk
// transcription route (which stays byte-unchanged). `whisper-1` is the only
// OpenAI transcription model that exposes word-level `timestamp_granularities`,
// and that feature is only available with `response_format: "verbose_json"`,
// which the streaming response mode used by that other route does not support.
// Do NOT "optimise" this onto the newer realtime-streaming transcription
// model — it has no word timestamps at all, and (per Task 3's measurement)
// also tends to clean up disfluencies that `whisper-1` retains more
// faithfully.

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // OpenAI's file size limit
const MIN_AUDIO_BYTES = 2048; // mirrors InterviewSessionShell's MIN_AUDIO_BYTES guard
const MAX_RETURNED_WORDS = 4000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30_000,
  maxRetries: 1,
});

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

interface WordMetricsResponseBody {
  words: WordTiming[];
  durationSec: number;
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    const formData = await request.formData();
    const file = formData.get("audio");

    if (!file || typeof file === "string") {
      return response({ error: "An audio recording must be provided" }, 400);
    }

    if (file.size < MIN_AUDIO_BYTES) {
      return response({ error: "The audio recording is too short to analyze" }, 400);
    }

    if (file.size > MAX_AUDIO_BYTES) {
      return response({ error: "The audio recording exceeds the 25MB limit" }, 400);
    }

    let transcription: {
      duration?: number;
      words?: Array<{ word: string; start: number; end: number }>;
    };
    try {
      transcription = await openai.audio.transcriptions.create({
        file,
        model: "whisper-1", // the only OpenAI STT model exposing word timestamps
        response_format: "verbose_json", // required for timestamp_granularities
        timestamp_granularities: ["word"],
      });
    } catch (error) {
      console.error("Word-timing transcription failed:", error);
      return response({ error: "Unable to analyze that audio. Please try again." }, 502);
    }

    const rawWords = Array.isArray(transcription.words) ? transcription.words : [];
    const words: WordTiming[] = rawWords.slice(0, MAX_RETURNED_WORDS).map((w) => ({
      word: w.word,
      start: w.start,
      end: w.end,
    }));

    const durationSec =
      typeof transcription.duration === "number"
        ? transcription.duration
        : words.length > 0
          ? words[words.length - 1].end
          : 0;

    console.info("Word-metrics analysis completed", {
      userId: currentUser.id,
      bytes: file.size,
      wordCount: words.length,
      durationSec,
    });

    const body: WordMetricsResponseBody = { words, durationSec };
    return response({ ...body }, 200);
  } catch (error) {
    console.error("Word-metrics route failed:", error);
    return response({ error: "Unable to analyze that audio. Please try again." }, 500);
  }
}
