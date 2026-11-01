"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Spinner } from "@heroui/spinner";
import PracticeReportPage from "@/components/practice/routes/PracticeReportPage";
import type { ReportDTO } from "@/lib/report/dto";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; report: ReportDTO }
  | { status: "unauthorized" }
  | { status: "not-found" }
  | { status: "error" };

/** Canonical report route resolves once and delegates rendering to shared chrome. */
export default function CanonicalReportPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let current = true;
    setState({ status: "loading" });
    fetch(`/api/practice/report/${encodeURIComponent(reportId)}`, { credentials: "include", cache: "no-store" })
      .then(async (response) => ({ response, data: await response.json().catch(() => ({})) }))
      .then(({ response, data }) => {
        if (!current) return;
        if (response.status === 401) return setState({ status: "unauthorized" });
        if (response.status === 404) return setState({ status: "not-found" });
        if (!response.ok || !data.report || typeof data.report.typeSlug !== "string") return setState({ status: "error" });
        setState({ status: "ready", report: data.report as ReportDTO });
      })
      .catch(() => current && setState({ status: "error" }));
    return () => { current = false; };
  }, [reportId]);

  if (state.status === "ready") return <PracticeReportPage typeSlug={state.report.typeSlug} reportId={reportId} initialReport={state.report} />;
  if (state.status === "loading") return <div className="flex min-h-[50vh] items-center justify-center"><Spinner size="lg" /></div>;
  const message = state.status === "unauthorized" ? "Please sign in to view this report." : state.status === "not-found" ? "We couldn't find that report." : "We couldn't load that report. Please try again.";
  return <div className="flex min-h-[50vh] items-center justify-center p-6 text-danger">{message}</div>;
}
