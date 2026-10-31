"use client";

import { useEffect, useState } from "react";

/** The coach's portrait from the interviewer roster Settings uses; null until found. */
export function useCoachPortrait(avatarId: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!avatarId) return;
    let cancelled = false;
    fetch("/api/interview/interviewers", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { interviewers: [] }))
      .then((data: { interviewers?: Array<{ avatarId: string; previewUrl: string | null }> }) => {
        const match = data.interviewers?.find((o) => o.avatarId === avatarId);
        if (!cancelled) setUrl(match?.previewUrl ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [avatarId]);
  return url;
}
