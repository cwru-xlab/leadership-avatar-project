"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Briefcase, Clock3, FileChartColumn, Play, UserRound } from "lucide-react";
import PracticeHero from "@/components/practice/PracticeHero";
import PresetCard from "@/components/interview/PresetCard";
import CustomizePanel from "@/components/interview/CustomizePanel";
import { listInterviewTypes } from "@/lib/interview/types";
import type { InterviewCustomizationInput } from "@/lib/interview/customization";

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
  const [customization, setCustomization] = useState<InterviewCustomizationInput | undefined>(
    undefined
  );
  const [customized, setCustomized] = useState(false);

  const handleStart = (slug: string) => {
    // Handoff contract with app/practice/[type]/page.tsx: that page reads
    // `interview:customization:{slug}` from sessionStorage ONCE on mount and
    // removes it immediately, so a mid-wizard refresh falls back cleanly to
    // preset defaults rather than silently reusing stale settings. Nothing
    // is written here if the student never opened the Customize panel — the
    // absence of the key IS the "use preset defaults" signal.
    if (customized && customization) {
      try {
        sessionStorage.setItem(`interview:customization:${slug}`, JSON.stringify(customization));
      } catch {
        // Private-mode / storage failures degrade to preset defaults rather
        // than blocking the start.
      }
    }
    router.push(`/practice/${slug}`);
  };

  return (
    <div className="flex flex-col gap-6">
      <PracticeHero
        description="A live AI interviewer asks, follows up and scores you. Pick a preset and start, or open Customize to adjust industry, role, difficulty, length or the interviewer's personality first."
        facts={[
          { icon: Clock3, label: "About 20 min" },
          { icon: UserRound, label: "Live avatar" },
          { icon: FileChartColumn, label: "Scored report" },
        ]}
        icon={Briefcase}
        title="Interview practice"
      />

      <div className="grid gap-4 md:grid-cols-2">
        {interviewTypes.map((interviewType) => {
          const active = interviewType.slug === activeSlug;
          return (
            <PresetCard
              key={interviewType.slug}
              interviewType={interviewType}
              active={active}
              onSelect={() => {
                setActiveSlug(interviewType.slug);
                setCustomized(false);
                setCustomization(undefined);
              }}
            >
              <CustomizePanel
                interviewType={interviewType}
                onChange={(input) => {
                  setCustomized(true);
                  setCustomization(input);
                }}
              />
              <div className="flex justify-end">
                <Button
                  className="h-11 rounded-lg px-5 font-bold"
                  color="primary"
                  startContent={<Play size={16} strokeWidth={2.5} />}
                  onPress={() => handleStart(interviewType.slug)}
                >
                  Start interview
                </Button>
              </div>
            </PresetCard>
          );
        })}
      </div>
    </div>
  );
}
