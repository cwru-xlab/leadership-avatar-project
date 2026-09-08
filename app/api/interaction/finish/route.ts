import { NextRequest, NextResponse } from "next/server";
import { s3Storage } from "@/lib/s3-client";
import { waitUntil } from "@vercel/functions";
import type { InteractionLog } from "@/types";
import {
  DEFAULT_TOPIC_SKILLS,
  type PracticeTopic,
  type SkillKey,
} from "@/lib/topics";
import { persistAssessedAttempt } from "@/lib/learning-plan";

function buildDefaultEvalPrompt(topic: PracticeTopic, skills: SkillKey[]): string {
  return `You are evaluating a student's leadership practice session (${topic}).
Score ONLY text/chat-observable skills (do not invent camera or body-language scores).
Skills to score (0-100 each): ${skills.join(", ")}.
Respond in this exact format:
SCORE: [0-100 overall]
SKILL_SCORES: {"skill_key": number, ...}
EVALUATION:
[detailed feedback with strengths and 2-3 improvement actions]`;
}

function parseSkillScores(
  responseText: string,
  fallbackSkills: string[]
): Record<string, number> {
  const jsonMatch = responseText.match(/SKILL_SCORES:\s*(\{[\s\S]*?\})/i);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]) as Record<string, number>;
      const cleaned: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "number" && !Number.isNaN(v)) {
          cleaned[k] = Math.min(100, Math.max(0, Math.round(v)));
        }
      }
      if (Object.keys(cleaned).length > 0) return cleaned;
    } catch {
      // fall through
    }
  }

  // Fallback: distribute overall score across topic skills if JSON missing
  const scoreMatch = responseText.match(/SCORE:\s*(\d+)/i);
  const overall = scoreMatch
    ? Math.min(100, Math.max(0, parseInt(scoreMatch[1], 10)))
    : 70;
  const out: Record<string, number> = {};
  for (const skill of fallbackSkills) {
    out[skill] = overall;
  }
  return out;
}

async function evaluateInteraction(log: InteractionLog): Promise<void> {
  try {
    const caseData = await s3Storage.getCase(log.caseId);
    const topic = (caseData?.topic ||
      "courageous_conversation") as PracticeTopic;
    const skills =
      (caseData?.targetSkills as SkillKey[] | undefined) ||
      DEFAULT_TOPIC_SKILLS[topic];

    const evaluationPrompt =
      caseData?.evaluationPrompt ||
      buildDefaultEvalPrompt(topic, skills);

    const interactionText = buildInteractionText(log);

    const evaluationMessages = [
      {
        role: "system" as const,
        content: evaluationPrompt,
      },
      {
        role: "user" as const,
        content: `Please evaluate the following student practice session.

Student: ${log.studentName} (${log.studentEmail})
Scenario: ${log.caseName}
Topic: ${topic}
Attempt: ${log.attemptNumber}
Total Messages: ${log.totalMessages}
Duration: ${Math.round(log.totalTimeSeconds / 60)} minutes

Skills to score (0-100): ${skills.join(", ")}

--- INTERACTION HISTORY ---
${interactionText}
--- END OF INTERACTION ---

Respond with:
SCORE: [number 0-100]
SKILL_SCORES: {"${skills[0]}": n, ...}
EVALUATION:
[detailed evaluation]`,
      },
    ];

    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: evaluationMessages,
      max_tokens: 2000,
    });

    const responseText = completion.choices[0]?.message?.content || "";

    const scoreMatch = responseText.match(/SCORE:\s*(\d+)/i);
    const evalScore = scoreMatch
      ? Math.min(100, Math.max(0, parseInt(scoreMatch[1], 10)))
      : null;

    const skillScores = parseSkillScores(responseText, skills);

    log.evalScore = evalScore ?? undefined;
    log.evalResult = responseText;
    log.skillScores = skillScores;
    log.updatedAt = new Date().toISOString();

    await s3Storage.saveInteractionLog(log);
    console.log(
      `Evaluation completed for ${log.studentEmail} case ${log.caseId} attempt ${log.attemptNumber}: score=${evalScore} skills=${Object.keys(skillScores).length}`
    );

    await persistAssessedAttempt({
      userEmail: log.studentEmail,
      caseSlug: log.caseId,
      caseTitle: log.caseName,
      attemptNumber: log.attemptNumber,
      score: evalScore,
      skillScores,
      evalResult: responseText,
      totalMessages: log.totalMessages,
      totalTimeSeconds: log.totalTimeSeconds,
      topic,
      interactionLogS3Key: `interactions/${log.studentEmail}/${log.caseId}/${log.id}.json`,
    });
  } catch (error) {
    console.error("Error evaluating interaction:", error);
    log.evalResult = `Evaluation failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    log.updatedAt = new Date().toISOString();
    try {
      await s3Storage.saveInteractionLog(log);
    } catch {
      // Ignore secondary save errors
    }
  }
}

function buildInteractionText(log: InteractionLog): string {
  const events = [...log.events].sort((a, b) => a.timestamp - b.timestamp);

  const lines: string[] = [];
  let currentRole: string | null = null;

  for (const event of events) {
    const time = new Date(event.timestamp).toLocaleTimeString();

    switch (event.type) {
      case "start_session":
        lines.push(`[${time}] Session started`);
        break;
      case "enter_role":
        currentRole = event.roleName || event.roleId || "Unknown";
        lines.push(
          `\n[${time}] Student entered conversation with: ${currentRole}`
        );
        break;
      case "exit_role":
        lines.push(
          `[${time}] Student left conversation with: ${event.roleName || currentRole}`
        );
        currentRole = null;
        break;
      case "send_message":
        lines.push(
          `[${time}] Student → ${currentRole || "Unknown"}: ${event.messageContent}`
        );
        break;
      case "receive_message":
        lines.push(
          `[${time}] ${currentRole || "Unknown"} → Student: ${event.messageContent}`
        );
        break;
      case "end_session":
        lines.push(`\n[${time}] Session ended`);
        break;
    }
  }

  return lines.join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { log } = body as { log: InteractionLog };

    if (!log || !log.id || !log.studentEmail || !log.caseId) {
      return NextResponse.json(
        { error: "Missing required interaction log data" },
        { status: 400 }
      );
    }

    const now = Date.now();

    log.events.push({
      type: "end_session",
      timestamp: now,
    });

    log.status = "completed";
    log.completedAt = now;
    log.lastSavedAt = now;
    log.totalTimeSeconds = Math.round((now - log.startedAt) / 1000);
    log.updatedAt = new Date(now).toISOString();

    let totalMessages = 0;
    for (const roleInteraction of Object.values(log.roleInteractions)) {
      totalMessages += roleInteraction.messages.length;
    }
    log.totalMessages = totalMessages;

    if (log.mode === "assessed") {
      await s3Storage.saveInteractionLog(log);
      waitUntil(evaluateInteraction(log));
    }

    return NextResponse.json({
      success: true,
      message:
        log.mode === "assessed"
          ? "Session completed. Evaluation is being processed in the background."
          : "Explore session completed.",
      completedAt: now,
    });
  } catch (error) {
    console.error("Error finishing interaction:", error);
    return NextResponse.json(
      { error: "Failed to finish interaction" },
      { status: 500 }
    );
  }
}
