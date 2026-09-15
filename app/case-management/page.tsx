"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Select, SelectItem } from "@heroui/select";
import { Plus, RefreshCw } from "lucide-react";
import { title } from "@/components/primitives";
import CaseCard from "@/components/case-card";
import { PRACTICE_TOPICS, TOPIC_META } from "@/lib/topics";
import { DemoModeBanner } from "@/components/demo-mode-banner";
import type { CaseStudy } from "@/types";

export default function CaseManagementPage() {
  const router = useRouter();
  const [cases, setCases] = useState<CaseStudy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    loadCases();
  }, []);

  const loadCases = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/case/list");
      if (!response.ok) throw new Error("Failed to list scenarios");
      const data = await response.json();
      setCases(data.cases || []);
      setDemo(Boolean(data.demo));
    } catch (err) {
      console.error("Failed to load scenarios:", err);
      setError("Failed to load scenarios");
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (topicFilter === "all") return cases;
    return cases.filter(
      (c) => (c.topic || "courageous_conversation") === topicFilter
    );
  }, [cases, topicFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className={title()}>Scenarios</h1>
          <p className="text-default-500 mt-1">
            Practice interviews, pitches, and courageous conversations
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select
            aria-label="Filter by topic"
            className="w-56"
            selectedKeys={[topicFilter]}
            onSelectionChange={(keys) => {
              const v = Array.from(keys)[0] as string;
              setTopicFilter(v || "all");
            }}
            items={[
              { key: "all", label: "All topics" },
              ...PRACTICE_TOPICS.map((t) => ({
                key: t,
                label: TOPIC_META[t].label,
              })),
            ]}
          >
            {(item) => <SelectItem key={item.key}>{item.label}</SelectItem>}
          </Select>
          <Button
            variant="bordered"
            startContent={<RefreshCw className="w-4 h-4" />}
            onPress={loadCases}
            isLoading={loading}
          >
            {loading ? "Syncing..." : "Sync"}
          </Button>
          <Button
            color="primary"
            variant="solid"
            startContent={<Plus className="w-4 h-4" />}
            onPress={() => router.push("/case-management/new")}
          >
            Add Scenario
          </Button>
        </div>
      </div>

      {demo && (
        <DemoModeBanner message="Placeholder scenarios — S3 is not configured. Editing/saving will not persist." />
      )}

      {error && (
        <div className="p-4 bg-danger-50 border border-danger-200 rounded-lg text-danger-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-center py-12">
          <p className="text-default-500">Loading scenarios...</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filtered.map((caseStudy) => (
            <CaseCard
              key={caseStudy.id}
              caseStudy={caseStudy}
              onClick={(id) => router.push(`/case-management/${id}`)}
            />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && !error && (
        <div className="text-center py-12">
          <p className="text-default-500 mb-4">No scenarios found</p>
          <Button
            color="primary"
            startContent={<Plus className="w-4 h-4" />}
            onPress={() => router.push("/case-management/new")}
          >
            Create your first scenario
          </Button>
        </div>
      )}
    </div>
  );
}
