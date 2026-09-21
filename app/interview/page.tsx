"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import PresetCard from "@/components/interview/PresetCard";
import { listInterviewTypes } from "@/lib/interview/types";

/**
 * The preset picker index — a static sibling of the dynamic
 * `app/interview/[type]/page.tsx` wizard. `listInterviewTypes()` is imported
 * directly: presets are static in-repo data, so there is no fetch here
 * (unlike the interviewer catalog, which lives in HeyGen).
 *
 * `general` renders first because `listInterviewTypes()` returns it first —
 * this component does not re-sort the array.
 */
export default function InterviewPresetPickerPage() {
  const router = useRouter();
  const interviewTypes = listInterviewTypes();
  const [activeSlug, setActiveSlug] = useState<string>(interviewTypes[0]?.slug ?? "");

  return (
    <main className="min-h-[100dvh] bg-[#f5f8fa] text-[#102331]">
      <div className="relative isolate overflow-hidden border-b border-[#d8e6ec] bg-[#eaf5f8]">
        <div className="absolute -right-24 top-[-150px] h-96 w-96 rounded-full bg-[#a9ddeb]/60 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-5 pb-10 pt-7 sm:px-8 sm:pb-14">
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[#47616f] transition-colors hover:text-[#0a7391] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0a7391]"
            onClick={() => router.push("/")}
          >
            <ArrowLeft size={16} /> Back to practice
          </button>
          <p className="mt-8 text-xs font-bold uppercase tracking-[0.18em] text-[#0a7391]">
            Interview studio
          </p>
          <h1 className="mt-3 max-w-2xl font-serif text-4xl leading-[0.98] tracking-[-0.045em] text-[#102331] sm:text-5xl">
            Choose the interview that fits what you're preparing for.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#4e6977]">
            Every preset covers your background and behavioral stories. Pick one and start.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-12">
        <div className="grid gap-5 sm:grid-cols-2">
          {interviewTypes.map((interviewType) => {
            const active = interviewType.slug === activeSlug;
            return (
              <PresetCard
                key={interviewType.slug}
                interviewType={interviewType}
                active={active}
                onSelect={() => setActiveSlug(interviewType.slug)}
              >
                <div className="mt-4 flex justify-end">
                  <Button
                    color="primary"
                    endContent={<ArrowRight size={16} />}
                    onPress={() => router.push(`/interview/${interviewType.slug}`)}
                  >
                    Start
                  </Button>
                </div>
              </PresetCard>
            );
          })}
        </div>
      </div>
    </main>
  );
}
