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
import { Card, CardBody } from "@heroui/card";
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
import { BookOpenCheck } from "lucide-react";

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
}: {
  reports: ReportDTO[];
  onSaved: (plan: StudyPlanSummaryDTO) => void;
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
      <Card className="border border-[#badbe5] bg-[linear-gradient(135deg,#ecf9fc,#ffffff)] shadow-[0_8px_24px_rgba(20,58,75,0.06)]">
        <CardBody className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0a7391] text-white"><BookOpenCheck size={22} /></div>
            <div>
              <h2 className="font-serif text-2xl text-[#102331]">Build a self-paced study plan</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[#58727f]">
                We&apos;ll identify recurring feedback themes from your completed interview reports and turn them into focused practice.
              </p>
              {eligibleReportCount < 1 && (
                <p className="mt-2 text-sm font-medium text-[#58727f]">Finish an interview with feedback to build a study plan.</p>
              )}
            </div>
          </div>
          <Button
            color="primary"
            size="lg"
            isDisabled={eligibleReportCount < 1 || generating}
            onPress={openPicker}
          >
            {generating ? <><Spinner color="current" size="sm" /> Creating plan</> : "Generate study plan"}
          </Button>
        </CardBody>
      </Card>

      <Modal isOpen={isPickerOpen} onOpenChange={onPickerOpenChange} scrollBehavior="inside" size="2xl">
        <ModalContent>
          {(onModalClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                Choose which interviews to use
              </ModalHeader>
              <ModalBody>
                <p className="text-xs font-medium text-[#58727f]">
                  {(selectedReportIds ?? []).length} of {Math.min(eligibleReportCount, MAX_REPORTS_PER_PLAN)} selected
                  {" "}· cap {MAX_REPORTS_PER_PLAN}
                </p>
                <p className="mt-1 text-sm text-[#58727f]">
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
                        className="flex items-center justify-between gap-3 rounded-xl border border-[#e3ebee] bg-[#f8fbfc] px-3 py-2"
                      >
                        <Checkbox
                          isSelected={isSelected}
                          isDisabled={atCap}
                          onValueChange={() => toggleReportSelection(report.id)}
                        >
                          <span className="text-sm text-[#102331]">
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
                          <span className="shrink-0 text-xs font-medium text-[#8298a3]">
                            Cap reached — deselect one first
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {actionError && (
                  <p role="alert" className="mt-2 rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
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

      {actionError && <p role="alert" className="mt-4 rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">{actionError}</p>}
      {savedNotice && <p role="status" className="mt-4 rounded-xl border border-success-200 bg-success-50 p-4 text-sm text-success-700">{savedNotice}</p>}

      {preview && (
        <section className="mt-6 rounded-2xl border-2 border-[#0a7391] bg-white p-5 shadow-[0_16px_40px_rgba(20,58,75,0.12)] sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0a7391]">Preview — not saved yet</p>
              <h2 className="mt-2 font-serif text-3xl text-[#102331]">{preview.content.title}</h2>
              <p className="mt-2 max-w-3xl leading-7 text-[#385463]">{preview.content.summary}</p>
              <p className="mt-2 text-xs text-[#58727f]">Based on {preview.sourceReportCount} completed {preview.sourceReportCount === 1 ? "report" : "reports"}.</p>
              {/* Honest accounting alongside the count above — how many of
                  ALL eligible interviews fed this plan. */}
              <p className="mt-1 text-xs text-[#58727f]">
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
