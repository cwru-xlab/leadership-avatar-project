"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { ArrowLeft, Play, Briefcase } from "lucide-react";

import { title } from "@/components/primitives";
import { useAuth } from "@/lib/auth-context";
import {
  TOPIC_META,
  isPracticeTopic,
  type PracticeTopic,
} from "@/lib/topics";
import { DemoModeBanner } from "@/components/demo-mode-banner";
import type { CaseStudy } from "@/types";

interface StudentCaseWithCohort extends CaseStudy {
  cohortId?: string;
  cohortName?: string;
  heygenMinutesLimit?: number | null;
}

export default function PracticeTopicPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const topicParam = params.topic as string;
  const valid = isPracticeTopic(topicParam);
  const topic = (valid ? topicParam : "interview") as PracticeTopic;
  const meta = TOPIC_META[topic];

  const [cases, setCases] = useState<StudentCaseWithCohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    if (!valid) {
      router.replace("/practice");
      return;
    }
    if (user?.email) loadCases();
  }, [user?.email, topic, valid]);

  const loadCases = async () => {
    if (!user?.email) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(
        `/api/student/cases?email=${encodeURIComponent(user.email)}&topic=${topic}`
      );
      if (!response.ok) throw new Error("Failed to fetch scenarios");
      const data = await response.json();
      setCases(data.cases || []);
      setDemo(Boolean(data.demo));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="flex flex-col gap-6 py-8 max-w-5xl mx-auto px-4">
      <div className="flex items-start gap-3">
        <Button
          isIconOnly
          variant="light"
          onPress={() => router.push("/practice")}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className={title()}>{meta.label}</h1>
          <p className="text-default-500 mt-2">{meta.description}</p>
        </div>
      </div>

      {demo && <DemoModeBanner />}

      {error && (
        <div className="p-4 bg-danger-50 border border-danger-200 rounded-lg text-danger-700">
          {error}
        </div>
      )}

      {loading && (
        <p className="text-default-500 text-center py-12">Loading scenarios…</p>
      )}

      {!loading && cases.length === 0 && (
        <Card>
          <CardBody className="py-12 text-center text-default-500">
            <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>No assigned scenarios in this topic yet.</p>
            <p className="text-sm mt-1">
              Join a cohort or ask your instructor to assign practice scenarios.
            </p>
            <Button className="mt-4" variant="flat" onPress={() => router.push("/practice")}>
              Back to Practice
            </Button>
          </CardBody>
        </Card>
      )}

      {!loading && cases.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cases.map((scenario) => (
            <Card
              key={scenario.id}
              isPressable
              className="hover:shadow-md transition-shadow"
              onPress={() => router.push(`/case-play/${scenario.id}`)}
            >
              <CardBody className="p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold">{scenario.name}</h2>
                  {scenario.difficulty && (
                    <Chip size="sm" variant="flat">
                      {scenario.difficulty}
                    </Chip>
                  )}
                </div>
                <p className="text-sm text-default-500 line-clamp-3">
                  {scenario.backgroundInfo}
                </p>
                <div className="flex flex-wrap gap-2">
                  {scenario.subtype && (
                    <Chip size="sm" color="primary" variant="dot">
                      {scenario.subtype}
                    </Chip>
                  )}
                  {scenario.cohortName && (
                    <Chip size="sm" variant="bordered">
                      {scenario.cohortName}
                    </Chip>
                  )}
                </div>
                <div className="flex items-center gap-2 text-primary text-sm font-medium mt-auto pt-2">
                  <Play className="w-4 h-4" />
                  Start practice
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
