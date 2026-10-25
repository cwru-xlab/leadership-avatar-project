"use client";

/**
 * Job-posting step (quick task 003 / GitHub issue #56).
 *
 * Modelled on `ResumeStep.tsx` — same card chrome, same `nav` contract, same
 * Back / "Skip for now" / Continue footer, same `addToast` error surface.
 * Optional: skipping leaves the interview on the role and industry the student
 * already picked.
 *
 * Two intake paths, one callback: PASTE yields text with a null id; UPLOAD
 * yields both an opaque server-issued id and the extracted text. The
 * client-side PDF/size pre-checks below are a courtesy only — the server
 * (`lib/interview/document-intake.ts`) is the authority, and it checks the
 * actual `%PDF-` bytes rather than the browser's forgeable MIME type.
 *
 * The confirmation panel's claims are deliberately narrow. Quick task 003
 * decision 2: the posting is interviewer context only. It is NOT sent to the
 * evaluator and does NOT affect the report in this version, and the panel must
 * say so. Do not add promises of matching, gap analysis, keyword scoring, or
 * tailored feedback to this copy without shipping the behaviour first.
 */

import type { SetupStepNav } from "@/components/practice/SetupWizard";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Textarea } from "@heroui/input";
import { addToast } from "@heroui/toast";
import {
  ArrowRight,
  BriefcaseBusiness,
  FileCheck2,
  FileUp,
  Info,
} from "lucide-react";
import { type ChangeEvent, useState } from "react";

const MAX_JOB_DESCRIPTION_SIZE_BYTES = 10 * 1024 * 1024;
// This text is included in every chat turn, so keep the client payload aligned
// with the server's per-turn prompt ceiling.
const MAX_JOB_DESCRIPTION_TEXT_LENGTH = 60_000;

export interface JobDescriptionStepProps {
  nav: SetupStepNav;
  jobDescriptionId: string | null;
  jobDescriptionText: string;
  jobDescriptionFileName?: string;
  onJobDescriptionChange: (next: {
    jobDescriptionId: string | null;
    jobDescriptionText: string;
    jobDescriptionFileName?: string;
  }) => void;
}

export default function JobDescriptionStep({
  nav,
  jobDescriptionId,
  jobDescriptionText,
  jobDescriptionFileName,
  onJobDescriptionChange,
}: JobDescriptionStepProps) {
  const [uploading, setUploading] = useState(false);
  const [pasted, setPasted] = useState(
    jobDescriptionId ? "" : jobDescriptionText,
  );

  const attached = Boolean(jobDescriptionText.trim());

  const uploadJobDescription = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      addToast({ title: "Choose a PDF of the posting", color: "warning" });
      return;
    }
    if (file.size > MAX_JOB_DESCRIPTION_SIZE_BYTES) {
      addToast({
        title: "Your PDF must be 10 MB or smaller",
        color: "warning",
      });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(
        "/api/interview/upload-job-description",
        { method: "POST", body: formData },
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        jobDescriptionId?: string;
        jobDescriptionText?: string;
      };
      if (
        !response.ok ||
        !data.jobDescriptionId ||
        typeof data.jobDescriptionText !== "string"
      ) {
        throw new Error(data.error || "We could not process that PDF.");
      }
      setPasted("");
      onJobDescriptionChange({
        jobDescriptionId: data.jobDescriptionId,
        jobDescriptionText: data.jobDescriptionText
          .trim()
          .slice(0, MAX_JOB_DESCRIPTION_TEXT_LENGTH),
        jobDescriptionFileName: file.name,
      });
      addToast({ title: "Job posting ready", color: "success" });
    } catch (error) {
      addToast({
        title: "Job posting upload failed",
        description: error instanceof Error ? error.message : undefined,
        color: "danger",
      });
    } finally {
      setUploading(false);
    }
  };

  const savePasted = () => {
    const text = pasted.trim();
    if (!text) {
      addToast({ title: "Paste the posting first", color: "warning" });
      return;
    }
    onJobDescriptionChange({
      jobDescriptionId: null,
      jobDescriptionText: text.slice(0, MAX_JOB_DESCRIPTION_TEXT_LENGTH),
      jobDescriptionFileName: undefined,
    });
    addToast({ title: "Job posting ready", color: "success" });
  };

  const clearPosting = () => {
    setPasted("");
    onJobDescriptionChange({
      jobDescriptionId: null,
      jobDescriptionText: "",
      jobDescriptionFileName: undefined,
    });
  };

  return (
    <section
      className="mx-auto max-w-3xl"
      aria-labelledby="job-description-heading"
    >
      <div className="rounded-2xl border border-[#d4e2e9] bg-white p-6 shadow-[0_12px_32px_rgba(30,68,85,0.07)] sm:p-9">
        <div className="flex items-start gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e0f3f9] text-[#08718d]">
            <BriefcaseBusiness size={21} />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#0a7391]">
              Step {nav.stepNumber} of {nav.totalSteps}
            </p>
            <h2
              id="job-description-heading"
              className="mt-1 font-serif text-3xl tracking-[-0.03em]"
            >
              Practise for the actual posting.
            </h2>
            <p className="mt-3 max-w-xl text-[15px] leading-7 text-[#58727f]">
              Paste the job posting you are targeting, or upload it as a PDF.
              Your interviewer will use it to ask role-specific questions. This
              step is optional.
            </p>
          </div>
        </div>

        {attached ? (
          <div className="mt-7 space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-[#b7e3d4] bg-[#effaf5] p-4 text-[#185b49]">
              <FileCheck2 className="mt-0.5 shrink-0" size={20} />
              <div>
                <p className="font-semibold">
                  {jobDescriptionFileName ?? "Job posting attached"}
                </p>
                <p className="text-sm">
                  {jobDescriptionText.trim().length.toLocaleString()} characters
                  ready for this interview.
                </p>
              </div>
            </div>

            {/* The confirmation panel (issue #56, bullet 2). Every sentence
                here must be true of what actually shipped. */}
            <div
              className="rounded-xl border border-[#c6dbe4] bg-[#f6fbfd] p-4 text-[#2d4d5b]"
              aria-live="polite"
            >
              <div className="flex items-center gap-2 font-semibold text-[#0a7391]">
                <Info size={17} />
                <span>What this posting will and will not do</span>
              </div>
              <ul className="mt-3 space-y-2 text-sm leading-6">
                <li>
                  <span className="font-semibold">It will</span> be given to
                  your interviewer, who grounds the role-specific questions in
                  it and prefers its wording over the role and industry you
                  picked earlier when the two disagree.
                </li>
                <li>
                  <span className="font-semibold">It stays private.</span> A
                  PDF you upload is stored privately and is never shown to
                  other students.
                </li>
                <li>
                  <span className="font-semibold">It will not</span> be used to
                  score your report. In this version the posting is not sent to
                  the evaluator at all, so your feedback and scores come only
                  from your resume and the conversation.
                </li>
                <li>
                  <span className="font-semibold">If you skip it,</span> the
                  interview simply uses the role and industry you picked
                  earlier, and the interviewer invents no posting details.
                </li>
              </ul>
            </div>

            <Button variant="flat" onPress={clearPosting}>
              Use a different posting
            </Button>
          </div>
        ) : (
          <div className="mt-7 space-y-5">
            <div>
              <Textarea
                label="Paste the job posting"
                labelPlacement="outside"
                minRows={7}
                placeholder="Paste the responsibilities, requirements, and title from the posting…"
                maxLength={MAX_JOB_DESCRIPTION_TEXT_LENGTH}
                value={pasted}
                onValueChange={setPasted}
              />
              <div className="mt-3 flex justify-end">
                <Button
                  color="primary"
                  variant="flat"
                  isDisabled={uploading || !pasted.trim()}
                  onPress={savePasted}
                >
                  Use this posting
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-3 text-sm text-[#7b929d]">
              <span className="h-px flex-1 bg-[#e0eaee]" />
              or upload a PDF
              <span className="h-px flex-1 bg-[#e0eaee]" />
            </div>

            <label
              className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${uploading ? "border-[#a8c9d5] bg-[#f6fafb]" : "border-[#bad1db] hover:border-[#0a7391] hover:bg-[#f4fbfd]"}`}
            >
              {uploading ? (
                <Spinner color="primary" />
              ) : (
                <FileUp className="text-[#0a7391]" size={28} />
              )}
              <span className="mt-3 font-semibold">
                {uploading
                  ? "Reading your PDF…"
                  : "Upload the posting as a PDF"}
              </span>
              <span className="mt-1 text-sm text-[#617b88]">
                PDF only · up to 10 MB
              </span>
              <input
                className="sr-only"
                type="file"
                accept="application/pdf"
                disabled={uploading}
                onChange={uploadJobDescription}
              />
            </label>
          </div>
        )}

        <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-[#e0eaee] pt-6">
          <Button variant="light" onPress={nav.goBack}>
            Back
          </Button>
          <div className="flex gap-2">
            <Button
              variant="flat"
              onPress={() => {
                clearPosting();
                nav.goNext();
              }}
            >
              Skip for now
            </Button>
            <Button
              color="primary"
              isDisabled={uploading}
              endContent={<ArrowRight size={17} />}
              onPress={() => {
                // The footer is the primary exit path. Promote an unsaved
                // paste so it cannot silently disappear when the user
                // advances without first pressing "Use this posting".
                if (pasted.trim()) {
                  savePasted();
                }
                nav.goNext();
              }}
            >
              Continue
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
