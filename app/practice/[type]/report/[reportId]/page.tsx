"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { addToast } from "@heroui/toast";
import { ArrowLeft, CircleAlert, Sparkles } from "lucide-react";

import ReportCustomizationStrip from "@/components/interview/ReportCustomizationStrip";
import ReportScoreCards, {
  type ReportScoreCardsProps,
} from "@/components/interview/ReportScoreCards";
import ReportBody from "@/components/report/ReportBody";
import { getReportChrome } from "@/components/practice/ReportChrome";
import { listRubricDimensionsForSlug } from "@/lib/engine/resolve";
import type { ReportDTO } from "@/lib/report/dto";
import type { ScoreMap } from "@/lib/report/snapshot";
import type { RubricDimension } from "@/lib/engine/types";

function isPollingStatus(status: ReportDTO["status"] | undefined) {
  return status === "PENDING" || status === "IN_PROGRESS";
}

function isTerminalStatus(
  status: ReportDTO["status"] | undefined,
): status is "READY" | "FAILED" {
  return status === "READY" || status === "FAILED";
}

/**
 * Build the score-card map from the type's declared rubric dimensions,
 * pulling each value from the DTO's dimension-keyed `scores` map. No
 * dimension key is hardcoded here — a Phase 14 type that adds an extra
 * still drives through this loop (REQ-71).
 */
function scoresFromDimensions(
  dimensions: RubricDimension[],
  map: ScoreMap | null | undefined,
): ReportScoreCardsProps["scores"] {
  const out: Record<string, number | null> = {};
  for (const dim of dimensions) {
    out[dim.key] = map?.[dim.key] ?? null;
  }
  return out as unknown as ReportScoreCardsProps["scores"];
}

export default function PracticeReportPage() {
  const params = useParams<{ type: string; reportId: string }>();
  const router = useRouter();

  const chrome = getReportChrome(params.type);
  const dimensions = useMemo(
    () => listRubricDimensionsForSlug(params.type),
    [params.type],
  );

  const [report, setReport] = useState<ReportDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const startedAtRef = useRef<number>(Date.now());
  const reportRef = useRef<ReportDTO | null>(null);
  reportRef.current = report;
  // Scenario-only asymmetry (REQ-69): present when guardsRepollAfter404.
  // Mirrors the legacy case-play page's hasLoadedOnceRef — set on first load
  // so the 404 path remains a single request (poll effect also keys on notFound).
  const hasLoadedOnceRef = useRef(false);

  const unknownType = !chrome || !dimensions;

  const load = useCallback(async () => {
    if (!chrome) return;

    if (chrome.guardsRepollAfter404 && hasLoadedOnceRef.current === false) {
      hasLoadedOnceRef.current = true;
    }

    try {
      const response = await fetch(`/api/practice/report/${params.reportId}`, {
        cache: "no-store",
        ...(chrome.distinguishes401 ? {} : { credentials: "include" as const }),
      });

      if (chrome.distinguishes401 && response.status === 401) {
        setNeedsLogin(true);
        return;
      }

      if (response.status === 404) {
        if (chrome.guardsRepollAfter404) {
          setNotFound(true);
        } else {
          setError("We couldn't find that report.");
        }
        return;
      }

      const data = (await response.json().catch(() => ({}))) as {
        report?: ReportDTO;
        error?: string;
      };

      if (!response.ok || !data.report) {
        setError(data.error || "We couldn't load that report.");
        return;
      }

      setReport(data.report);
      setError(null);
    } catch {
      setError("We couldn't load that report.");
    }
  }, [params.reportId, chrome]);

  useEffect(() => {
    if (unknownType) return;
    void load();
  }, [load, unknownType]);

  // Redirect to the canonical URL if the [type] segment disagrees with the
  // report's stored typeSlug — same contract as the legacy interview page.
  useEffect(() => {
    if (report && report.typeSlug !== params.type) {
      router.replace(`/practice/${report.typeSlug}/report/${report.id}`);
    }
  }, [report, params.type, router]);

  useEffect(() => {
    if (!chrome) return;
    if (notFound || timedOut || !isPollingStatus(report?.status)) {
      return;
    }

    const interval = setInterval(() => {
      if (Date.now() - startedAtRef.current > chrome.giveUpAfterMs) {
        setTimedOut(true);
        return;
      }
      void load();
    }, chrome.pollIntervalMs);

    return () => clearInterval(interval);
  }, [report?.status, notFound, timedOut, load, chrome]);

  const handleCheckAgain = () => {
    startedAtRef.current = Date.now();
    setTimedOut(false);
    void load();
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const response = await fetch(
        `/api/practice/report/${params.reportId}/retry`,
        { method: "POST" },
      );
      if (response.status !== 202) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        addToast({
          title: "Couldn't retry the evaluation",
          description: data.error,
          color: "danger",
        });
        return;
      }
      startedAtRef.current = Date.now();
      setTimedOut(false);
      await load();
    } finally {
      setRetrying(false);
    }
  };

  const isInterviewChrome = chrome?.showsCustomizationStrip === true;
  const isPending = isPollingStatus(report?.status);
  const scores = scoresFromDimensions(dimensions ?? [], report?.scores);
  const showSnapshotStrip =
    !isInterviewChrome && report && isTerminalStatus(report.status);

  const interviewCustomization =
    report?.input?.kind === "interview"
      ? {
          industry: report.input.industry,
          roleTitle: report.input.roleTitle,
          difficulty: report.input.difficulty,
          targetMinutes: report.input.targetMinutes,
          targetQuestionCount: report.input.targetQuestionCount,
          interviewerPersona: report.input.interviewerPersona,
        }
      : null;

  const interviewerName =
    report?.input?.kind === "interview"
      ? report.input.interviewerName
      : null;

  if (unknownType) {
    return (
      <ReportShell
        title="Your practice report"
        onBackToReports={() => router.push("/reports")}
      >
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-[#d4e2e9] bg-white p-8 shadow-[0_24px_60px_rgba(20,58,75,0.12)]">
          <CircleAlert className="text-[#0a7391]" size={26} />
          <p className="font-serif text-2xl text-[#102331]">Report not found</p>
          <Button color="primary" onPress={() => router.push("/")}>
            Back to practice
          </Button>
        </div>
      </ReportShell>
    );
  }

  if (needsLogin) {
    return (
      <ReportShell
        title="Your interview report"
        onBackToReports={() => router.push("/reports")}
      >
        <div className="rounded-2xl border border-[#d4e2e9] bg-white p-8 text-center shadow-[0_24px_60px_rgba(20,58,75,0.12)]">
          <p className="font-serif text-2xl text-[#102331]">
            Please sign in to view this report.
          </p>
          <Button className="mt-5" color="primary" onPress={() => router.push("/login")}>
            Go to sign in
          </Button>
        </div>
      </ReportShell>
    );
  }

  if (notFound) {
    return (
      <ReportShell
        title="Your practice report"
        onBack={() => router.push("/case-play")}
        backLabel="Back to practice"
        showBackAlways
      >
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-[#d4e2e9] bg-white p-8 shadow-[0_24px_60px_rgba(20,58,75,0.12)]">
          <CircleAlert className="text-[#0a7391]" size={26} />
          <p className="font-serif text-2xl text-[#102331]">Report not found</p>
          <Button color="primary" onPress={() => router.push("/case-play")}>
            Back to practice
          </Button>
        </div>
      </ReportShell>
    );
  }

  if (error) {
    return (
      <ReportShell
        title={isInterviewChrome ? "Your interview report" : "Your practice report"}
        onBackToReports={
          isInterviewChrome ? () => router.push("/reports") : undefined
        }
        onBack={
          isInterviewChrome ? undefined : () => router.push("/case-play")
        }
        backLabel={isInterviewChrome ? "Back to my reports" : "Back to practice"}
        showBackAlways={!isInterviewChrome}
      >
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-[#d4e2e9] bg-white p-8 shadow-[0_24px_60px_rgba(20,58,75,0.12)]">
          <CircleAlert className="text-[#0a7391]" size={26} />
          <p className="font-serif text-2xl text-[#102331]">{error}</p>
          <Button
            color="primary"
            onPress={() => router.push(isInterviewChrome ? "/" : "/case-play")}
          >
            Back to practice
          </Button>
        </div>
      </ReportShell>
    );
  }

  // terminationReason: Phase 13 only RECORDS it (CONTEXT.md defers report
  // copy to Phase 14). Render nothing for it here.
  void report?.terminationReason;

  return (
    <ReportShell
      title={isInterviewChrome ? "Your interview report" : "Your practice report"}
      interviewerName={isInterviewChrome ? interviewerName : null}
      completedAt={report?.completedAt ?? null}
      onBackToReports={
        isInterviewChrome ? () => router.push("/reports") : undefined
      }
      onBack={
        isInterviewChrome
          ? () => router.push("/")
          : () => router.push("/case-play")
      }
      onPracticeAgain={
        isInterviewChrome
          ? () => router.push(`/practice/${params.type}`)
          : undefined
      }
      backLabel={isInterviewChrome ? "Back to my reports" : "Back to practice"}
      showBackAlways={!isInterviewChrome}
    >
      {chrome.showsCustomizationStrip &&
        report &&
        (report.status === "READY" || report.status === "FAILED") &&
        interviewCustomization && (
          <div className="mb-6">
            <ReportCustomizationStrip
              typeSlug={report.typeSlug}
              customization={interviewCustomization}
            />
          </div>
        )}

      {showSnapshotStrip && report?.input?.kind === "scenario" && (
        <ScenarioSnapshotStrip
          scenario={{
            name: report.input.caseName,
            characters: scenarioCharacters(report.input.avatars),
            criteria: report.input.criteria,
          }}
        />
      )}

      {/* Score cards live inside Overview once READY; until then they render
          alone so a pending session still shows placeholders above the skeleton. */}
      {report?.status !== "READY" && (
        <ReportScoreCards
          scores={scores}
          pending={isPending && !timedOut}
          metrics={report?.metrics ?? null}
        />
      )}

      <div className="mt-6 rounded-2xl border border-[#d4e2e9] bg-white p-6 shadow-[0_24px_60px_rgba(20,58,75,0.12)] sm:p-8">
        {report?.status === "READY" ? (
          <ReportBody
            structured={report.reportStructured}
            markdown={report.reportMarkdown}
            scores={scores}
            metrics={report.metrics ?? null}
          />
        ) : report?.status === "FAILED" ? (
          <div className="flex flex-col items-start gap-3">
            <CircleAlert className="text-[#c2410c]" size={26} />
            <p className="font-serif text-2xl text-[#102331]">
              We couldn&apos;t generate your report.
            </p>
            {report.failureReason && (
              <p className="text-sm text-[#8298a3]">{report.failureReason}</p>
            )}
            <p className="text-sm text-[#526c7b]">
              {isInterviewChrome
                ? "Your interview transcript is saved — nothing was lost."
                : "Your practice transcript is saved — nothing was lost."}
            </p>
            {chrome.stalledAffordance === "retry" ? (
              <Button
                color="primary"
                isLoading={retrying}
                onPress={() => void handleRetry()}
              >
                Try again
              </Button>
            ) : (
              <Button color="primary" onPress={() => router.push("/case-play")}>
                Back to practice
              </Button>
            )}
          </div>
        ) : timedOut ? (
          <div className="flex flex-col items-start gap-3">
            <p className="font-serif text-2xl text-[#102331]">
              This is taking longer than expected.
            </p>
            <p className="text-sm text-[#526c7b]">
              {isInterviewChrome
                ? "Your interview is still being reviewed. You can check again in a moment."
                : "Your practice run is still being reviewed. You can check again in a moment."}
            </p>
            <Button color="primary" onPress={handleCheckAgain}>
              Check again
            </Button>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-[#0a7391]">
              <Spinner size="sm" color="primary" />
              {isInterviewChrome
                ? "Reviewing your interview…"
                : "Reviewing your practice run…"}
            </div>
            <div className="mt-6 space-y-4">
              <div className="h-6 w-2/3 animate-pulse rounded-md bg-[#e6edf1]" />
              <div className="h-4 w-full animate-pulse rounded-md bg-[#e6edf1]" />
              <div className="h-4 w-5/6 animate-pulse rounded-md bg-[#e6edf1]" />
              <div className="h-6 w-1/2 animate-pulse rounded-md bg-[#e6edf1]" />
              <div className="h-4 w-full animate-pulse rounded-md bg-[#e6edf1]" />
              <div className="h-4 w-3/4 animate-pulse rounded-md bg-[#e6edf1]" />
            </div>
          </div>
        )}
      </div>
    </ReportShell>
  );
}

function scenarioCharacters(avatars: unknown[]): { name: string; role: string }[] {
  const characters: { name: string; role: string }[] = [];
  for (const entry of avatars) {
    if (entry && typeof entry === "object") {
      const name = (entry as Record<string, unknown>).name;
      const role = (entry as Record<string, unknown>).role;
      characters.push({
        name: typeof name === "string" ? name : "",
        role: typeof role === "string" ? role : "",
      });
    }
  }
  return characters;
}

/**
 * Compact strip rendering the scenario from the typed `input` snapshot —
 * never a live re-fetch. Mirrors the legacy case-play ScenarioSnapshotStrip
 * so a scenario report stays visually identical (REQ-69 / REQ-33 / REQ-34).
 */
function ScenarioSnapshotStrip({
  scenario,
}: {
  scenario: {
    name: string;
    characters: { name: string; role: string }[];
    criteria: string | null;
  };
}) {
  return (
    <div className="mb-6 rounded-2xl border border-[#d4e2e9] bg-white p-5 shadow-[0_10px_30px_rgba(20,58,75,0.06)]">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#526c7b]">
        This scenario as it was when you practiced
      </p>
      <p className="mt-2 font-serif text-xl text-[#102331]">{scenario.name}</p>
      {scenario.characters.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {scenario.characters.map((character, index) => (
            <span
              key={`${character.name}-${index}`}
              className="rounded-full border border-[#d4e2e9] bg-[#f5f8fa] px-3 py-1 text-xs font-medium text-[#3a5462]"
            >
              {character.name}
              {character.role ? ` · ${character.role}` : ""}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-[#8298a3]">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            scenario.criteria ? "bg-[#0a7391]" : "bg-[#c7d5db]"
          }`}
        />
        {scenario.criteria ? "Criteria applied" : "No author criteria"}
      </div>
    </div>
  );
}

function ReportShell({
  children,
  title,
  interviewerName,
  completedAt,
  onBackToReports,
  onBack,
  onPracticeAgain,
  backLabel = "Back to my reports",
  showBackAlways = false,
}: {
  children: React.ReactNode;
  title: string;
  interviewerName?: string | null;
  completedAt?: string | null;
  onBackToReports?: () => void;
  onBack?: () => void;
  onPracticeAgain?: () => void;
  backLabel?: string;
  showBackAlways?: boolean;
}) {
  const showTopBack = Boolean(onBackToReports) || showBackAlways;
  const topBackHandler = onBackToReports ?? onBack;

  return (
    <main className="min-h-[100dvh] bg-[#f5f8fa] text-[#102331]">
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
        {showTopBack && topBackHandler && (
          <button
            type="button"
            onClick={topBackHandler}
            className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-[#58727f] transition-colors hover:text-[#0a7391]"
          >
            <ArrowLeft size={16} />
            {backLabel}
          </button>
        )}
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#0a7391]">
          <Sparkles size={14} />
          Leadership Avatar Practice
        </div>
        <h1 className="mt-3 font-serif text-3xl tracking-[-0.03em] text-[#102331] sm:text-4xl">
          {title}
        </h1>
        {(interviewerName || completedAt) && (
          <p className="mt-2 text-sm text-[#58727f]">
            {interviewerName ? `With ${interviewerName}` : null}
            {interviewerName && completedAt ? " · " : null}
            {completedAt ? new Date(completedAt).toLocaleString() : null}
          </p>
        )}

        <div className="mt-8">{children}</div>

        {/* Interview shell only — scenario has no bottom footer (REQ-69). */}
        {onPracticeAgain && (
          <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-[#e0eaee] pt-6">
            {onBack && (
              <Button variant="flat" onPress={onBack}>
                Back to practice
              </Button>
            )}
            <Button color="primary" onPress={onPracticeAgain}>
              Practice again
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
