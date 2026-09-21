"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { ArrowLeft, Briefcase } from "lucide-react";
import { title } from "@/components/primitives";
import CaseCard from "@/components/case-card";
import type { CaseStudy } from "@/types";

export default function CasePlayIndexPage() {
  const router = useRouter();
  const [cases, setCases] = useState<CaseStudy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCases();
  }, []);

  const loadCases = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/case/list?publishedOnly=true", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to load case studies");
      }

      const data = await response.json();

      setCases((data.cases ?? []) as CaseStudy[]);
    } catch (err) {
      console.error("Failed to load published cases:", err);
      setError("Failed to load case studies. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCaseClick = (caseId: string) => {
    router.push(`/case-play/${caseId}`);
  };

  return (
    <div className="space-y-8 py-2 md:py-4">
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
        <h1 className={title({ fullWidth: true })}>Case Studies</h1>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <Spinner size="lg" />
          <p className="text-default-500">Loading case studies...</p>
        </div>
      )}

      {!loading && error && (
        <div className="p-4 bg-danger-50 border border-danger-200 rounded-lg text-danger-700">
          {error}
        </div>
      )}

      {!loading && !error && cases.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {cases.map((caseStudy) => (
            <CaseCard
              key={caseStudy.id}
              caseStudy={caseStudy}
              onClick={handleCaseClick}
            />
          ))}
        </div>
      )}

      {!loading && !error && cases.length === 0 && (
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
    </div>
  );
}
