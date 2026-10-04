"use client";

/**
 * No engagement indicator lives here or anywhere else. The avatar's interest
 * shows in dialogue only (locked decision). If you are adding a meter, stop.
 *
 * This component deliberately exposes no `onExpire` or `onTick` — CONTEXT.md
 * locks the cutoff as soft and "nothing hard-stops the student's turn", and
 * the cleanest way to guarantee that is for the timer to be structurally
 * incapable of telling anything else.
 *
 * Collapsing must not stop the interval or reset elapsed time — the tick
 * state lives above the collapsed/expanded chrome so a hide preference is
 * presentation only.
 */

import { Button } from "@heroui/button";
import { ChevronDown, ChevronUp, Clock3 } from "lucide-react";
import { useEffect, useState } from "react";

const COLLAPSE_STORAGE_KEY = "pitch-elevator:timer-collapsed";

export interface PitchTimerPanelProps {
  windowSeconds: number;
  /** Epoch ms when the student's opening turn began; null until they start. */
  turnStartedAt: number | null;
  phase: "pitching" | "followups";
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function readCollapsedPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(COLLAPSE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export default function PitchTimerPanel({
  windowSeconds,
  turnStartedAt,
  phase,
}: PitchTimerPanelProps) {
  const [now, setNow] = useState(() => Date.now());
  // Session-only collapse preference — UI chrome, not session data.
  const [collapsed, setCollapsed] = useState(() => readCollapsedPreference());

  // Keep ticking while pitching even when collapsed — collapse must not pause
  // or reset elapsed time (14-CONTEXT.md). Stopping the interval on followups
  // freezes the displayed duration without a second piece of state.
  useEffect(() => {
    if (phase !== "pitching" || turnStartedAt == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [phase, turnStartedAt]);

  const displayElapsed =
    turnStartedAt == null
      ? 0
      : Math.max(0, Math.floor((now - turnStartedAt) / 1000));

  const bandStart = Math.min(30, windowSeconds);
  let band: "under" | "target" | "past" = "under";
  let wording: string;
  if (phase === "followups") {
    wording = `Pitch: ${formatClock(displayElapsed)}`;
    band = displayElapsed > windowSeconds ? "past" : "target";
  } else if (turnStartedAt == null) {
    wording = `${windowSeconds}s window — starts when you begin`;
    band = "under";
  } else if (displayElapsed < bandStart) {
    wording = `${formatClock(displayElapsed)} — you have room`;
    band = "under";
  } else if (displayElapsed <= windowSeconds) {
    wording = `${formatClock(displayElapsed)} — in the ${bandStart}–${windowSeconds}s band`;
    band = "target";
  } else {
    wording = `${formatClock(displayElapsed)} — past the ${windowSeconds}-second window`;
    band = "past";
  }

  const tone =
    band === "past"
      ? "border-amber-400/50 bg-amber-500/15 text-amber-50"
      : band === "target"
        ? "border-white/25 bg-[#0f3a4f]/90 text-[#e7f5fb]"
        : "border-white/15 bg-[#07131f]/75 text-[#d3e7f5]";

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Preference is best-effort only.
      }
      return next;
    });
  };

  if (collapsed) {
    return (
      <div className="pointer-events-auto">
        <Button
          isIconOnly
          size="sm"
          variant="flat"
          className={`border backdrop-blur-md ${tone}`}
          aria-label="Show pitch timer"
          aria-expanded={false}
          onPress={toggleCollapsed}
        >
          <Clock3 size={16} />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={`pointer-events-auto flex min-w-[14rem] items-center gap-2 rounded-xl border px-3 py-2 shadow-lg backdrop-blur-md ${tone}`}
    >
      <Clock3 size={16} className="shrink-0 opacity-90" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">
          Pitch window
        </p>
        {/* aria-live=off: do not interrupt a screen reader every second. */}
        <p className="truncate text-sm font-medium" aria-live="off">
          {wording}
        </p>
      </div>
      <Button
        isIconOnly
        size="sm"
        variant="light"
        className="text-inherit"
        aria-label="Hide pitch timer"
        aria-expanded={true}
        onPress={toggleCollapsed}
      >
        {phase === "followups" ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </Button>
    </div>
  );
}
