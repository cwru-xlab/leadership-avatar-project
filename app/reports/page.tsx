"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Button } from "@heroui/button";
import { Sparkles } from "lucide-react";

import type { InterviewReportDTO } from "@/lib/interview/report-dto";

// Local, page-only label map. This page deliberately does not import
// lib/interactions (carries no interview-variant data) or lib/interview's
// internal type catalog (unnecessary here) — a small local map plus a
// title-cased fallback is enough for a list of reports.
const TYPE_LABELS: Record<string, string> = {
  general: "General Interview",
};

function typeLabel(typeSlug: string): string {
  return (
    TYPE_LABELS[typeSlug] ??
    typeSlug
      .split(/[-_]/)
      .filter(Boolean)
      .map((word) => word[0]!.toUpperCase() + word.slice(1))
      .join(" ")
  );
}

const STATUS_CHIP: Record<
  InterviewReportDTO["status"],
  { label: string; color: "success" | "warning" | "danger" | "default" }
> = {
  READY: { label: "Ready", color: "success" },
  PENDING: { label: "Pending", color: "warning" },
  FAILED: { label: "Failed", color: "danger" },
  // Never rendered — IN_PROGRESS rows are filtered server-side — but kept so
  // this map stays exhaustive against InterviewReportDTO["status"].
  IN_PROGRESS: { label: "In progress", color: "default" },
};

const SCORE_LABELS: Record<number, string> = {
  5: "Excellent",
  4: "Strong",
  3: "Solid",
  2: "Developing",
  1: "Needs work",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ScoreBadge({ label, score }: { label: string; score: number | null }) {
  if (score === null) {
    return (
      <div className="flex flex-col">
        <span className="text-[11px] uppercase tracking-wide text-[#8298a3]">{label}</span>
        <span className="text-sm font-medium text-[#8298a3]">Not yet measured</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-[#8298a3]">{label}</span>
      <span className="text-sm font-semibold text-[#102331]">
        {score}/5 <span className="font-normal text-[#526c7b]">{SCORE_LABELS[score] ?? ""}</span>
      </span>
    </div>
  );
}

export default function MyReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<InterviewReportDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/interview/reports", {
          cache: "no-store",
          credentials: "include",
        });

        if (response.status === 401) {
          if (!cancelled) setNeedsLogin(true);
          return;
        }

        const data = (await response.json().catch(() => ({}))) as {
          reports?: InterviewReportDTO[];
          error?: string;
        };

        if (!response.ok || !data.reports) {
          if (!cancelled) setError(data.error || "We couldn't load your reports.");
          return;
        }

        if (!cancelled) {
          setReports(data.reports);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("We couldn't load your reports.");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-[100dvh] bg-[#f5f8fa] text-[#102331]">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-10 lg:px-8">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#0a7391]">
          <Sparkles size={14} />
          Leadership Avatar Practice
        </div>
        <h1 className="mt-3 font-serif text-3xl tracking-[-0.03em] text-[#102331] sm:text-4xl">
          My Reports
        </h1>
        <p className="mt-2 text-sm text-[#58727f]">
          Every practice interview you&apos;ve finished, newest first.
        </p>

        <div className="mt-8">
          {needsLogin ? (
            <div className="rounded-2xl border border-[#d4e2e9] bg-white p-8 text-center shadow-[0_24px_60px_rgba(20,58,75,0.12)]">
              <p className="font-serif text-2xl text-[#102331]">Please sign in to view your reports.</p>
              <Button className="mt-5" color="primary" onPress={() => router.push("/login")}>
                Go to sign in
              </Button>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-[#d4e2e9] bg-white p-8 text-center shadow-[0_24px_60px_rgba(20,58,75,0.12)]">
              <p className="font-serif text-2xl text-[#102331]">{error}</p>
            </div>
          ) : reports === null ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-2xl border border-[#e3ebee] bg-white"
                />
              ))}
            </div>
          ) : reports.length === 0 ? (
            <div className="rounded-2xl border border-[#d4e2e9] bg-white p-8 text-center shadow-[0_24px_60px_rgba(20,58,75,0.12)]">
              <p className="font-serif text-2xl text-[#102331]">
                You haven&apos;t finished a practice session yet.
              </p>
              <p className="mt-2 text-sm text-[#58727f]">
                Start a practice interview and your report will show up here.
              </p>
              <Button className="mt-5" color="primary" onPress={() => router.push("/")}>
                Go to dashboard
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => {
                const chip = STATUS_CHIP[report.status];
                const date = report.completedAt ?? report.startedAt;
                return (
                  <Card
                    key={report.id}
                    isPressable
                    className="w-full border border-[#d4e2e9] shadow-[0_8px_24px_rgba(20,58,75,0.06)]"
                    onPress={() =>
                      router.push(`/interview/${report.typeSlug}/report/${report.id}`)
                    }
                  >
                    <CardBody className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-serif text-lg text-[#102331]">
                            {typeLabel(report.typeSlug)}
                          </span>
                          <Chip size="sm" color={chip.color} variant="flat">
                            {chip.label}
                          </Chip>
                        </div>
                        <p className="text-sm text-[#58727f]">
                          {report.interviewerName ? `With ${report.interviewerName}` : "—"}
                          {" · "}
                          {formatDate(date)}
                        </p>
                      </div>

                      <div className="flex gap-6">
                        <ScoreBadge label="Content" score={report.scores.content} />
                        <ScoreBadge label="Behavioral" score={report.scores.behavioral} />
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
