"use client";

/**
 * This static "new" segment lives inside the `[caseId]` dynamic tree, but
 * cannot collide with it: Next resolves the literal `new` segment before
 * the dynamic one, `lib/case-storage.ts` already throws if an admin case
 * name would slugify to the id "new", and `/api/scenario/add`'s
 * `scn-<slug>-<uuid8>` id generator (09-02) cannot produce a bare "new"
 * either. No page-level auth check is needed here: `middleware.ts` already
 * gates the `/case-play` prefix under `STUDENT_ROUTES`, matching this
 * codebase's convention of middleware-based page auth (see the Phase 7
 * rationale recorded for `/case-play` in STATE.md).
 */

import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { ArrowLeft } from "lucide-react";
import { title } from "@/components/primitives";
import ScenarioBuilder from "@/components/scenario/ScenarioBuilder";

export default function NewScenarioPage() {
  const router = useRouter();

  return (
    <div className="space-y-8 py-2 md:py-4">
      <div className="flex flex-col gap-3">
        <Button
          variant="light"
          size="sm"
          startContent={<ArrowLeft className="w-4 h-4" />}
          onPress={() => router.push("/case-play")}
          className="self-start -ml-2 text-default-600 data-[hover=true]:bg-transparent"
        >
          Back to scenarios
        </Button>
        <h1 className={title({ fullWidth: true })}>Create a scenario</h1>
        <p className="max-w-2xl text-default-500">
          Build a practice scenario step by step — your own situation,
          characters, and criteria.
        </p>
      </div>

      <ScenarioBuilder mode="create" />
    </div>
  );
}
