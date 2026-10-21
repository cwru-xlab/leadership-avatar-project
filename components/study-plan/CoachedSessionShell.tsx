"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Spinner } from "@heroui/spinner";
import { Textarea } from "@heroui/input";

/**
 * Coached session shell — REPLAY leg, tip rail, transition, FRESH leg,
 * finish (REQ-114, REQ-115, REQ-116).
 *
 * This is the student-facing surface 21-23's runtime exists to serve: that
 * plan made coached mode reachable over HTTP, but "a student can COMPLETE
 * it" and "every tip actually rendered" are both claims about what a
 * student OBSERVES, and there is no screen until this file.
 *
 * REUSE, NOT IMPORT. `components/practice/PracticeSessionShell.tsx` was
 * read for its session transport (the engine's generic session-start /
 * turn / session-finish lifecycle) but is NOT imported, extended, or
 * modified here — 21-12's isolation guard asserts nothing under
 * `components/practice/` knows about coached mode, and "sharing" the shell
 * is the cheapest way to violate that. The reusable piece this file
 * actually needs is thin enough (three JSON fetches: start / turn / finish,
 * against the SAME engine session endpoints the practice shell itself
 * calls) that it is written fresh below rather than factored into a shared
 * module neither shell would otherwise need — `git diff --name-only --
 * components/practice/` stays empty either way. What is deliberately NOT
 * reused is the practice shell's HeyGen avatar video/audio rendering
 * (`InteractiveAvatarWrapper`) and its visual/vocal capture pipeline — a
 * coached session is still a real, scored, turn-taking live session against
 * the same `/api/practice/session/start`, `/api/interaction/chat`, and
 * `/api/practice/session/finish` endpoints an unaided one uses, presented
 * here as a text conversation rather than a video call. See the SUMMARY for
 * this plan for the explicit record of that scope decision.
 *
 * STATE MACHINE — mirrors the server, never leads it. `legView.leg` is
 * taken from a server response (GET/POST/PATCH against 21-23's route) and
 * is NEVER set from a local literal "FRESH" or "COMPLETE" string. Advancing
 * past REPLAY, or completing from FRESH, always re-reads (or is handed) the
 * server's own view of the leg — see `refreshLeg`, `handleAdvance`, and
 * `handleComplete` below. A client-side optimistic advance is how a student
 * could reach the fresh leg without the replay leg actually being recorded,
 * which would make REQ-114 false in the data while looking fine on screen.
 */

// ---------------------------------------------------------------------------
// Client-side types mirroring lib/study-plan/coached/runtime.ts's
// `CoachedLegView` response shape. NOT imported from that module — it pulls
// in Prisma, S3, and the engine registry, none of which may reach a client
// bundle. Mirrored the same way KnowledgeCheckCard.tsx mirrors its own
// route's response shapes.
// ---------------------------------------------------------------------------

interface CoachedTipDTO {
  id: string;
  name: string;
  reminder: string;
}

interface ReplayMomentDTO {
  text: string;
  sourceReportId: string;
  turnIndex: number;
}

interface CoachedLegDTO {
  coachedSessionId: string;
  leg: "REPLAY" | "FRESH" | "COMPLETE";
  competencyKey: string;
  replayMoment: ReplayMomentDTO | null;
  freshScenarioPrompt: string | null;
  tips: CoachedTipDTO[];
  underlyingTypeSlug: string;
}

type ChatTurn = { role: "user" | "assistant"; content: string };

type UiPhase = "LOADING" | "NEEDS_LOGIN" | "NOT_FOUND" | "ENTRY_ERROR" | "READY";

export interface CoachedSessionShellProps {
  planId: string;
  stepId: string;
}

/** Turns a `competencyKey` like "structuring_feedback" into "Structuring feedback"
 * without importing `lib/mastery/competencies.ts` — that module pulls in
 * `lib/engine/registry.ts`, which must never reach a client bundle. */
function formatCompetencyLabel(key: string): string {
  const spaced = key.replace(/[_-]+/g, " ").trim().toLowerCase();
  return spaced.length > 0 ? spaced[0].toUpperCase() + spaced.slice(1) : key;
}

export default function CoachedSessionShell({ stepId }: CoachedSessionShellProps) {
  const coachedUrl = `/api/study-plans/path-steps/${stepId}/coached`;

  const [uiPhase, setUiPhase] = useState<UiPhase>("LOADING");
  const [entryError, setEntryError] = useState<string | null>(null);
  const [legView, setLegView] = useState<CoachedLegDTO | null>(null);
  const [contributionsWritten, setContributionsWritten] = useState<number | null>(null);

  // Per-leg live-session sub-state — reset whenever the server-reported leg
  // changes (see the effect below keyed on `legKeyRef`).
  const [sessionReportId, setSessionReportId] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draftTurn, setDraftTurn] = useState("");
  const [startingSession, setStartingSession] = useState(false);
  const [sendingTurn, setSendingTurn] = useState(false);
  const [finishingLeg, setFinishingLeg] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  const legKeyRef = useRef<string | null>(null);

  /**
   * Reads (or, on first entry, enters) the step's coached session. ALWAYS
   * the thing that sets `legView` — there is no other writer of it in this
   * component, which is what makes "the leg is never advanced client-side"
   * a structural fact rather than a convention.
   */
  const refreshLeg = useCallback(
    async (opts?: { allowCreate?: boolean }): Promise<void> => {
      const response = await fetch(coachedUrl, {
        method: opts?.allowCreate ? "POST" : "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (response.status === 401) {
        setUiPhase("NEEDS_LOGIN");
        return;
      }
      if (response.status === 404) {
        if (!opts?.allowCreate) {
          // No session yet — enter it. A GET never creates one itself
          // (21-23's route guarantees this), so this is the ONE retry.
          await refreshLeg({ allowCreate: true });
          return;
        }
        setUiPhase("NOT_FOUND");
        return;
      }
      if (response.status === 409) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setEntryError(
          data.error ?? "The original session's transcript could not be read.",
        );
        setUiPhase("ENTRY_ERROR");
        return;
      }
      if (!response.ok) {
        setEntryError("Unable to load this coached step.");
        setUiPhase("ENTRY_ERROR");
        return;
      }

      const data = (await response.json()) as { leg: CoachedLegDTO };
      setLegView(data.leg);
      setUiPhase("READY");
    },
    [coachedUrl],
  );

  useEffect(() => {
    refreshLeg();
    // Intentionally run once on mount only — `refreshLeg` is stable across
    // the component's life (it closes only over `coachedUrl`, which never
    // changes for a mounted shell) and re-running it on every render would
    // turn "resume on GET" into a resume-on-every-paint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset the live-session sub-state exactly when the SERVER-reported leg
  // changes — never on a local action. This is what lets the student leave
  // and return mid-leg without losing an in-flight conversation on a mere
  // re-render.
  useEffect(() => {
    if (!legView) return;
    const key = `${legView.coachedSessionId}:${legView.leg}`;
    if (legKeyRef.current === key) return;
    legKeyRef.current = key;
    setSessionReportId(null);
    setTurns([]);
    setDraftTurn("");
    setLiveError(null);
  }, [legView]);

  // -------------------------------------------------------------------------
  // Live session transport — start / turn / finish, against the SAME
  // engine-generic endpoints `components/practice/PracticeSessionShell.tsx`
  // calls, written fresh here rather than imported from it.
  // -------------------------------------------------------------------------

  async function startLiveSession(): Promise<void> {
    if (!legView) return;
    setStartingSession(true);
    setLiveError(null);
    try {
      const response = await fetch("/api/practice/session/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typeSlug: legView.underlyingTypeSlug }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        reportId?: string;
        error?: string;
      };
      if (!response.ok || typeof data.reportId !== "string") {
        setLiveError(data.error ?? "Unable to start this leg's session.");
        return;
      }
      setSessionReportId(data.reportId);
    } finally {
      setStartingSession(false);
    }
  }

  async function sendTurn(): Promise<void> {
    if (!legView || !sessionReportId) return;
    const content = draftTurn.trim();
    if (!content || sendingTurn) return;

    const nextTurns: ChatTurn[] = [...turns, { role: "user", content }];
    setTurns(nextTurns);
    setDraftTurn("");
    setSendingTurn(true);
    setLiveError(null);

    try {
      const response = await fetch("/api/interaction/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextTurns,
          engine: { typeSlug: legView.underlyingTypeSlug },
          reportId: sessionReportId,
        }),
      });

      if (!response.ok || !response.body) {
        setLiveError("The coach could not respond. Please try again.");
        return;
      }

      const assistantText = await readAssistantReply(response.body);
      if (assistantText) {
        setTurns((prev) => [...prev, { role: "assistant", content: assistantText }]);
      }
    } catch {
      setLiveError("We couldn't reach the server. Please try again.");
    } finally {
      setSendingTurn(false);
    }
  }

  /**
   * Finishes this leg's own live session, then polls the report until the
   * evaluator has actually scored it (session/finish returns 202 fast and
   * schedules evaluation — `completeCoachedSession`'s contribution writer
   * requires scores to exist, so advancing or completing before they land
   * would under-report what this leg evidenced). Returns whether the
   * report is ready to be handed to the coached route.
   */
  async function finishLiveSessionAndWaitReady(reportId: string): Promise<boolean> {
    const finishResponse = await fetch("/api/practice/session/finish", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportId, turns }),
    });
    if (!finishResponse.ok && finishResponse.status !== 409) {
      setLiveError("Unable to finish this leg's session.");
      return false;
    }

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const reportResponse = await fetch(`/api/practice/report/${reportId}`, {
        credentials: "include",
        cache: "no-store",
      });
      const reportData = (await reportResponse.json().catch(() => ({}))) as {
        report?: { status?: string };
      };
      const status = reportData.report?.status;
      if (status === "READY") return true;
      if (status === "FAILED") {
        setLiveError("This leg's session could not be scored. Please try again.");
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    setLiveError("Scoring is taking longer than expected — please wait a moment and try again.");
    return false;
  }

  /** REPLAY -> FRESH. The ONLY forward control out of REPLAY. */
  async function handleAdvance(): Promise<void> {
    if (!legView || !sessionReportId || finishingLeg) return;
    setFinishingLeg(true);
    try {
      const ready = await finishLiveSessionAndWaitReady(sessionReportId);
      if (!ready) return;

      const response = await fetch(coachedUrl, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advance", replayReportId: sessionReportId }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        leg?: CoachedLegDTO;
        error?: string;
        currentLeg?: string | null;
      };
      if (response.ok && data.leg) {
        setLegView(data.leg);
      } else {
        setLiveError(data.error ?? "Unable to move to the fresh situation.");
      }
    } finally {
      setFinishingLeg(false);
    }
  }

  /** FRESH -> COMPLETE. The ONLY forward control out of FRESH. */
  async function handleComplete(): Promise<void> {
    if (!legView || !sessionReportId || finishingLeg) return;
    setFinishingLeg(true);
    try {
      const ready = await finishLiveSessionAndWaitReady(sessionReportId);
      if (!ready) return;

      const response = await fetch(coachedUrl, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", reportId: sessionReportId }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        contributionsWritten?: number;
        error?: string;
      };
      if (response.ok) {
        setContributionsWritten(
          typeof data.contributionsWritten === "number" ? data.contributionsWritten : 0,
        );
        // Mirror the server, never lead it: the COMPLETE leg is read back
        // from a fresh GET, not assigned as a local literal.
        await refreshLeg();
      } else {
        setLiveError(data.error ?? "Unable to finish this coached session.");
      }
    } finally {
      setFinishingLeg(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (uiPhase === "LOADING") {
    return (
      <div className="flex flex-col items-center gap-3 py-16" aria-live="polite">
        <Spinner size="lg" />
        <p className="text-sm text-[#58727f]">Setting up your coached session…</p>
      </div>
    );
  }

  if (uiPhase === "NEEDS_LOGIN") {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="text-[#385463]">Sign in to start this coached session.</p>
        <Button as={Link} href="/login" className="mt-5" color="primary">
          Go to sign in
        </Button>
      </div>
    );
  }

  if (uiPhase === "NOT_FOUND") {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="text-[#385463]">This coached step is not available.</p>
        <Button as={Link} href="/reports" className="mt-5" color="primary">
          Back to your study plan
        </Button>
      </div>
    );
  }

  if (uiPhase === "ENTRY_ERROR" || !legView) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="text-[#9b2c2c]" role="alert">
          {entryError ?? "Unable to load this coached step."}
        </p>
        <Button as={Link} href="/reports" className="mt-5" variant="light">
          Back to your study plan
        </Button>
      </div>
    );
  }

  const competencyLabel = formatCompetencyLabel(legView.competencyKey);

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-8" aria-live="polite">
      {legView.leg === "REPLAY" && (
        <ReplayLeg
          legView={legView}
          competencyLabel={competencyLabel}
          underlyingTypeSlug={legView.underlyingTypeSlug}
          sessionReportId={sessionReportId}
          turns={turns}
          draftTurn={draftTurn}
          onDraftTurnChange={setDraftTurn}
          startingSession={startingSession}
          sendingTurn={sendingTurn}
          finishingLeg={finishingLeg}
          liveError={liveError}
          onStartSession={startLiveSession}
          onSendTurn={sendTurn}
          onAdvance={handleAdvance}
        />
      )}

      {legView.leg === "FRESH" && (
        <FreshLeg
          legView={legView}
          competencyLabel={competencyLabel}
          underlyingTypeSlug={legView.underlyingTypeSlug}
          sessionReportId={sessionReportId}
          turns={turns}
          draftTurn={draftTurn}
          onDraftTurnChange={setDraftTurn}
          startingSession={startingSession}
          sendingTurn={sendingTurn}
          finishingLeg={finishingLeg}
          liveError={liveError}
          onStartSession={startLiveSession}
          onSendTurn={sendTurn}
          onComplete={handleComplete}
        />
      )}

      {legView.leg === "COMPLETE" && (
        <CompleteLeg contributionsWritten={contributionsWritten} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SSE reply reader — parses the shared `/api/interaction/chat` stream
// format (`data: {"type":"content","content":"<cumulative text>"}`), and
// returns only the final cumulative content, never a token-by-token splice.
// ---------------------------------------------------------------------------

async function readAssistantReply(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let latest = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        const event = JSON.parse(line.slice(6)) as {
          type?: string;
          content?: string;
        };
        if (event.type === "content" && typeof event.content === "string") {
          latest = event.content;
        }
      } catch {
        // Skip a malformed frame; the next one still carries the
        // cumulative text.
      }
    }
  }

  return latest;
}

// ---------------------------------------------------------------------------
// Live session area — shared between REPLAY and FRESH.
// ---------------------------------------------------------------------------

interface LiveSessionAreaProps {
  underlyingTypeSlug: string;
  sessionReportId: string | null;
  turns: ChatTurn[];
  draftTurn: string;
  onDraftTurnChange: (value: string) => void;
  startingSession: boolean;
  sendingTurn: boolean;
  onStartSession: () => void;
  onSendTurn: () => void;
}

function LiveSessionArea({
  sessionReportId,
  turns,
  draftTurn,
  onDraftTurnChange,
  startingSession,
  sendingTurn,
  onStartSession,
  onSendTurn,
}: LiveSessionAreaProps) {
  if (!sessionReportId) {
    return (
      <Card className="border border-[#dce8ed]">
        <CardBody className="items-center gap-3 p-6 text-center">
          <p className="text-sm text-[#385463]">
            When you&apos;re ready, start the conversation.
          </p>
          <Button color="primary" isDisabled={startingSession} onPress={onStartSession}>
            {startingSession ? <Spinner size="sm" /> : "Start the conversation"}
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="border border-[#dce8ed]">
      <CardBody className="space-y-4 p-6">
        <div className="space-y-3" aria-live="polite">
          {turns.length === 0 && (
            <p className="text-sm text-[#58727f]">
              Say the first thing you&apos;d say. The coach will respond.
            </p>
          )}
          {turns.map((turn, index) => (
            <p
              key={index}
              className={
                turn.role === "user"
                  ? "rounded-lg bg-[#eaf7fa] p-3 text-sm text-[#102331]"
                  : "rounded-lg bg-[#f8fbfc] p-3 text-sm text-[#385463]"
              }
            >
              <span className="font-semibold">
                {turn.role === "user" ? "You: " : "Coach: "}
              </span>
              {turn.content}
            </p>
          ))}
        </div>

        <Textarea
          aria-label="Your response"
          placeholder="Type what you'd say…"
          value={draftTurn}
          onValueChange={onDraftTurnChange}
          minRows={2}
          isDisabled={sendingTurn}
        />
        <Button
          color="primary"
          isDisabled={sendingTurn || draftTurn.trim().length === 0}
          onPress={onSendTurn}
        >
          {sendingTurn ? <Spinner size="sm" /> : "Send"}
        </Button>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// REPLAY leg
// ---------------------------------------------------------------------------

interface ReplayLegProps extends LiveSessionAreaProps {
  legView: CoachedLegDTO;
  competencyLabel: string;
  finishingLeg: boolean;
  liveError: string | null;
  onAdvance: () => void;
}

function ReplayLeg(props: ReplayLegProps) {
  const { legView, competencyLabel, finishingLeg, liveError, onAdvance } = props;
  const moment = legView.replayMoment;

  return (
    <section aria-labelledby="coached-replay-heading" className="space-y-5">
      <h1 id="coached-replay-heading" className="font-serif text-2xl text-[#102331]">
        First, let&apos;s rework what you actually said.
      </h1>
      <p className="text-sm text-[#58727f]">Competency: {competencyLabel}</p>

      {moment && (
        <div className="rounded-xl border border-[#b9dbe5] bg-[#eaf7fa] p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[#0a7391]">
            Your own words
          </p>
          {/*
            VERBATIM, UNTOUCHED. No .trim(), no ellipsizing, no re-casing, no
            whitespace collapsing between the server's response and the
            screen. 21-04's verbatim gate, 21-10's generation, and 21-23's
            delivery all guarantee this text matches the stored transcript
            exactly — the last place that guarantee could be broken is a
            cosmetic class or a `.slice()` right here. `pre-wrap` is what
            lets the original line breaks and spacing render exactly as
            stored, rather than being collapsed by normal HTML whitespace
            handling.
          */}
          <blockquote
            className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#173847]"
          >
            {moment.text}
          </blockquote>
          <Link
            href={`/practice/${legView.underlyingTypeSlug}/report/${moment.sourceReportId}`}
            className="mt-2 inline-block text-xs font-semibold text-[#006b87] underline underline-offset-2"
          >
            View the session this came from
          </Link>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[2fr,1fr]">
        <LiveSessionArea {...props} />
        <TipRail tips={legView.tips} />
      </div>

      {liveError && (
        <p className="text-sm text-[#9b2c2c]" role="alert">
          {liveError}
        </p>
      )}

      <Button
        color="primary"
        isDisabled={!props.sessionReportId || finishingLeg}
        onPress={onAdvance}
      >
        {finishingLeg ? <Spinner size="sm" /> : "Done with the replay — show me a fresh situation"}
      </Button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// FRESH leg — the replay moment is NOT shown again here. The point of this
// leg is transfer, and showing the original moment again would invite
// repetition rather than proving the skill carries to a new situation.
// ---------------------------------------------------------------------------

interface FreshLegProps extends LiveSessionAreaProps {
  legView: CoachedLegDTO;
  competencyLabel: string;
  finishingLeg: boolean;
  liveError: string | null;
  onComplete: () => void;
}

function FreshLeg(props: FreshLegProps) {
  const { legView, competencyLabel, finishingLeg, liveError, onComplete } = props;

  return (
    <section aria-labelledby="coached-fresh-heading" className="space-y-5">
      <h1 id="coached-fresh-heading" className="font-serif text-2xl text-[#102331]">
        Now a new situation, same skill.
      </h1>
      <p className="text-sm text-[#58727f]">
        This exercises the same competency: {competencyLabel}.
      </p>

      {legView.freshScenarioPrompt && (
        <div className="rounded-xl border border-[#dce8ed] bg-[#f8fbfc] p-4">
          <p className="text-sm leading-6 text-[#385463]">{legView.freshScenarioPrompt}</p>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[2fr,1fr]">
        <LiveSessionArea {...props} />
        <TipRail tips={legView.tips} />
      </div>

      {liveError && (
        <p className="text-sm text-[#9b2c2c]" role="alert">
          {liveError}
        </p>
      )}

      <Button
        color="primary"
        isDisabled={!props.sessionReportId || finishingLeg}
        onPress={onComplete}
      >
        {finishingLeg ? <Spinner size="sm" /> : "Finish"}
      </Button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tip rail — technique reminders, visually separate from the student's own
// input/speaking area, rendering ONLY what the server already gated
// (REQ-115).
// ---------------------------------------------------------------------------

function TipRail({ tips }: { tips: CoachedTipDTO[] }) {
  return (
    <aside
      aria-label="Technique reminders"
      className="space-y-3 rounded-xl border border-[#dce8ed] bg-[#fbfdfe] p-4"
    >
      <p className="text-xs font-bold uppercase tracking-wide text-[#58727f]">
        Technique reminders
      </p>
      {/*
        The one allowed explanatory literal (plan 21-24's contract line) —
        this names the skill, never scripts the words. There is exactly
        one sentence like this in this file, and it is not a tip.
      */}
      <p className="text-xs leading-5 text-[#58727f]">
        These name a technique to apply — they are not words to say.
      </p>
      {tips.length === 0 && (
        <p className="text-xs text-[#58727f]">No reminders for this leg.</p>
      )}
      {/*
        Render ONLY what the server sent. Every `tip.reminder` below is read
        directly off the server response — never composed, templated,
        interpolated, concatenated, or defaulted. 21-23's `tipsForLeg` ran
        `assertTipSafe` over every one of these before sending it; a tip
        assembled in this view would have passed no gate at all.
      */}
      <ul className="space-y-3">
        {tips.map((tip) => (
          <li key={tip.id} className="rounded-lg bg-white p-3 shadow-sm">
            <p className="text-sm font-semibold text-[#102331]">{tip.name}</p>
            <p className="mt-1 text-sm leading-5 text-[#385463]">{tip.reminder}</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// COMPLETE
// ---------------------------------------------------------------------------

function CompleteLeg({ contributionsWritten }: { contributionsWritten: number | null }) {
  return (
    <section aria-labelledby="coached-complete-heading" className="space-y-5 text-center">
      <h1 id="coached-complete-heading" className="font-serif text-2xl text-[#102331]">
        Session complete.
      </h1>
      <p className="text-sm leading-6 text-[#385463]">
        {contributionsWritten !== null && contributionsWritten > 0
          ? `This session has been scored and moved your mastery in ${contributionsWritten} ${
              contributionsWritten === 1 ? "competency" : "competencies"
            }.`
          : "This session has been scored."}
      </p>
      <p className="text-sm leading-6 text-[#58727f]">
        A coached session counts for less toward your mastery than practicing
        unaided, because the coach helped.
      </p>
      <div className="flex justify-center gap-3">
        <Button as={Link} href="/mastery" color="primary">
          View your mastery
        </Button>
        <Button as={Link} href="/reports" variant="light">
          Back to your reports
        </Button>
      </div>
    </section>
  );
}
