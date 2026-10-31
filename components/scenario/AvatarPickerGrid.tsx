"use client";

/**
 * REQ-27: the character avatar picker is a card grid of preview images,
 * PORTED from the interviewer selection grid at
 * `app/interview/[type]/page.tsx` (~lines 284-309) — image-backed cards,
 * gradient overlay, hover/selected states, a `Check` badge on the selected
 * card. It is deliberately NOT a HeroUI drop-down component, which is what
 * the admin case editor (`app/case-management/[caseId]/page.tsx`) uses.
 *
 * The grid is sourced from `/api/interview/interviewers` — the SAME
 * HeyGen-backed LiveAvatar catalog students already see at
 * `/interview/general`. Admin-created `VideoAudioProfile` records
 * (formerly served by the now-deleted `/api/scenario/avatars`) are obsolete
 * as a student-facing catalog. Selection emits a raw LiveAvatar `avatarId`
 * paired with that avatar's OWN default `voiceId` — never a cross-paired
 * voice, matching Phase 2's interviewer-selection contract.
 */

import { useEffect, useState } from "react";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import { Button } from "@heroui/button";
import { Check, CircleAlert } from "lucide-react";

interface InterviewerOption {
  avatarId: string;
  name: string;
  previewUrl: string | null;
  voice: {
    id: string;
    name: string;
  };
}

interface AvatarSelection {
  avatarId: string;
  voiceId: string;
}

interface AvatarPickerGridProps {
  value: string | null;
  onChange: (selection: AvatarSelection) => void;
}

export default function AvatarPickerGrid({ value, onChange }: AvatarPickerGridProps) {
  const [interviewers, setInterviewers] = useState<InterviewerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    const loadInterviewers = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/interview/interviewers", {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await response.json().catch(() => ({}))) as {
          interviewers?: InterviewerOption[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error || "Could not load characters right now.");
        }
        if (!isCurrent) return;
        setInterviewers(data.interviewers ?? []);
      } catch (err) {
        if (!isCurrent) return;
        setError(
          err instanceof Error ? err.message : "Could not load characters right now."
        );
      } finally {
        if (isCurrent) setLoading(false);
      }
    };
    void loadInterviewers();
    return () => {
      isCurrent = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid min-h-60 place-items-center rounded-xl border border-line bg-white">
        <Spinner color="primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border border-danger-200 bg-danger-50 shadow-none">
        <CardBody className="gap-3 p-6 text-danger-800">
          <CircleAlert size={22} />
          <p>{error}</p>
          <Button size="sm" variant="flat" onPress={() => window.location.reload()}>
            Try again
          </Button>
        </CardBody>
      </Card>
    );
  }

  if (interviewers.length === 0) {
    return (
      <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-line bg-white p-6 text-center text-sm text-muted">
        No characters are available yet.
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {interviewers.map((interviewer) => {
        const selected = interviewer.avatarId === value;
        return (
          <button
            key={interviewer.avatarId}
            type="button"
            aria-pressed={selected}
            onClick={() =>
              onChange({ avatarId: interviewer.avatarId, voiceId: interviewer.voice.id })
            }
            className={`group relative min-h-60 overflow-hidden rounded-xl border text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-true-blue ${
              selected
                ? "border-true-blue bg-light-blue/22"
                : "border-line bg-white hover:border-true-blue/50 hover:shadow-md"
            }`}
          >
            {interviewer.previewUrl ? (
              <img
                src={interviewer.previewUrl}
                alt=""
                className="absolute inset-0 z-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
            ) : (
              <div className="absolute inset-0 z-0 bg-cwru-blue" />
            )}
            <div className="absolute inset-0 z-10 bg-gradient-to-t from-ink via-ink/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 z-20 p-5 text-white">
              <div className="mb-3 flex justify-between gap-2">
                <Chip size="sm" className="bg-white/18 text-white">
                  {interviewer.voice.name}
                </Chip>
                {selected && (
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-level-4 text-ink">
                    <Check size={15} />
                  </span>
                )}
              </div>
              <h3 className="font-display font-medium text-2xl">{interviewer.name}</h3>
              <p className="mt-1 text-sm text-white/78">Live character</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
