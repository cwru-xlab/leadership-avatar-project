"use client";

/**
 * Pitch-deck upload step — deliberately NOT built on ResumeStep and
 * deliberately NOT optional.
 *
 * 14-RESEARCH.md Pitfall 4: the wizard's generic step contract assumes fast,
 * mostly client-side steps. A deck upload is slow (upload + convert +
 * rasterize can take tens of seconds) and fails with specific reason+fix
 * messaging. ResumeStep is optional ("Skip for now"); this step has no skip
 * control and no "continue without a deck" path — a contributor copying
 * ResumeStep must not carry its `optional` flag across.
 *
 * Thumbnails never point at S3 URLs — only at the authenticated byte route
 * with `?v=thumb`.
 */

import type { SetupStepNav } from "@/components/practice/SetupWizard";
import { Button } from "@heroui/button";
import { Progress } from "@heroui/progress";
import { Spinner } from "@heroui/spinner";
import { ArrowRight, FileUp, Layers, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// Note: SetupWizard only mounts the active step, so returning here remounts
// with the wizard-owned `deck` prop and the initializer restores `ready`.

export type DeckSlideMeta = {
  index: number;
  widthPx: number;
  heightPx: number;
};

/** Wizard-owned deck payload — survives back/forward (reversible). */
export type DeckUploadValue = {
  deckId: string;
  slideCount: number;
  slides: DeckSlideMeta[];
};

type UploadPhase =
  | "idle"
  | "uploading"
  | "processing"
  | "ready"
  | "rejected"
  | "failed";

type ErrorParts = {
  error: string;
  fix: string;
};

export interface DeckUploadStepProps {
  nav: SetupStepNav;
  /** Wizard-owned value — must survive back/forward (reversible). */
  deck: DeckUploadValue | null;
  onChange: (deck: DeckUploadValue | null) => void;
}

const ACCEPT =
  ".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation";

function parseErrorBody(raw: unknown): ErrorParts {
  const body = (raw && typeof raw === "object" ? raw : {}) as {
    error?: unknown;
    fix?: unknown;
  };
  const error =
    typeof body.error === "string" && body.error.trim()
      ? body.error.trim()
      : "That deck could not be uploaded.";
  if (typeof body.fix !== "string" || !body.fix.trim()) {
    console.warn(
      "[DeckUploadStep] response missing `fix` field — rendering generic next action",
    );
    return {
      error,
      fix: "Choose a different PDF or PowerPoint (.pptx) file and try again.",
    };
  }
  return { error, fix: body.fix.trim() };
}

export default function DeckUploadStep({
  nav,
  deck,
  onChange,
}: DeckUploadStepProps) {
  // Reversibility: remount with wizard-owned `deck` restores ready (not idle).
  const [phase, setPhase] = useState<UploadPhase>(() =>
    deck ? "ready" : "idle",
  );
  const [uploadPct, setUploadPct] = useState(0);
  const [errorParts, setErrorParts] = useState<ErrorParts | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  useEffect(() => {
    return () => {
      xhrRef.current?.abort();
    };
  }, []);

  const resetToIdle = () => {
    xhrRef.current?.abort();
    xhrRef.current = null;
    onChange(null);
    setPhase("idle");
    setUploadPct(0);
    setErrorParts(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startUpload = (file: File) => {
    xhrRef.current?.abort();
    setErrorParts(null);
    setUploadPct(0);
    setPhase("uploading");
    onChange(null);

    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      setUploadPct(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };

    xhr.upload.onload = () => {
      // Bytes are on the wire; server still converts + rasterizes.
      setUploadPct(100);
      setPhase("processing");
    };

    xhr.onerror = () => {
      setPhase("failed");
      setErrorParts({
        error: "The upload could not reach the server.",
        fix: "Check your connection and try again with the same file.",
      });
    };

    xhr.onabort = () => {
      // resetToIdle / unmount owns the state transition.
    };

    xhr.onload = () => {
      const status = xhr.status;
      let raw: unknown = {};
      try {
        raw = JSON.parse(xhr.responseText || "{}");
      } catch {
        raw = {};
      }

      if (status === 201) {
        const data = raw as {
          deckId?: unknown;
          slideCount?: unknown;
          slides?: unknown;
        };
        if (
          typeof data.deckId !== "string" ||
          typeof data.slideCount !== "number" ||
          !Array.isArray(data.slides)
        ) {
          setPhase("failed");
          setErrorParts({
            error: "That deck uploaded, but the response was incomplete.",
            fix: "Try uploading again. If it keeps failing, export as PDF and retry.",
          });
          return;
        }
        const slides: DeckSlideMeta[] = data.slides
          .map((slide) => {
            const s = slide as {
              index?: unknown;
              widthPx?: unknown;
              heightPx?: unknown;
            };
            if (
              typeof s.index !== "number" ||
              typeof s.widthPx !== "number" ||
              typeof s.heightPx !== "number"
            ) {
              return null;
            }
            return {
              index: s.index,
              widthPx: s.widthPx,
              heightPx: s.heightPx,
            };
          })
          .filter((s): s is DeckSlideMeta => s !== null);

        if (slides.length === 0) {
          setPhase("failed");
          setErrorParts({
            error: "That deck uploaded, but no slides came back.",
            fix: "Try uploading again, or export the deck as a PDF and retry.",
          });
          return;
        }

        const value: DeckUploadValue = {
          deckId: data.deckId,
          slideCount: data.slideCount,
          slides,
        };
        onChange(value);
        setPhase("ready");
        return;
      }

      const parts = parseErrorBody(raw);
      setErrorParts(parts);
      if (status === 400) {
        setPhase("rejected");
      } else {
        setPhase("failed");
      }
    };

    xhr.open("POST", "/api/practice/deck/upload");
    xhr.send(formData);
  };

  const onFilePicked = (file: File | undefined) => {
    if (!file) return;
    startUpload(file);
  };

  const busy = phase === "uploading" || phase === "processing";
  const canAdvance = phase === "ready" && !!deck;

  const statusMessage = (() => {
    switch (phase) {
      case "uploading":
        return "Uploading your deck…";
      case "processing":
        return "Rendering your slides… this takes a few seconds for a large deck.";
      case "ready":
        return deck
          ? `${deck.slideCount} slide${deck.slideCount === 1 ? "" : "s"} ready.`
          : "Deck ready.";
      case "rejected":
      case "failed":
        return errorParts?.error ?? "Upload failed.";
      default:
        return "";
    }
  })();

  return (
    <section className="mx-auto max-w-3xl" aria-labelledby="deck-upload-heading">
      <div className="rounded-2xl border border-[#d4e2e9] bg-white p-6 shadow-[0_12px_32px_rgba(30,68,85,0.07)] sm:p-9">
        <div className="flex items-start gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e0f3f9] text-[#08718d]">
            <Layers size={21} />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#0a7391]">
              Step {nav.stepNumber} of {nav.totalSteps}
            </p>
            <h2
              id="deck-upload-heading"
              className="mt-1 font-serif text-3xl tracking-[-0.03em]"
            >
              Upload your pitch deck
            </h2>
            <p className="mt-3 max-w-xl text-[15px] leading-7 text-[#58727f]">
              PDF or PowerPoint (.pptx), up to 25MB. Using Google Slides? File →
              Download → PDF.
            </p>
          </div>
        </div>

        <div className="mt-7" aria-live="polite" aria-atomic="true">
          {(phase === "idle" || phase === "uploading" || phase === "processing") && (
            <label
              className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
                busy
                  ? "pointer-events-none border-[#a8c9d5] bg-[#f6fafb]"
                  : "border-[#bad1db] hover:border-[#0a7391] hover:bg-[#f4fbfd]"
              }`}
            >
              {busy ? (
                <Spinner color="primary" />
              ) : (
                <FileUp className="text-[#0a7391]" size={28} />
              )}
              <span className="mt-3 font-semibold">
                {phase === "uploading"
                  ? "Uploading your deck…"
                  : phase === "processing"
                    ? "Rendering your slides…"
                    : "Choose a PDF or PowerPoint file"}
              </span>
              <span className="mt-1 text-sm text-[#617b88]">
                PDF or PowerPoint (.pptx) · up to 25 MB
              </span>
              {phase === "uploading" && (
                <div className="mt-5 w-full max-w-sm px-2">
                  <Progress
                    aria-label="Upload progress"
                    value={uploadPct}
                    classNames={{
                      indicator: "bg-[#0a7391]",
                      track: "bg-[#d4e2e9]",
                    }}
                  />
                  <p className="mt-2 text-xs text-[#617b88]">{uploadPct}%</p>
                </div>
              )}
              {phase === "processing" && (
                <p className="mt-4 max-w-sm text-sm leading-6 text-[#58727f]">
                  Rendering your slides… this takes a few seconds for a large
                  deck.
                </p>
              )}
              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                accept={ACCEPT}
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  onFilePicked(file);
                }}
              />
            </label>
          )}

          {(phase === "rejected" || phase === "failed") && errorParts && (
            <div className="rounded-xl border border-[#f0c7b0] bg-[#fff7f2] p-5">
              <h3 className="font-semibold text-[#8a3b12]">
                {errorParts.error}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#6b4a38]">
                {errorParts.fix}
              </p>
              <Button
                className="mt-4"
                variant="flat"
                startContent={<RefreshCw size={16} />}
                onPress={resetToIdle}
              >
                Choose a different file
              </Button>
            </div>
          )}

          {phase === "ready" && deck && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#b7e3d4] bg-[#effaf5] px-4 py-3 text-[#185b49]">
                <p className="font-semibold">
                  {deck.slideCount} slide{deck.slideCount === 1 ? "" : "s"}
                </p>
                <Button
                  size="sm"
                  variant="light"
                  startContent={<RefreshCw size={14} />}
                  onPress={resetToIdle}
                >
                  Replace deck
                </Button>
              </div>
              <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
                {deck.slides.map((slide) => {
                  const maxH = 96;
                  const ratio =
                    slide.widthPx > 0 && slide.heightPx > 0
                      ? slide.widthPx / slide.heightPx
                      : 16 / 9;
                  const height = maxH;
                  const width = Math.round(height * ratio);
                  return (
                    // eslint-disable-next-line @next/next/no-img-element -- authenticated byte route, not a static asset
                    <img
                      key={slide.index}
                      src={`/api/practice/deck/${deck.deckId}/slide/${slide.index}?v=thumb`}
                      alt={`Slide ${slide.index + 1}`}
                      width={width}
                      height={height}
                      loading="lazy"
                      className="shrink-0 rounded-md border border-[#d4e2e9] bg-[#f0f5f7] object-contain"
                      style={{ width, height }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {statusMessage && phase !== "idle" && (
            <p className="sr-only">{statusMessage}</p>
          )}
        </div>

        <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-[#e0eaee] pt-6">
          <Button variant="light" onPress={nav.goBack} isDisabled={busy}>
            Back
          </Button>
          <Button
            color="primary"
            isDisabled={!canAdvance || busy}
            endContent={<ArrowRight size={17} />}
            onPress={nav.goNext}
          >
            Continue
          </Button>
        </div>
      </div>
    </section>
  );
}
