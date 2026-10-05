"use client";

/**
 * Soft session envelope timer for investor pitch-deck.
 *
 * Deliberately exposes no callbacks (`onExpire`, `onTimeUp`, etc.) — CONTEXT.md
 * locks the envelope as soft, and a component that cannot report cannot be
 * wired to a cutoff. Collapse does not pause or reset the tick.
 *
 * No engagement indicator lives here or anywhere else.
 */

import { Button } from "@heroui/button";
import { ChevronUp, Clock3 } from "lucide-react";
import { useEffect, useState } from "react";

const COLLAPSE_STORAGE_KEY = "pitch-deck:timer-collapsed";
const WARN_AT_REMAINING_SECONDS = 300;

export interface DeckTimerPanelProps {
  budgetSeconds: number;
  /** Epoch ms when the live session began. */
  sessionStartedAt: number;
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

export default function DeckTimerPanel({
  budgetSeconds,
  sessionStartedAt,
}: DeckTimerPanelProps) {
  const [now, setNow] = useState(() => Date.now());
  // Session-only collapse preference — UI chrome, not session data.
  const [collapsed, setCollapsed] = useState(() => readCollapsedPreference());

  // Keep ticking even when collapsed — collapse must not pause or reset.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsedSeconds = Math.max(
    0,
    Math.floor((now - sessionStartedAt) / 1000),
  );
  const remaining = budgetSeconds - elapsedSeconds;
  const overrun = Math.max(0, -remaining);

  let band: "plenty" | "warn" | "over" = "plenty";
  let wording: string;
  let detail: string | null = null;

  if (remaining > WARN_AT_REMAINING_SECONDS) {
    band = "plenty";
    wording = formatClock(remaining);
  } else if (remaining > 0) {
    band = "warn";
    wording = `${formatClock(remaining)} left`;
  } else {
    band = "over";
    wording = `+${formatClock(overrun)} over`;
    detail =
      "You're past the scheduled time — keep going if you need to. The overrun will be noted in your report.";
  }

  const tone =
    band === "over"
      ? "border-amber-400/50 bg-amber-500/15 text-amber-50"
      : band === "warn"
        ? "border-amber-300/40 bg-amber-500/10 text-amber-50"
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
          aria-expanded={false}
          aria-label="Show session timer"
          className={`border backdrop-blur-md ${tone}`}
          size="sm"
          variant="flat"
          onPress={toggleCollapsed}
        >
          <Clock3 size={16} />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={`pointer-events-auto flex w-full min-w-[16rem] max-w-[22rem] items-start gap-2 rounded-xl border px-3 py-2 shadow-lg backdrop-blur-md ${tone}`}
    >
      <Clock3 aria-hidden className="mt-0.5 shrink-0 opacity-90" size={16} />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">
          Session time
        </p>
        {/* aria-live=off: do not interrupt a screen reader every second. */}
        <p aria-live="off" className="text-sm font-medium leading-snug">
          {wording}
        </p>
        {detail ? (
          <p className="mt-1 text-xs leading-snug opacity-90">{detail}</p>
        ) : null}
      </div>
      <Button
        isIconOnly
        aria-expanded={true}
        aria-label="Hide session timer"
        className="text-inherit"
        size="sm"
        variant="light"
        onPress={toggleCollapsed}
      >
        <ChevronUp size={16} />
      </Button>
    </div>
  );
}
