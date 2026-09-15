"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import {
  Briefcase,
  MessageSquare,
  Mic2,
  ArrowRight,
  UserPlus,
  X,
  RefreshCw,
} from "lucide-react";
import { addToast } from "@heroui/toast";

import { title } from "@/components/primitives";
import { useAuth } from "@/lib/auth-context";
import { TOPIC_META, PRACTICE_TOPICS, type PracticeTopic } from "@/lib/topics";
import { DemoModeBanner } from "@/components/demo-mode-banner";
import type { CaseStudy } from "@/types";
import type { Cohort } from "@/types/cohort";

interface StudentCaseWithCohort extends CaseStudy {
  cohortId?: string;
  cohortName?: string;
}

const TOPIC_ICONS: Record<PracticeTopic, typeof Briefcase> = {
  interview: Mic2,
  pitch: Briefcase,
  courageous_conversation: MessageSquare,
};

export default function PracticeHubPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [cases, setCases] = useState<StudentCaseWithCohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [pendingCohort, setPendingCohort] = useState<Cohort | null>(null);
  const [pendingAccessCode, setPendingAccessCode] = useState<string | null>(null);
  const [joiningCohort, setJoiningCohort] = useState(false);

  useEffect(() => {
    const savedAccessCode = localStorage.getItem("pendingCohortJoin");
    if (savedAccessCode) {
      setPendingAccessCode(savedAccessCode);
      fetchPendingCohort(savedAccessCode);
    }
  }, []);

  useEffect(() => {
    if (user?.email) loadCases();
  }, [user?.email]);

  const fetchPendingCohort = async (accessCode: string) => {
    try {
      const response = await fetch(`/api/cohort/get?accessCode=${accessCode}`);
      if (response.ok) {
        const data = await response.json();
        if (data.cohort) {
          setPendingCohort(data.cohort);
        } else {
          localStorage.removeItem("pendingCohortJoin");
          setPendingAccessCode(null);
        }
      } else {
        localStorage.removeItem("pendingCohortJoin");
        setPendingAccessCode(null);
      }
    } catch {
      localStorage.removeItem("pendingCohortJoin");
      setPendingAccessCode(null);
    }
  };

  const loadCases = async () => {
    if (!user?.email) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const response = await fetch(
        `/api/student/cases?email=${encodeURIComponent(user.email)}`
      );
      if (!response.ok) throw new Error("Failed to fetch scenarios");
      const data = await response.json();
      setCases(data.cases || []);
      setDemo(Boolean(data.demo));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinPendingCohort = async () => {
    if (!user?.email || !pendingAccessCode) return;
    setJoiningCohort(true);
    try {
      const response = await fetch("/api/cohort/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessCode: pendingAccessCode,
          email: user.email.trim().toLowerCase(),
          name: user.name || undefined,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to join cohort");
      }
      localStorage.removeItem("pendingCohortJoin");
      setPendingCohort(null);
      setPendingAccessCode(null);
      addToast({
        title: "Success!",
        description: `You have joined ${pendingCohort?.name}`,
        color: "success",
      });
      loadCases();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to join cohort";
      addToast({ title: "Error", description: msg, color: "danger" });
    } finally {
      setJoiningCohort(false);
    }
  };

  const countForTopic = (topic: PracticeTopic) =>
    cases.filter((c) => (c.topic || "courageous_conversation") === topic).length;

  return (
    <section className="flex flex-col gap-8 py-8 max-w-5xl mx-auto px-4">
      <div>
        <h1 className={title()}>Practice</h1>
        <p className="text-default-500 mt-2 text-lg">
          Choose a topic to rehearse high-stakes professional conversations in a
          low-risk environment.
        </p>
      </div>

      {demo && (
        <DemoModeBanner message="Placeholder scenarios — assigned when env/S3 is missing so you can preview the Practice hub." />
      )}

      {pendingCohort && (
        <Card className="border border-primary/30 bg-primary/5">
          <CardBody className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <UserPlus className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Join cohort: {pendingCohort.name}</p>
                <p className="text-sm text-default-500">
                  Access code pending from your invite link
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                color="primary"
                isLoading={joiningCohort}
                onPress={handleJoinPendingCohort}
              >
                Join
              </Button>
              <Button
                isIconOnly
                variant="light"
                onPress={() => {
                  localStorage.removeItem("pendingCohortJoin");
                  setPendingCohort(null);
                  setPendingAccessCode(null);
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="flex justify-end">
        <Button
          variant="bordered"
          size="sm"
          startContent={<RefreshCw className="w-4 h-4" />}
          onPress={loadCases}
          isLoading={loading}
        >
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PRACTICE_TOPICS.map((topic) => {
          const meta = TOPIC_META[topic];
          const Icon = TOPIC_ICONS[topic];
          const count = countForTopic(topic);
          return (
            <Card
              key={topic}
              isPressable
              className="hover:scale-[1.01] transition-transform"
              onPress={() => router.push(meta.href)}
            >
              <CardBody className="p-6 flex flex-col gap-4 min-h-[220px]">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">{meta.label}</h2>
                  <p className="text-default-500 text-sm mt-2">
                    {meta.description}
                  </p>
                </div>
                <div className="mt-auto flex items-center justify-between text-sm">
                  <span className="text-default-400">
                    {loading ? "…" : `${count} scenario${count === 1 ? "" : "s"}`}
                  </span>
                  <span className="flex items-center gap-1 text-primary font-medium">
                    Open <ArrowRight className="w-4 h-4" />
                  </span>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <Button variant="flat" onPress={() => router.push("/progress")}>
          View progress
        </Button>
        <Button variant="flat" onPress={() => router.push("/plan")}>
          My learning plan
        </Button>
      </div>
    </section>
  );
}
