"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Sparkles } from "lucide-react";

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

  return (
    <main className="min-h-[100dvh] bg-[#f5f8fa] text-[#102331]">
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-10 lg:px-8">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#0a7391]">
          <Sparkles size={14} />
          Leadership Avatar Practice
        </div>
        <h1 className="mt-3 font-serif text-3xl tracking-[-0.03em] text-[#102331] sm:text-4xl">
          Mastery
        </h1>
        <p className="mt-2 text-sm text-[#58727f]">
          Your overall standing and a per-competency breakdown, built from every scored live practice
          session (interviews, case studies, networking, pitches and difficult conversations) and
          every knowledge check, voice drill and coached session in your study paths.
        </p>

        <div className="mt-8">
          {state.status === "loading" ? (
            <div className="flex items-center justify-center rounded-2xl border border-[#d4e2e9] bg-white p-12 shadow-[0_24px_60px_rgba(20,58,75,0.12)]">
              <Spinner color="current" />
            </div>
          ) : state.status === "needs-login" ? (
            <div className="rounded-2xl border border-[#d4e2e9] bg-white p-8 text-center shadow-[0_24px_60px_rgba(20,58,75,0.12)]">
              <p className="font-serif text-2xl text-[#102331]">Please sign in to view your mastery.</p>
              <Button className="mt-5" color="primary" onPress={() => router.push("/login")}>
                Go to sign in
              </Button>
            </div>
          ) : state.status === "error" ? (
            <div className="rounded-2xl border border-[#d4e2e9] bg-white p-8 text-center shadow-[0_24px_60px_rgba(20,58,75,0.12)]">
              <p className="font-serif text-2xl text-[#102331]">{state.message}</p>
              <Button className="mt-5" color="primary" onPress={() => void load()}>
                Try again
              </Button>
            </div>
          ) : (
            <MasteryPanel
              mastery={state.data.mastery}
              levels={state.data.levels}
              goals={state.data.goals}
              timeZone={state.data.timeZone}
            />
          )}
        </div>
      </div>
    </main>
  );
}
