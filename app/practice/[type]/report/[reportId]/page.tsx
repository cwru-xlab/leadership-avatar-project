"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { addToast } from "@heroui/toast";
import { ArrowLeft, CircleAlert, RotateCcw } from "lucide-react";

import ReportCustomizationStrip from "@/components/interview/ReportCustomizationStrip";
import ReportScoreCards, {
  type ReportScoreCardsProps,
} from "@/components/interview/ReportScoreCards";
import ReportBody from "@/components/report/ReportBody";
import {
  getReportChrome,
  renderReportExtras,
} from "@/components/practice/ReportChrome";
import { listRubricDimensionsForSlug } from "@/lib/engine/resolve";
import type { ReportDTO } from "@/lib/report/dto";
import { formatReportWhen, typeLabelForReport } from "@/lib/report/title";
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

  const typeLabel = typeLabelForReport(report?.typeSlug ?? params.type);

  if (unknownType) {
    return (
      <ReportShell
        title="Your practice report"
        onBackToReports={() => router.push("/reports")}
      >
        <StatusPanel
          action={<Button color="primary" onPress={() => router.push("/")}>Back to practice</Button>}
          title="This report type isn't set up to display yet"
        >
          The session may have saved, but the report page has no chrome or rubric for
          &ldquo;{params.type}&rdquo;. That is a configuration gap, not a missing report row.
        </StatusPanel>
      </ReportShell>
    );
  }

  if (needsLogin) {
    return (
      <ReportShell
        title="Your interview report"
        onBackToReports={() => router.push("/reports")}
      >
        <StatusPanel
          action={<Button color="primary" onPress={() => router.push("/login")}>Go to sign in</Button>}
          title="Please sign in to view this report."
        />
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
        <StatusPanel
          action={<Button color="primary" onPress={() => router.push("/case-play")}>Back to practice</Button>}
          title="Report not found"
        />
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
        <StatusPanel
          action={
            <Button
              color="primary"
              onPress={() => router.push(isInterviewChrome ? "/" : "/case-play")}
            >
              Back to practice
            </Button>
          }
          title={error}
        />
      </ReportShell>
    );
  }

  return (
    <ReportShell
      title={isInterviewChrome ? "Your interview report" : "Your practice report"}
      subtitle={[
        interviewerName ? `${typeLabel} with ${interviewerName}` : typeLabel,
        report?.completedAt ? formatReportWhen(report.completedAt) : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      aiLabel={report?.status === "READY"}
      onBackToReports={() => router.push("/reports")}
      onPracticeAgain={
        isInterviewChrome
          ? () => router.push(`/practice/${params.type}`)
          : undefined
      }
      setup={
        chrome.showsCustomizationStrip &&
        report &&
        (report.status === "READY" || report.status === "FAILED") &&
        interviewCustomization ? (
          <ReportCustomizationStrip
            typeSlug={report.typeSlug}
            customization={interviewCustomization}
          />
        ) : null
      }
    >
      {showSnapshotStrip && report?.input?.kind === "scenario" && (
        <ScenarioSnapshotStrip
          scenario={{
            name: report.input.caseName,
            characters: scenarioCharacters(report.input.avatars),
            criteria: report.input.criteria,
          }}
        />
      )}

      {/* Per-type extras (14-14 / 15-09). Generic — never branch on a slug. */}
      {renderReportExtras(chrome, "above", report)}

      {/* Once READY the body owns the score panel; until then it renders
          alone so a pending session still shows placeholders above the skeleton. */}
      {report?.status !== "READY" && (
        <ReportScoreCards
          scores={scores}
          pending={isPending && !timedOut}
          metrics={report?.metrics ?? null}
        />
      )}

      {report?.status === "READY" ? (
        <ReportBody
          structured={report.reportStructured}
          markdown={report.reportMarkdown}
          scores={scores}
          metrics={report.metrics ?? null}
          showInterviewPaceTarget={report.input?.kind === "interview"}
        />
      ) : report?.status === "FAILED" ? (
        <StatusPanel
          tone="error"
          title="We couldn't generate your report."
          action={
            chrome.stalledAffordance === "retry" ? (
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
            )
          }
        >
          {report.failureReason && <span className="block">{report.failureReason}</span>}
          {isInterviewChrome
            ? "Your interview transcript is saved — nothing was lost."
            : "Your practice transcript is saved — nothing was lost."}
        </StatusPanel>
      ) : timedOut ? (
        <StatusPanel
          title="This is taking longer than expected."
          action={
            <Button color="primary" onPress={handleCheckAgain}>
              Check again
            </Button>
          }
        >
          {isInterviewChrome
            ? "Your interview is still being reviewed. You can check again in a moment."
            : "Your practice run is still being reviewed. You can check again in a moment."}
        </StatusPanel>
      ) : (
        <div className="rounded-xl border border-line bg-white p-6 sm:p-8">
          <div className="flex items-center gap-2 text-sm font-semibold text-cwru-blue">
            <Spinner size="sm" color="primary" />
            {isInterviewChrome
              ? "Reviewing your interview…"
              : "Reviewing your practice run…"}
          </div>
          <div aria-hidden className="mt-6 flex flex-col gap-4">
            <div className="h-6 w-2/3 animate-pulse rounded-md bg-canvas" />
            <div className="h-4 w-full animate-pulse rounded-md bg-canvas" />
            <div className="h-4 w-5/6 animate-pulse rounded-md bg-canvas" />
            <div className="h-6 w-1/2 animate-pulse rounded-md bg-canvas" />
            <div className="h-4 w-full animate-pulse rounded-md bg-canvas" />
            <div className="h-4 w-3/4 animate-pulse rounded-md bg-canvas" />
          </div>
        </div>
      )}

      {renderReportExtras(chrome, "below", report)}
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

/** A report state that replaces the body: error, timeout, failure, not found. */
function StatusPanel({
  title,
  tone = "info",
  action,
  children,
}: {
  title: string;
  tone?: "info" | "error";
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-start gap-3 rounded-xl border border-line bg-white p-6 sm:p-8"
      role={tone === "error" ? "alert" : undefined}
    >
      <CircleAlert
        aria-hidden
        className={tone === "error" ? "text-copper" : "text-cwru-blue"}
        size={24}
        strokeWidth={1.5}
      />
      <p className="font-display text-2xl font-medium text-cwru-blue">{title}</p>
      {children && <p className="max-w-[65ch] text-sm text-muted">{children}</p>}
      {action}
    </div>
  );
}

/**
 * Compact strip rendering the scenario from the typed `input` snapshot —
 * never a live re-fetch. Mirrors the legacy case-play ScenarioSnapshotStrip
 * so a scenario report keeps the same content (REQ-69 / REQ-33 / REQ-34).
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
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-white px-5 py-4">
      <p className="text-[13px] font-semibold text-muted">
        This scenario as it was when you practiced
      </p>
      <p className="font-display text-xl font-medium text-cwru-blue">{scenario.name}</p>
      {scenario.characters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {scenario.characters.map((character, index) => (
            <span
              key={`${character.name}-${index}`}
              className="rounded-sm bg-canvas px-2 py-1 text-[12.5px] text-ink"
            >
              {character.name}
              {character.role ? ` · ${character.role}` : ""}
            </span>
          ))}
        </div>
      )}
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <span
          aria-hidden
          className={`size-1.5 rounded-full ${scenario.criteria ? "bg-true-blue" : "bg-light-blue"}`}
        />
        {scenario.criteria ? "Criteria applied" : "No author criteria"}
      </p>
    </div>
  );
}

/** Report frame header: back link, title, one line of context, and "Practice again" as the one primary. */
function ReportShell({
  children,
  title,
  subtitle,
  aiLabel = false,
  setup,
  onBackToReports,
  onBack,
  onPracticeAgain,
  backLabel = "My reports",
  showBackAlways = false,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  aiLabel?: boolean;
  setup?: React.ReactNode;
  onBackToReports?: () => void;
  onBack?: () => void;
  onPracticeAgain?: () => void;
  backLabel?: string;
  showBackAlways?: boolean;
}) {
  const showTopBack = Boolean(onBackToReports) || showBackAlways;
  const topBackHandler = onBackToReports ?? onBack;

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-2.5">
          {showTopBack && topBackHandler && (
            <button
              type="button"
              onClick={topBackHandler}
              className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-true-blue hover:text-cwru-blue"
            >
              <ArrowLeft aria-hidden size={16} />
              {backLabel}
            </button>
          )}
          <h1 className="font-display text-[28px] font-medium leading-[1.1] tracking-[-0.01em] text-cwru-blue md:text-[32px]">
            {title}
          </h1>
          {(subtitle || aiLabel || setup) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[14.5px] text-muted">
              {subtitle && <span>{subtitle}</span>}
              {aiLabel && (
                <span className="rounded-sm bg-ai/10 px-2 py-0.5 text-xs font-semibold text-ai">
                  AI feedback
                </span>
              )}
              {setup}
            </div>
          )}
        </div>
        {onPracticeAgain && (
          <Button
            className="h-11 rounded-lg px-[18px] font-semibold"
            color="primary"
            startContent={<RotateCcw aria-hidden size={18} />}
            onPress={onPracticeAgain}
          >
            Practice again
          </Button>
        )}
      </header>

      {children}
    </div>
  );
}
