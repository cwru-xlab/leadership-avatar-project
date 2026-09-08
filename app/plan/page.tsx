"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { RefreshCw, Play, CheckCircle2, Circle } from "lucide-react";
import { addToast } from "@heroui/toast";

import { title } from "@/components/primitives";
import { useAuth } from "@/lib/auth-context";

interface PlanActivity {
  id: string;
  title: string;
  status: string;
  priority: number;
  skillLabels: string[];
  topic?: string | null;
  caseSlug?: string | null;
  href: string;
}

interface PlanPayload {
  id: string;
  rationale: string | null;
  generatedAt: string;
  focusSkills: { skillKey: string; label: string }[];
  activities: PlanActivity[];
}

export default function PlanPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [plan, setPlan] = useState<PlanPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  const loadPlan = async () => {
    if (!user?.email) return;
    try {
      setLoading(true);
      const res = await fetch(
        `/api/student/plan?email=${encodeURIComponent(user.email)}`
      );
      if (!res.ok) throw new Error("Failed to load plan");
      const data = await res.json();
      setPlan(data.plan);
    } catch (e) {
      console.error(e);
      addToast({
        title: "Error",
        description: "Could not load learning plan",
        color: "danger",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlan();
  }, [user?.email]);

  const regenerate = async () => {
    if (!user?.email) return;
    setRegenerating(true);
    try {
      const res = await fetch("/api/student/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
      if (!res.ok) throw new Error("Failed");
      await loadPlan();
      addToast({
        title: "Plan updated",
        description: "Your learning plan was regenerated from latest skills.",
        color: "success",
      });
    } catch {
      addToast({
        title: "Error",
        description: "Could not regenerate plan",
        color: "danger",
      });
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <section className="flex flex-col gap-8 py-8 max-w-5xl mx-auto px-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className={title()}>Learning Plan</h1>
          <p className="text-default-500 mt-2">
            Personalized focus skills and in-app practice trials based on your
            recent performance.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="flat" onPress={() => router.push("/progress")}>
            View progress
          </Button>
          <Button
            variant="bordered"
            startContent={<RefreshCw className="w-4 h-4" />}
            isLoading={regenerating}
            onPress={regenerate}
          >
            Regenerate
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-default-500">Loading plan…</p>
      ) : !plan ? (
        <Card>
          <CardBody className="py-12 text-center text-default-500">
            <p>No learning plan yet.</p>
            <p className="text-sm mt-1">
              Complete an assessed practice session, or generate a starter plan.
            </p>
            <div className="flex justify-center gap-2 mt-4">
              <Button color="primary" onPress={() => router.push("/practice")}>
                Practice
              </Button>
              <Button variant="bordered" onPress={regenerate}>
                Generate starter plan
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : (
        <>
          <Card className="bg-primary/5 border border-primary/20">
            <CardBody className="p-5 gap-3">
              <p className="text-sm text-default-500">Focus this week</p>
              <div className="flex flex-wrap gap-2">
                {plan.focusSkills.map((s) => (
                  <Chip key={s.skillKey} color="primary" variant="flat">
                    {s.label}
                  </Chip>
                ))}
              </div>
              {plan.rationale && (
                <p className="text-sm text-default-600 mt-1">{plan.rationale}</p>
              )}
              <p className="text-xs text-default-400">
                Generated {new Date(plan.generatedAt).toLocaleString()}
              </p>
            </CardBody>
          </Card>

          <div>
            <h2 className="text-lg font-semibold mb-4">Recommended trials</h2>
            <div className="space-y-3">
              {plan.activities.map((activity) => {
                const done = activity.status === "completed";
                return (
                  <Card key={activity.id}>
                    <CardBody className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        {done ? (
                          <CheckCircle2 className="w-5 h-5 text-success mt-0.5" />
                        ) : (
                          <Circle className="w-5 h-5 text-default-300 mt-0.5" />
                        )}
                        <div>
                          <p className="font-medium">{activity.title}</p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {activity.topic && (
                              <Chip size="sm" variant="bordered">
                                {activity.topic}
                              </Chip>
                            )}
                            {activity.skillLabels.map((label) => (
                              <Chip key={label} size="sm" variant="flat">
                                {label}
                              </Chip>
                            ))}
                          </div>
                        </div>
                      </div>
                      <Button
                        color="primary"
                        variant={done ? "flat" : "solid"}
                        startContent={<Play className="w-4 h-4" />}
                        onPress={() => router.push(activity.href)}
                      >
                        {done ? "Practice again" : "Start trial"}
                      </Button>
                    </CardBody>
                  </Card>
                );
              })}
              {plan.activities.length === 0 && (
                <p className="text-default-500 text-sm">
                  No matching scenarios yet. Ask an admin to publish scenarios
                  tagged with your focus skills, or browse{" "}
                  <button
                    type="button"
                    className="text-primary underline"
                    onClick={() => router.push("/practice")}
                  >
                    Practice
                  </button>
                  .
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
