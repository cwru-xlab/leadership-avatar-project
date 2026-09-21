"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { ArrowLeft, CircleAlert, Sparkles } from "lucide-react";

import ReportMarkdown from "@/components/interview/ReportMarkdown";
import ReportScoreCards from "@/components/interview/ReportScoreCards";
import type { ScenarioReportDTO } from "@/lib/scenario/report-dto";
import { SCENARIO_REPORT_TERMINAL_STATUSES } from "@/lib/scenario/report-dto";

// Typical evaluation lands well under a minute (see 09-04-SUMMARY.md). Poll
// every 3s while the report is still being produced, and give up at 3
// minutes with a manual "check again" rather than polling forever.
const POLL_MS = 3000;
const POLL_GIVE_UP_MS = 180_000;

const nullScores = { visual: null, vocal: null, content: null, behavioral: null };

function isPollingStatus(status: ScenarioReportDTO["status"] | undefined) {
  return status === "PENDING" || status === "IN_PROGRESS";
}

function isTerminalStatus(
  status: ScenarioReportDTO["status"] | undefined
): status is "READY" | "FAILED" {
  return (
    !!status &&
    (SCENARIO_REPORT_TERMINAL_STATUSES as readonly string[]).includes(status)
  );
}

export default function ScenarioReportPage() {
  const params = useParams<{ caseId: string; reportId: string }>();
  const router = useRouter();

  const [report, setReport] = useState<ScenarioReportDTO | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  const startedAtRef = useRef<number>(Date.now());
  const hasLoadedOnceRef = useRef(false);

  // A 404 (bad id, or someone else's report — the API returns the identical
  // body/status for both) must produce exactly ONE request, never a poll
  // loop. Once `notFound` is set, `load` is never called again.
  const load = useCallback(async () => {
    if (hasLoadedOnceRef.current === false) {
      hasLoadedOnceRef.current = true;
    }

    try {
      const response = await fetch(`/api/scenario/report/${params.reportId}`, {
        credentials: "include",
        cache: "no-store",
      });

      if (response.status === 404) {
        setNotFound(true);
        return;
      }

      const data = (await response.json().catch(() => ({}))) as {
        report?: ScenarioReportDTO;
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
  }, [params.reportId]);

  // Initial load — exactly once per mount.
  useEffect(() => {
    void load();
  }, [load]);

  // Poll only while the report is still being produced, and stop the
  // instant it reaches a terminal status, a 404, or the give-up timer.
  useEffect(() => {
    if (notFound || timedOut || !isPollingStatus(report?.status)) {
      return;
    }

    const interval = setInterval(() => {
      if (Date.now() - startedAtRef.current > POLL_GIVE_UP_MS) {
        setTimedOut(true);
        return;
      }
      void load();
    }, POLL_MS);

    return () => clearInterval(interval);
  }, [report?.status, notFound, timedOut, load]);

  const handleCheckAgain = () => {
    startedAtRef.current = Date.now();
    setTimedOut(false);
    void load();
  };

  const isPending = isPollingStatus(report?.status);
  const scores = report?.scores ?? nullScores;
  const showSnapshotStrip = report && isTerminalStatus(report.status);

  if (notFound) {
    return (
      <ReportShell>
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
      <ReportShell>
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-[#d4e2e9] bg-white p-8 shadow-[0_24px_60px_rgba(20,58,75,0.12)]">
          <CircleAlert className="text-[#0a7391]" size={26} />
          <p className="font-serif text-2xl text-[#102331]">{error}</p>
          <Button color="primary" onPress={() => router.push("/case-play")}>
            Back to practice
          </Button>
        </div>
      </ReportShell>
    );
  }

  return (
    <ReportShell completedAt={report?.completedAt ?? null}>
      {showSnapshotStrip && report && <ScenarioSnapshotStrip scenario={report.scenario} />}

      <ReportScoreCards scores={scores} pending={isPending && !timedOut} />

      <div className="mt-6 rounded-2xl border border-[#d4e2e9] bg-white p-6 shadow-[0_24px_60px_rgba(20,58,75,0.12)] sm:p-8">
        {report?.status === "READY" ? (
          <ReportMarkdown markdown={report.reportMarkdown ?? ""} />
        ) : report?.status === "FAILED" ? (
          <div className="flex flex-col items-start gap-3">
            <CircleAlert className="text-[#c2410c]" size={26} />
            <p className="font-serif text-2xl text-[#102331]">We couldn&apos;t generate your report.</p>
            {report.failureReason && (
              <p className="text-sm text-[#8298a3]">{report.failureReason}</p>
            )}
            <p className="text-sm text-[#526c7b]">
              Your practice transcript is saved — nothing was lost.
            </p>
            <Button color="primary" onPress={() => router.push("/case-play")}>
              Back to practice
            </Button>
          </div>
        ) : timedOut ? (
          <div className="flex flex-col items-start gap-3">
            <p className="font-serif text-2xl text-[#102331]">This is taking longer than expected.</p>
            <p className="text-sm text-[#526c7b]">
              Your practice run is still being reviewed. You can check again in a moment.
            </p>
            <Button color="primary" onPress={handleCheckAgain}>
              Check again
            </Button>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-[#0a7391]">
              <Spinner size="sm" color="primary" />
              Reviewing your practice run…
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

/**
 * Compact strip rendering the scenario exactly as `report.scenario` snapshot
 * describes it — the DTO's snapshot block, never a live re-fetch of the case
 * from S3. This is what makes REQ-33 (truthful after the author edits the
 * scenario) and REQ-34 (still renders after the scenario is deleted) hold on
 * this page: nothing here can change because the live scenario changed.
 *
 * Criteria is shown only as a presence indicator, never its full text —
 * this is a compact snapshot strip, not a criteria viewer. Each character is
 * rendered as a `{name, role}` chip only; the DTO has already stripped any
 * hidden `additionalInfo` briefing before this component ever sees it.
 */
function ScenarioSnapshotStrip({
  scenario,
}: {
  scenario: ScenarioReportDTO["scenario"];
}) {
  return (
    <div className="mb-6 rounded-2xl border border-[#d4e2e9] bg-white p-5 shadow-[0_10px_30px_rgba(20,58,75,0.06)]">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#526c7b]">
        This scenario as it was when you practised
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
  completedAt,
}: {
  children: React.ReactNode;
  completedAt?: string | null;
}) {
  const router = useRouter();

  return (
    <main className="min-h-[100dvh] bg-[#f5f8fa] text-[#102331]">
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
        <button
          type="button"
          onClick={() => router.push("/case-play")}
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-[#58727f] transition-colors hover:text-[#0a7391]"
        >
          <ArrowLeft size={16} />
          Back to practice
        </button>
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#0a7391]">
          <Sparkles size={14} />
          Leadership Avatar Practice
        </div>
        <h1 className="mt-3 font-serif text-3xl tracking-[-0.03em] text-[#102331] sm:text-4xl">
          Your practice report
        </h1>
        {completedAt && (
          <p className="mt-2 text-sm text-[#58727f]">{new Date(completedAt).toLocaleString()}</p>
        )}

        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}
