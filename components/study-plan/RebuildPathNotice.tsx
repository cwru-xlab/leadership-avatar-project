"use client";

/**
 * Shown on a path the server marks `rebuildable` (pre-Phase-23 shape, never
 * started — lib/study-plan/legacy-path.ts). One click deletes it through
 * DELETE /path (which re-checks the rule) and generates a fresh one through
 * the existing POST, handing the result to the same callback a first-time
 * generation uses.
 */
import { useState } from "react";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { RefreshCw } from "lucide-react";

import type { PathViewDTO } from "@/components/study-plan/PathPanel";

export default function RebuildPathNotice({
  planId,
  onRebuilt,
}: {
  planId: string;
  onRebuilt: (path: PathViewDTO, degradedStepCount: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rebuild() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const removed = await fetch(`/api/study-plans/${planId}/path`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!removed.ok) {
        const body = (await removed.json().catch(() => ({}))) as { error?: string };
        setError(body.error || "We couldn't rebuild this path.");
        return;
      }
      const created = await fetch(`/api/study-plans/${planId}/path`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await created.json().catch(() => ({}))) as {
        path?: PathViewDTO;
        degradedSteps?: Array<{ position: number; competencyKey: string }>;
        error?: string;
      };
      if (!created.ok || !data.path) {
        setError(data.error || "The old path was removed, but a new one couldn't be generated. Reload to try again.");
        return;
      }
      onRebuilt(data.path, data.degradedSteps?.length ?? 0);
    } catch {
      setError("We couldn't rebuild this path. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-[#e0b062] bg-[#fdf7ec] p-4" data-testid="rebuild-path">
      <p className="text-sm font-semibold text-[#102331]">This path uses an older format.</p>
      <p className="mt-1 text-sm text-[#58727f]">
        It was built before voice drills and coached practice were added, and you haven&apos;t started it yet.
        Rebuild it to get the learn, drill, rework and prove steps for this plan&apos;s weak skills.
      </p>
      <Button
        className="mt-3"
        size="sm"
        color="primary"
        onPress={rebuild}
        isDisabled={busy}
        startContent={busy ? <Spinner size="sm" color="white" /> : <RefreshCw size={14} aria-hidden="true" />}
      >
        {busy ? "Rebuilding your path…" : "Rebuild this path"}
      </Button>
      {error ? (
        <p className="mt-2 text-sm text-danger-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
