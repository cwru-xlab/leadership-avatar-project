"use client";

/**
 * Resume-upload step, ported verbatim from `app/interview/[type]/page.tsx`.
 * Optional: "Skip for now" advances without a resume (nav.optional is true
 * for the interview resume declaration).
 *
 * A failed upload stays on screen until the next pick (toasts fade before a
 * student can act on them), and an attached resume can be replaced or
 * removed without leaving the step.
 *
 * A PDF over 4 MB is read in the browser and only its text is uploaded (see
 * `pdf-upload.ts`); the attached card says so, since only the text is kept.
 */

import type { SetupStepNav } from "@/components/practice/SetupWizard";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { addToast } from "@heroui/toast";
import { ArrowRight, FileCheck2, FileUp, RefreshCw, X } from "lucide-react";
import { type ChangeEvent, useState } from "react";

import {
  PDF_ACCEPT,
  isSignedOut,
  looksLikePdf,
  sendInterviewPdf,
  signInAgainHref,
  uploadFailureMessage,
} from "@/components/practice/steps/pdf-upload";

const MAX_RESUME_SIZE_BYTES = 10 * 1024 * 1024;
// Same wording the upload route uses for a scan.
const SCANNED_MESSAGE =
  "No readable text was found in that PDF. It looks like a scan or photo. Export your resume from Word, Google Docs or Pages as a PDF, then upload it.";

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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  // A PDF over the direct-upload size was read here and only its text saved.
  const [readOnDevice, setReadOnDevice] = useState(false);

  const uploadResume = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadError(null);
    setSignedOut(false);
    if (!looksLikePdf(file)) {
      setUploadError("Choose a PDF. Save or export your resume as a PDF, then upload it.");
      return;
    }
    if (file.size === 0) {
      setUploadError("That PDF is empty. Choose the saved resume file and try again.");
      return;
    }
    if (file.size > MAX_RESUME_SIZE_BYTES) {
      setUploadError("Your PDF must be 10 MB or smaller.");
      return;
    }

    setUploadingResume(true);
    try {
      const { response, data, readOnDevice: readHere } = await sendInterviewPdf<{
        resumeId?: string;
        resumeText?: string;
      }>(file, "/api/interview/upload-resume", {
        notPdf: "The uploaded file is not a valid PDF",
        scanned: SCANNED_MESSAGE,
      });
      if (!response.ok || !data.resumeId || typeof data.resumeText !== "string") {
        setSignedOut(isSignedOut(response));
        throw new Error(uploadFailureMessage(response, data.error));
      }
      setReadOnDevice(readHere);
      onResumeChange({
        resumeId: data.resumeId,
        resumeText: data.resumeText,
        resumeFileName: file.name,
      });
      addToast({ title: "Resume ready", color: "success" });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : uploadFailureMessage(null));
    } finally {
      setUploadingResume(false);
    }
  };

  const removeResume = () => {
    setUploadError(null);
    onResumeChange({ resumeId: null, resumeText: "", resumeFileName: undefined });
  };

  return (
    <section className="mx-auto max-w-3xl" aria-labelledby="resume-heading">
      <div className="rounded-xl border border-line bg-white p-6 sm:p-9">
        <div className="flex items-start gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-light-blue/32 text-link">
            <FileUp size={21} />
          </div>
          <div>
            <h2
              id="resume-heading"
              className="mt-1 font-display font-medium text-3xl tracking-[-0.03em]"
            >
              Bring your resume into the room
            </h2>
            <p className="mt-3 max-w-xl text-[15px] leading-7 text-muted">
              Your interviewer will ask grounded follow-ups about your
              experience. PDFs stay private and are never shown to other
              students.
            </p>
          </div>
        </div>

        {resumeId ? (
          <div className="mt-7 flex flex-col gap-3 rounded-xl border border-level-4/40 bg-level-4/10 p-4 text-level-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <FileCheck2 className="mt-0.5 shrink-0" size={20} />
              <div className="min-w-0">
                <p className="font-semibold [overflow-wrap:anywhere]">{resumeFileName}</p>
                <p className="text-sm">Parsed and ready for this interview.</p>
                {readOnDevice && (
                  <p className="text-sm">Large file, so it was read on this device and only its text was saved.</p>
                )}
              </div>
            </div>
            <div className="flex gap-1 pl-6 sm:pl-0">
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-link hover:bg-level-4/10 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-true-blue">
                {uploadingResume ? <Spinner size="sm" /> : <RefreshCw size={14} />}
                Replace
                <input
                  className="sr-only"
                  type="file"
                  accept={PDF_ACCEPT}
                  disabled={uploadingResume}
                  onChange={uploadResume}
                />
              </label>
              <Button
                size="sm"
                variant="light"
                isDisabled={uploadingResume}
                startContent={<X size={14} />}
                onPress={removeResume}
              >
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <label
            className={`mt-7 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-true-blue ${uploadingResume ? "pointer-events-none border-light-blue bg-canvas" : "border-line hover:border-true-blue hover:bg-canvas"}`}
          >
            {uploadingResume ? (
              <Spinner color="primary" />
            ) : (
              <FileUp className="text-link" size={28} />
            )}
            <span className="mt-3 font-semibold">
              {uploadingResume ? "Reading your PDF…" : "Upload a PDF resume"}
            </span>
            <span className="mt-1 text-sm text-muted">PDF only · up to 10 MB</span>
            <input
              className="sr-only"
              type="file"
              accept={PDF_ACCEPT}
              disabled={uploadingResume}
              onChange={uploadResume}
            />
          </label>
        )}

        {uploadError && !uploadingResume && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-level-2/40 bg-level-2/8 p-4 text-sm leading-6 text-copper-deep"
          >
            {uploadError}
            {signedOut && (
              <>
                {" "}
                <a className="font-semibold text-link underline" href={signInAgainHref()}>
                  Sign in again
                </a>
              </>
            )}
          </p>
        )}

        <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-line pt-6">
          <Button variant="light" isDisabled={uploadingResume} onPress={nav.goBack}>
            Back
          </Button>
          <div className="flex gap-2">
            <Button
              variant="flat"
              isDisabled={uploadingResume}
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
