"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";

import type { MasteryDTO } from "@/lib/mastery/mastery-dto";
import type { LevelResult } from "@/lib/mastery/levels";
import type { GoalProgress } from "@/lib/study-plan/goals";
import MasteryPanel from "@/components/mastery/MasteryPanel";

interface MasteryResponse {
  mastery: MasteryDTO;
  levels: Record<string, { current: LevelResult; lifetime: LevelResult }>;
  goals: GoalProgress;
  timeZone: string;
  error?: string;
}

type LoadState =
  | { status: "loading" }
  | { status: "needs-login" }
  | { status: "error"; message: string }
  | { status: "loaded"; data: MasteryResponse };

export default function MasteryPage() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const browserTimeZone =
        typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
      const response = await fetch("/api/mastery", {
        cache: "no-store",
        credentials: "include",
        headers: browserTimeZone ? { "x-timezone": browserTimeZone } : undefined,
      });
      if (response.status === 401) {
        setState({ status: "needs-login" });
        return;
      }
      const data = (await response.json().catch(() => ({}))) as MasteryResponse;
      if (!response.ok || !data.mastery || !data.goals) {
        setState({ status: "error", message: data.error || "We couldn't load your mastery data." });
        return;
      }
      setState({ status: "loaded", data });
    } catch {
      setState({ status: "error", message: "We couldn't load your mastery data." });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const intro =
    "Built from every scored live practice session (interviews, case studies, networking, pitches and difficult conversations) and every knowledge check, voice drill and coached session in your study paths.";

  if (state.status === "loaded") {
    return (
      <MasteryPanel
        goals={state.data.goals}
        intro={intro}
        levels={state.data.levels}
        mastery={state.data.mastery}
        timeZone={state.data.timeZone}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[28px] font-medium leading-[1.1] tracking-[-0.01em] text-cwru-blue md:text-[32px]">
          Mastery
        </h1>
        <p className="max-w-[65ch] text-[15px] text-muted">{intro}</p>
      </header>
      {state.status === "loading" ? (
        <div className="flex items-center justify-center rounded-2xl border border-line bg-white p-12">
          <Spinner color="current" />
        </div>
      ) : state.status === "needs-login" ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-white p-8 text-center">
          <p className="font-display text-2xl font-medium text-cwru-blue">Please sign in to view your mastery.</p>
          <Button color="primary" onPress={() => router.push("/login")}>
            Go to sign in
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-white p-8 text-center">
          <p className="font-display text-2xl font-medium text-cwru-blue">{state.message}</p>
          <Button color="primary" onPress={() => void load()}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}
