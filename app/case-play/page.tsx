"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { ArrowLeft, Briefcase, PenLine, Plus } from "lucide-react";
import { title } from "@/components/primitives";
import CaseCard from "@/components/case-card";
import ScenarioCard from "@/components/scenario/ScenarioCard";
import type { CaseStudy } from "@/types";

export default function CasePlayIndexPage() {
  const router = useRouter();

  const [cases, setCases] = useState<CaseStudy[]>([]);
  const [casesLoading, setCasesLoading] = useState(true);
  const [casesError, setCasesError] = useState<string | null>(null);

  const [mine, setMine] = useState<CaseStudy[]>([]);
  const [shared, setShared] = useState<CaseStudy[]>([]);
  const [scenariosLoading, setScenariosLoading] = useState(true);
  const [scenariosError, setScenariosError] = useState<string | null>(null);

  const didLoad = useRef(false);

  const loadCases = useCallback(async () => {
    try {
      setCasesLoading(true);
      setCasesError(null);

      const response = await fetch("/api/case/list?publishedOnly=true", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to load case studies");
      }

      const data = await response.json();

      // Published student scenarios also live in the cases/ S3 prefix and
      // must never surface here — this is the second section's discriminator.
      const adminOnly = ((data.cases ?? []) as CaseStudy[]).filter(
        (c) => !c.ownerId
      );

      setCases(adminOnly);
    } catch (err) {
      console.error("Failed to load published cases:", err);
      setCasesError("Failed to load case studies. Please try again.");
    } finally {
      setCasesLoading(false);
    }
  }, []);

  const loadScenarios = useCallback(async () => {
    try {
      setScenariosLoading(true);
      setScenariosError(null);

      const response = await fetch("/api/scenario/list", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to load scenarios");
      }

      const data = await response.json();

      setMine((data.mine ?? []) as CaseStudy[]);
      setShared((data.shared ?? []) as CaseStudy[]);
    } catch (err) {
      console.error("Failed to load scenarios:", err);
      setScenariosError("Failed to load your scenarios. Please try again.");
    } finally {
      setScenariosLoading(false);
    }
  }, []);

  useEffect(() => {
    if (didLoad.current) return;
    didLoad.current = true;
    void loadCases();
    void loadScenarios();
  }, [loadCases, loadScenarios]);

  const handlePlay = (caseId: string) => {
    router.push(`/case-play/${caseId}`);
  };

  const hasAnyScenario = mine.length > 0 || shared.length > 0;

  return (
    <div className="space-y-10 py-2 md:py-4">
      <div className="flex flex-col gap-3">
        <Button
          variant="light"
          size="sm"
          startContent={<ArrowLeft className="w-4 h-4" />}
          onPress={() => router.push("/")}
          className="self-start -ml-2 text-default-600 data-[hover=true]:bg-transparent"
        >
          Back to Dashboard
        </Button>
        <h1 className={title({ fullWidth: true })}>Practice</h1>
      </div>

      {/* Section 1: student-authored scenarios */}
      <section aria-labelledby="scenarios-heading" className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2
              id="scenarios-heading"
              className="text-xl font-semibold text-default-900"
            >
              Practice scenarios
            </h2>
            <p className="text-sm text-default-500">
              Written by students — build your own roleplay, or practice one a
              classmate has shared.
            </p>
          </div>
          <Button
            color="primary"
            startContent={<Plus className="w-4 h-4" />}
            onPress={() => router.push("/case-play/new")}
          >
            Create a scenario
          </Button>
        </div>

        {scenariosLoading && (
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <Spinner size="lg" />
            <p className="text-default-500">Loading your scenarios...</p>
          </div>
        )}

        {!scenariosLoading && scenariosError && (
          <div className="p-4 bg-danger-50 border border-danger-200 rounded-lg text-danger-700">
            {scenariosError}
          </div>
        )}

        {!scenariosLoading && !scenariosError && hasAnyScenario && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {mine.map((scenario) => (
              <ScenarioCard
                key={scenario.id}
                scenario={scenario}
                owned
                onPlay={handlePlay}
                onChanged={loadScenarios}
              />
            ))}
            {shared.map((scenario) => (
              <ScenarioCard
                key={scenario.id}
                scenario={scenario}
                owned={false}
                onPlay={handlePlay}
                onChanged={loadScenarios}
              />
            ))}
          </div>
        )}

        {!scenariosLoading && !scenariosError && !hasAnyScenario && (
          <div className="text-center py-12 border border-dashed border-default-200 rounded-xl">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-default-100 flex items-center justify-center">
              <PenLine className="w-8 h-8 text-default-400" />
            </div>
            <p className="text-default-600 font-medium mb-1">
              You haven&apos;t created a scenario yet.
            </p>
            <p className="text-default-500 text-sm mb-4">
              Build a situation, cast your characters, and practice against it.
            </p>
            <Button
              color="primary"
              startContent={<Plus className="w-4 h-4" />}
              onPress={() => router.push("/case-play/new")}
            >
              Create a scenario
            </Button>
          </div>
        )}
      </section>

      {/* Section 2: admin-authored case studies */}
      <section aria-labelledby="case-studies-heading" className="space-y-4">
        <div>
          <h2
            id="case-studies-heading"
            className="text-xl font-semibold text-default-900"
          >
            Case studies
          </h2>
          <p className="text-sm text-default-500">
            Written and published by staff.
          </p>
        </div>

        {casesLoading && (
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <Spinner size="lg" />
            <p className="text-default-500">Loading case studies...</p>
          </div>
        )}

        {!casesLoading && casesError && (
          <div className="p-4 bg-danger-50 border border-danger-200 rounded-lg text-danger-700">
            {casesError}
          </div>
        )}

        {!casesLoading && !casesError && cases.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {cases.map((caseStudy) => (
              <CaseCard
                key={caseStudy.id}
                caseStudy={caseStudy}
                onClick={handlePlay}
              />
            ))}
          </div>
        )}

        {!casesLoading && !casesError && cases.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-default-100 flex items-center justify-center">
              <Briefcase className="w-8 h-8 text-default-400" />
            </div>
            <p className="text-default-600 font-medium mb-1">
              No case studies are available yet.
            </p>
            <p className="text-default-500 text-sm">
              Check back soon — new case studies are added regularly.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
