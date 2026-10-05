"use client";

/**
 * Resume-upload step, ported verbatim from `app/interview/[type]/page.tsx`.
 * Optional: "Skip for now" advances without a resume (nav.optional is true
 * for the interview resume declaration).
 */

import type { SetupStepNav } from "@/components/practice/SetupWizard";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { addToast } from "@heroui/toast";
import { ArrowRight, FileCheck2, FileUp } from "lucide-react";
import { type ChangeEvent, useState } from "react";

const MAX_RESUME_SIZE_BYTES = 10 * 1024 * 1024;

export interface ResumeStepProps {
  nav: SetupStepNav;
  resumeId: string | null;
  resumeFileName?: string;
  onResumeChange: (next: {
    resumeId: string | null;
    resumeText: string;
    resumeFileName?: string;
  }) => void;
}

export default function ResumeStep({
  nav,
  resumeId,
  resumeFileName,
  onResumeChange,
}: ResumeStepProps) {
  const [uploadingResume, setUploadingResume] = useState(false);

  const uploadResume = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      addToast({ title: "Choose a PDF resume", color: "warning" });
      return;
    }
    if (file.size > MAX_RESUME_SIZE_BYTES) {
      addToast({ title: "Your PDF must be 10 MB or smaller", color: "warning" });
      return;
    }

    setUploadingResume(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/interview/upload-resume", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        resumeId?: string;
        resumeText?: string;
      };
      if (!response.ok || !data.resumeId || typeof data.resumeText !== "string") {
        throw new Error(data.error || "We could not process that PDF.");
      }
      onResumeChange({
        resumeId: data.resumeId,
        resumeText: data.resumeText,
        resumeFileName: file.name,
      });
      addToast({ title: "Resume ready", color: "success" });
    } catch (error) {
      addToast({
        title: "Resume upload failed",
        description: error instanceof Error ? error.message : undefined,
        color: "danger",
      });
    } finally {
      setUploadingResume(false);
    }
  };

  return (
    <section className="mx-auto max-w-3xl" aria-labelledby="resume-heading">
      <div className="rounded-2xl border border-[#d4e2e9] bg-white p-6 shadow-[0_12px_32px_rgba(30,68,85,0.07)] sm:p-9">
        <div className="flex items-start gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e0f3f9] text-[#08718d]">
            <FileUp size={21} />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#0a7391]">
              Step {nav.stepNumber} of {nav.totalSteps}
            </p>
            <h2
              id="resume-heading"
              className="mt-1 font-serif text-3xl tracking-[-0.03em]"
            >
              Bring your resume into the room.
            </h2>
            <p className="mt-3 max-w-xl text-[15px] leading-7 text-[#58727f]">
              Your interviewer will ask grounded follow-ups about your
              experience. PDFs stay private and are never shown to other
              students.
            </p>
          </div>
        </div>

        {resumeId ? (
          <div className="mt-7 flex items-center gap-3 rounded-xl border border-[#b7e3d4] bg-[#effaf5] p-4 text-[#185b49]">
            <FileCheck2 size={20} />
            <div>
              <p className="font-semibold">{resumeFileName}</p>
              <p className="text-sm">Parsed and ready for this interview.</p>
            </div>
          </div>
        ) : (
          <label
            className={`mt-7 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${uploadingResume ? "border-[#a8c9d5] bg-[#f6fafb]" : "border-[#bad1db] hover:border-[#0a7391] hover:bg-[#f4fbfd]"}`}
          >
            {uploadingResume ? (
              <Spinner color="primary" />
            ) : (
              <FileUp className="text-[#0a7391]" size={28} />
            )}
            <span className="mt-3 font-semibold">
              {uploadingResume ? "Reading your PDF…" : "Upload a PDF resume"}
            </span>
            <span className="mt-1 text-sm text-[#617b88]">PDF only · up to 10 MB</span>
            <input
              className="sr-only"
              type="file"
              accept="application/pdf"
              disabled={uploadingResume}
              onChange={uploadResume}
            />
          </label>
        )}

        <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-[#e0eaee] pt-6">
          <Button variant="light" onPress={nav.goBack}>
            Back
          </Button>
          <div className="flex gap-2">
            <Button
              variant="flat"
              onPress={() => {
                onResumeChange({
                  resumeId: null,
                  resumeText: "",
                  resumeFileName: undefined,
                });
                nav.goNext();
              }}
            >
              Skip for now
            </Button>
            <Button
              color="primary"
              isDisabled={uploadingResume}
              endContent={<ArrowRight size={17} />}
              onPress={nav.goNext}
            >
              Continue
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
