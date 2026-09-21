"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { addToast } from "@heroui/toast";
import { ArrowLeft, CircleAlert, Sparkles } from "lucide-react";

import ReportCustomizationStrip from "@/components/interview/ReportCustomizationStrip";
import ReportMarkdown from "@/components/interview/ReportMarkdown";
import ReportScoreCards from "@/components/interview/ReportScoreCards";
import type { InterviewReportDTO } from "@/lib/interview/report-dto";
import { REPORT_TERMINAL_STATUSES } from "@/lib/interview/report-dto";

// Typical evaluation lands in 15-40s. Poll every 2s while the report is
// still being produced, and give up at 2 minutes with a manual retry rather
// than polling forever.
const POLL_MS = 2000;
const POLL_GIVE_UP_MS = 120_000;

const nullScores = { visual: null, vocal: null, content: null, behavioral: null };

function isPollingStatus(status: InterviewReportDTO["status"] | undefined) {
  return status === "PENDING" || status === "IN_PROGRESS";
}

export default function InterviewReportPage() {
  const params = useParams<{ type: string; reportId: string }>();
  const router = useRouter();

  const [report, setReport] = useState<InterviewReportDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const startedAtRef = useRef<number>(Date.now());
  const reportRef = useRef<InterviewReportDTO | null>(null);
  reportRef.current = report;

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/interview/report/${params.reportId}`, {
        cache: "no-store",
      });

      if (response.status === 401) {
        setNeedsLogin(true);
        return;
      }

      if (response.status === 404) {
        setError("We couldn't find that report.");
        return;
      }

      const data = (await response.json().catch(() => ({}))) as {
        report?: InterviewReportDTO;
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

  // Initial load.
  useEffect(() => {
    void load();
  }, [load]);

  // Redirect to the canonical URL if the [type] segment in the address bar
  // disagrees with the report's stored typeSlug. reportId is the only thing
  // ownership depends on — never 404 on a mismatch, just redirect.
  useEffect(() => {
    if (report && report.typeSlug !== params.type) {
      router.replace(`/interview/${report.typeSlug}/report/${report.id}`);
    }
  }, [report, params.type, router]);

  // Poll every 2s only while the report is still being produced, and stop
  // the instant it reaches a terminal status or the give-up timer fires.
  useEffect(() => {
    if (!isPollingStatus(report?.status) || timedOut) {
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
  }, [report?.status, timedOut, load]);

  const handleCheckAgain = () => {
    startedAtRef.current = Date.now();
    setTimedOut(false);
    void load();
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const response = await fetch(`/api/interview/report/${params.reportId}/retry`, {
        method: "POST",
      });
      if (response.status !== 202) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
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

  const isPending = isPollingStatus(report?.status);
  const scores = report?.scores ?? nullScores;

  if (needsLogin) {
    return (
      <ReportShell onBackToReports={() => router.push("/reports")}>
        <div className="rounded-2xl border border-[#d4e2e9] bg-white p-8 text-center shadow-[0_24px_60px_rgba(20,58,75,0.12)]">
          <p className="font-serif text-2xl text-[#102331]">Please sign in to view this report.</p>
          <Button className="mt-5" color="primary" onPress={() => router.push("/login")}>
            Go to sign in
          </Button>
        </div>
      </ReportShell>
    );
  }

  if (error) {
    return (
      <ReportShell onBackToReports={() => router.push("/reports")}>
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-[#d4e2e9] bg-white p-8 shadow-[0_24px_60px_rgba(20,58,75,0.12)]">
          <CircleAlert className="text-[#0a7391]" size={26} />
          <p className="font-serif text-2xl text-[#102331]">{error}</p>
          <Button color="primary" onPress={() => router.push("/")}>
            Back to practice
          </Button>
        </div>
      </ReportShell>
    );
  }

  return (
    <ReportShell
      interviewerName={report?.interviewerName ?? null}
      completedAt={report?.completedAt ?? null}
      onBackToReports={() => router.push("/reports")}
      onBack={() => router.push("/")}
      onPracticeAgain={() => router.push(`/interview/${params.type}`)}
    >
      {report && (report.status === "READY" || report.status === "FAILED") && (
        <div className="mb-6">
          <ReportCustomizationStrip typeSlug={report.typeSlug} customization={report.customization} />
        </div>
      )}

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
              Your interview transcript is saved — nothing was lost.
            </p>
            <Button color="primary" isLoading={retrying} onPress={() => void handleRetry()}>
              Try again
            </Button>
          </div>
        ) : timedOut ? (
          <div className="flex flex-col items-start gap-3">
            <p className="font-serif text-2xl text-[#102331]">This is taking longer than expected.</p>
            <p className="text-sm text-[#526c7b]">
              Your interview is still being reviewed. You can check again in a moment.
            </p>
            <Button color="primary" onPress={handleCheckAgain}>
              Check again
            </Button>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-[#0a7391]">
              <Spinner size="sm" color="primary" />
              Reviewing your interview…
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

function ReportShell({
  children,
  interviewerName,
  completedAt,
  onBackToReports,
  onBack,
  onPracticeAgain,
}: {
  children: React.ReactNode;
  interviewerName?: string | null;
  completedAt?: string | null;
  onBackToReports?: () => void;
  onBack?: () => void;
  onPracticeAgain?: () => void;
}) {
  return (
    <main className="min-h-[100dvh] bg-[#f5f8fa] text-[#102331]">
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
        {onBackToReports && (
          <button
            type="button"
            onClick={onBackToReports}
            className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-[#58727f] transition-colors hover:text-[#0a7391]"
          >
            <ArrowLeft size={16} />
            Back to my reports
          </button>
        )}
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#0a7391]">
          <Sparkles size={14} />
          CaseBridge Practice
        </div>
        <h1 className="mt-3 font-serif text-3xl tracking-[-0.03em] text-[#102331] sm:text-4xl">
          Your interview report
        </h1>
        {(interviewerName || completedAt) && (
          <p className="mt-2 text-sm text-[#58727f]">
            {interviewerName ? `With ${interviewerName}` : null}
            {interviewerName && completedAt ? " · " : null}
            {completedAt ? new Date(completedAt).toLocaleString() : null}
          </p>
        )}

        <div className="mt-8">{children}</div>

        {(onBack || onPracticeAgain) && (
          <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-[#e0eaee] pt-6">
            {onBack && (
              <Button variant="flat" onPress={onBack}>
                Back to practice
              </Button>
            )}
            {onPracticeAgain && (
              <Button color="primary" onPress={onPracticeAgain}>
                Practice again
              </Button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
