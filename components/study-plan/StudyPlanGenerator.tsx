"use client";

/**
 * The "Generate study plan" flow — call-to-action card, interview picker
 * modal, unsaved preview and save — extracted verbatim from
 * `app/reports/page.tsx` so `/reports` and `/study-plans` share ONE
 * implementation instead of two copies drifting apart.
 *
 * The caller owns the reports list (it already fetches it for its own
 * purposes) and is told about a successful save through `onSaved`, so it can
 * prepend the new plan to whatever list it renders.
 */
import { useEffect, useMemo, useState } from "react";
import { Checkbox } from "@heroui/checkbox";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";

import type { ReportDTO } from "@/lib/report/dto";
import { typeLabelForReport } from "@/lib/report/title";
import type { StudyPlanDTO, StudyPlanSummaryDTO } from "@/lib/study-plan/plan-dto";
import type { StudyPlanContent } from "@/lib/study-plan/types";
import PlanContent from "@/components/study-plan/PlanContent";

/** Study-plan generation still uses interview feedback only. */
export const INTERVIEW_TYPE_SLUGS = new Set([
  "general",
  "technical",
  "consulting",
  "early-career",
]);

export function scoreOf(report: ReportDTO, key: string): number | null {
  const value = report.scores?.[key];
  return typeof value === "number" ? value : null;
}

interface GeneratedPreview {
  content: StudyPlanContent;
  draftToken: string;
  sourceReportCount: number;
  consideredReportCount: number;
  eligibleReportCount: number;
}

/** Mirrors `MAX_REPORTS_PER_PLAN` exported from the generate route — kept as
 * a literal here rather than imported because that route file is
 * server-only and this is a client component. */
const MAX_REPORTS_PER_PLAN = 10;

interface SelectableReport {
  id: string;
  typeSlug: string;
  completedAt: string | null;
  contentScore: number | null;
  behavioralScore: number | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function StudyPlanGenerator({
  reports,
  onSaved,
  aside,
}: {
  reports: ReportDTO[];
  onSaved: (plan: StudyPlanSummaryDTO) => void;
  /** Rendered beside the primary button, e.g. a link to saved plans. */
  aside?: React.ReactNode;
}) {
  const [preview, setPreview] = useState<GeneratedPreview | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // quick-006: the picker opens as a modal, as an intermediate step after
  // pressing "Generate study plan". Generation itself happens from inside it.
  const { isOpen: isPickerOpen, onOpen: openPicker, onOpenChange: onPickerOpenChange, onClose: closePicker } = useDisclosure();

  const eligibleReportCount = useMemo(
    () =>
      reports.filter(
        (report) =>
          INTERVIEW_TYPE_SLUGS.has(report.typeSlug) &&
          report.status === "READY" &&
          Boolean(report.reportMarkdown?.trim()),
      ).length,
    [reports],
  );

  // The picker needs the eligible rows themselves (type, date, score), not
  // just the count above.
  const eligibleReports = useMemo<SelectableReport[]>(
    () =>
      reports
        .filter(
          (report) =>
            INTERVIEW_TYPE_SLUGS.has(report.typeSlug) &&
            report.status === "READY" &&
            Boolean(report.reportMarkdown?.trim()),
        )
        .map((report) => ({
          id: report.id,
          typeSlug: report.typeSlug,
          completedAt: report.completedAt ?? report.startedAt ?? null,
          contentScore: scoreOf(report, "content"),
          behavioralScore: scoreOf(report, "behavioral"),
        }))
        // Most recent first, matching the route's default-selection ordering.
        .sort((a, b) => {
          const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
          const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
          return bTime - aTime;
        }),
    [reports],
  );

  // Selection for the study-plan picker. `null` means "no explicit selection
  // made yet" — initialized to the most recent MAX_REPORTS_PER_PLAN once
  // `eligibleReports` is available, so the primary action works with zero
  // interaction.
  const [selectedReportIds, setSelectedReportIds] = useState<string[] | null>(null);

  useEffect(() => {
    if (eligibleReports.length === 0) return;
    setSelectedReportIds((current) => {
      if (current !== null) {
        // Keep the selection valid as the eligible set changes by dropping
        // ids that are no longer eligible.
        const stillEligible = current.filter((id) =>
          eligibleReports.some((r) => r.id === id),
        );
        return stillEligible.length > 0 ? stillEligible : current;
      }
      return eligibleReports.slice(0, MAX_REPORTS_PER_PLAN).map((r) => r.id);
    });
  }, [eligibleReports]);

  function toggleReportSelection(reportId: string) {
    setSelectedReportIds((current) => {
      const base = current ?? eligibleReports.slice(0, MAX_REPORTS_PER_PLAN).map((r) => r.id);
      if (base.includes(reportId)) {
        return base.filter((id) => id !== reportId);
      }
      if (base.length >= MAX_REPORTS_PER_PLAN) return base;
      return [...base, reportId];
    });
  }

  /** Returns whether generation succeeded, so the modal caller can close
   * itself only on success — a failure keeps the modal open with the error
   * visible, rather than closing and hiding it. */
  async function generatePlan(): Promise<boolean> {
    if (generating || eligibleReportCount < 1) return false;
    setGenerating(true);
    setActionError(null);
    setSavedNotice(null);
    try {
      const reportIds =
        selectedReportIds ?? eligibleReports.slice(0, MAX_REPORTS_PER_PLAN).map((r) => r.id);
      const response = await fetch("/api/study-plans/generate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportIds }),
      });
      const data = (await response.json().catch(() => ({}))) as Partial<GeneratedPreview> & {
        error?: string;
        code?: string;
      };
      if (!response.ok || !data.content || !data.draftToken || !data.sourceReportCount) {
        setActionError(
          data.code === "NO_COMPLETED_REPORTS"
            ? "Finish at least one interview with feedback before generating a study plan."
            : data.error || "We couldn't generate your study plan. Please try again."
        );
        return false;
      }
      setPreview({
        content: data.content,
        draftToken: data.draftToken,
        sourceReportCount: data.sourceReportCount,
        consideredReportCount: data.consideredReportCount ?? data.sourceReportCount,
        eligibleReportCount: data.eligibleReportCount ?? data.sourceReportCount,
      });
      return true;
    } catch {
      setActionError("We couldn't generate your study plan. Please try again.");
      return false;
    } finally {
      setGenerating(false);
    }
  }

  /** Modal-only wrapper: generates, then closes the picker modal on success
   * so the preview is immediately visible. */
  async function generateFromPicker() {
    const ok = await generatePlan();
    if (ok) closePicker();
  }

  async function savePlan() {
    if (!preview || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      const response = await fetch("/api/study-plans", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftToken: preview.draftToken }),
      });
      const data = (await response.json().catch(() => ({}))) as { plan?: StudyPlanDTO; error?: string };
      if (!response.ok || !data.plan) {
        setActionError(data.error || "We couldn't save this study plan. Please try again.");
        return;
      }
      const summary: StudyPlanSummaryDTO = {
        id: data.plan.id,
        title: data.plan.title,
        sourceReportCount: data.plan.sourceReportCount,
        savedAt: data.plan.savedAt,
        summary: data.plan.summary,
        priorityThemes: data.plan.priorityThemes,
      };
      onSaved(summary);
      setPreview(null);
      setSavedNotice("Study plan saved to your history.");
    } catch {
      setActionError("We couldn't save this study plan. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="flex flex-col gap-4 rounded-xl border border-light-blue/70 bg-light-blue/32 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex max-w-2xl flex-col gap-1">
          <h2 className="font-display text-[22px] font-medium leading-[1.15] text-cwru-blue">
            Build a self-paced study plan
          </h2>
          <p className="text-sm leading-6 text-muted">
            We&apos;ll identify recurring feedback themes from your completed interview reports and turn them into focused practice.
          </p>
          {eligibleReportCount < 1 && (
            <p className="text-sm font-semibold text-ink">Finish an interview with feedback to build a study plan.</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2">
          {aside}
          <Button
            className="h-11 rounded-lg font-semibold"
            color="primary"
            isDisabled={eligibleReportCount < 1 || generating}
            onPress={openPicker}
          >
            {generating ? <><Spinner color="current" size="sm" /> Creating plan</> : "Generate study plan"}
          </Button>
        </div>
      </section>

      <Modal isOpen={isPickerOpen} onOpenChange={onPickerOpenChange} scrollBehavior="inside" size="2xl">
        <ModalContent>
          {(onModalClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                Choose which interviews to use
              </ModalHeader>
              <ModalBody>
                <p className="text-xs font-medium text-muted">
                  {(selectedReportIds ?? []).length} of {Math.min(eligibleReportCount, MAX_REPORTS_PER_PLAN)} selected
                  {" "}· cap {MAX_REPORTS_PER_PLAN}
                </p>
                <p className="mt-1 text-sm text-muted">
                  The most recent {Math.min(eligibleReportCount, MAX_REPORTS_PER_PLAN)} are preselected. Deselect any and pick others instead.
                </p>
                <div className="mt-4 max-h-96 space-y-2 overflow-y-auto pr-1">
                  {eligibleReports.map((report) => {
                    const isSelected = (selectedReportIds ?? []).includes(report.id);
                    const atCap =
                      !isSelected && (selectedReportIds ?? []).length >= MAX_REPORTS_PER_PLAN;
                    return (
                      <div
                        key={report.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-line bg-canvas px-3 py-2"
                      >
                        <Checkbox
                          isSelected={isSelected}
                          isDisabled={atCap}
                          onValueChange={() => toggleReportSelection(report.id)}
                        >
                          <span className="text-sm text-ink">
                            {typeLabelForReport(report.typeSlug)}
                            {" · "}
                            {report.completedAt ? formatDate(report.completedAt) : "Date unknown"}
                            {report.contentScore !== null
                              ? ` · Content ${report.contentScore}/5`
                              : ""}
                            {report.behavioralScore !== null
                              ? ` · Behavioral ${report.behavioralScore}/5`
                              : ""}
                          </span>
                        </Checkbox>
                        {atCap && (
                          <span className="shrink-0 text-xs font-medium text-muted">
                            Cap reached — deselect one first
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {actionError && (
                  <p role="alert" className="mt-2 rounded-lg border border-copper/40 bg-copper/[0.08] p-4 text-sm text-ink">
                    {actionError}
                  </p>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onModalClose}>Cancel</Button>
                <Button color="primary" isDisabled={generating} onPress={generateFromPicker}>
                  {generating ? <><Spinner color="current" size="sm" /> Creating plan</> : "Generate study plan"}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {actionError && <p role="alert" className="mt-4 rounded-lg border border-copper/40 bg-copper/[0.08] p-4 text-sm text-ink">{actionError}</p>}
      {savedNotice && <p role="status" className="mt-4 rounded-lg border border-level-4/40 bg-level-4/[0.08] p-4 text-sm text-ink">{savedNotice}</p>}

      {preview && (
        <section className="mt-6 rounded-xl border border-line bg-white p-5 shadow-raised sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="w-fit rounded-full bg-level-2/16 px-2.5 py-1 text-xs font-semibold text-ink">Preview, not saved yet</p>
              <h2 className="mt-3 font-display text-[26px] font-medium leading-[1.15] text-cwru-blue">{preview.content.title}</h2>
              <p className="mt-2 max-w-3xl leading-7 text-ink">{preview.content.summary}</p>
              <p className="mt-2 text-xs text-muted">Based on {preview.sourceReportCount} completed {preview.sourceReportCount === 1 ? "report" : "reports"}.</p>
              {/* Honest accounting alongside the count above — how many of
                  ALL eligible interviews fed this plan. */}
              <p className="mt-1 text-xs text-muted">
                Built from {preview.consideredReportCount} of your {preview.eligibleReportCount} completed {preview.eligibleReportCount === 1 ? "interview" : "interviews"}.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="flat" onPress={() => setPreview(null)}>Discard</Button>
              <Button color="primary" isDisabled={saving} onPress={savePlan}>{saving ? "Saving…" : "Save plan"}</Button>
            </div>
          </div>
          <div className="mt-7"><PlanContent content={preview.content} /></div>
        </section>
      )}
    </>
  );
}
