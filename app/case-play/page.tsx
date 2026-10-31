"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { ArrowLeft, Briefcase, PenLine, Plus, Users } from "lucide-react";
import CaseCard from "@/components/case-card";
import ScenarioCard from "@/components/scenario/ScenarioCard";
import type { CaseStudy } from "@/types";

export default function CasePlayIndexPage() {
  const router = useRouter();

  const [tab, setTab] = useState<"cases" | "mine" | "shared">("cases");
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

  /** Admin case studies stay on the legacy /case-play runtime branch. */
  const handlePlayAdminCase = (caseId: string) => {
    router.push(`/case-play/${caseId}`);
  };

  /**
   * Student scenarios: ScenarioCard navigates to /practice/case-study/{id}
   * itself. This callback is retained for the prop contract only.
   */
  const handlePlayScenario = (_caseId: string) => {
    // no-op — ScenarioCard owns the launch route
  };

  const tabs = [
    { id: "cases", label: "Case studies", count: cases.length, loading: casesLoading },
    { id: "mine", label: "Yours", count: mine.length, loading: scenariosLoading },
    { id: "shared", label: "From classmates", count: shared.length, loading: scenariosLoading },
  ] as const;

  const createButton = (
    <Button
      className="h-11 rounded-lg font-semibold"
      color="primary"
      startContent={<Plus className="h-4 w-4" />}
      onPress={() => router.push("/case-play/new")}
    >
      Create a scenario
    </Button>
  );

  const empty = (icon: React.ReactNode, heading: string, body?: string, action?: React.ReactNode) => (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-white px-6 py-12 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-light-blue/32 text-cwru-blue">{icon}</span>
      <p className="font-display text-xl font-medium text-cwru-blue">{heading}</p>
      {body ? <p className="max-w-md text-sm text-muted">{body}</p> : null}
      {action}
    </div>
  );

  const loadingState = (text: string) => (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <Spinner size="lg" />
      <p className="text-muted">{text}</p>
    </div>
  );

  const errorState = (text: string) => (
    <div role="alert" className="rounded-lg border border-copper/40 bg-copper/[0.08] p-4 text-ink">
      {text}
    </div>
  );

  const gridClass = "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3";

  return (
    <div className="flex flex-col gap-6">
      <Link className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-true-blue hover:text-cwru-blue" href="/">
        <ArrowLeft aria-hidden className="h-4 w-4" />
        Practice
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[28px] font-medium leading-[1.1] tracking-[-0.01em] text-cwru-blue md:text-[32px]">
            Case studies
          </h1>
          <p className="max-w-2xl text-[15px] text-muted">
            Work through a real leadership scenario, or build your own roleplay and practice it.
          </p>
        </div>
        {createButton}
      </header>

      <div aria-label="Case sources" className="flex gap-7 border-b border-line" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            aria-selected={tab === t.id}
            className={`-mb-px h-11 border-b-2 text-[15px] ${
              tab === t.id ? "border-true-blue font-semibold text-cwru-blue" : "border-transparent font-medium text-muted hover:text-ink"
            }`}
            role="tab"
            type="button"
            onClick={() => setTab(t.id)}
          >
            {t.label} {!t.loading && <span className="font-normal text-muted">{t.count}</span>}
          </button>
        ))}
      </div>

      {tab === "cases" ? (
        // Staff-written case studies.
        casesLoading ? (
          loadingState("Loading case studies...")
        ) : casesError ? (
          errorState(casesError)
        ) : cases.length > 0 ? (
          <div className={gridClass}>
            {cases.map((caseStudy) => (
              <CaseCard key={caseStudy.id} caseStudy={caseStudy} onClick={handlePlayAdminCase} />
            ))}
          </div>
        ) : (
          empty(
            <Briefcase className="h-7 w-7" />,
            "No case studies are available yet.",
            "Check back soon — new case studies are added regularly.",
          )
        )
      ) : scenariosLoading ? (
        loadingState("Loading scenarios...")
      ) : scenariosError ? (
        errorState(scenariosError)
      ) : tab === "mine" ? (
        // Student-authored scenarios: your own first, then classmates' tab.
        mine.length > 0 ? (
          <div className={gridClass}>
            {mine.map((scenario) => (
              <ScenarioCard
                key={scenario.id}
                scenario={scenario}
                owned
                onPlay={handlePlayScenario}
                onChanged={loadScenarios}
              />
            ))}
          </div>
        ) : (
          empty(
            <PenLine className="h-7 w-7" />,
            "You haven't created a scenario yet.",
            "Build a situation, cast your characters, and practice against it.",
            createButton,
          )
        )
      ) : shared.length > 0 ? (
        <div className={gridClass}>
          {shared.map((scenario) => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              owned={false}
              onPlay={handlePlayScenario}
              onChanged={loadScenarios}
            />
          ))}
        </div>
      ) : (
        empty(<Users className="h-7 w-7" />, "Nobody has shared a scenario yet.")
      )}
    </div>
  );
}
