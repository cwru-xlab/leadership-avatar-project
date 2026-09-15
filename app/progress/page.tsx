"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { Progress } from "@heroui/progress";
import { Chip } from "@heroui/chip";
import { Sparkles, ArrowRight } from "lucide-react";

import { title } from "@/components/primitives";
import { useAuth } from "@/lib/auth-context";
import { DemoModeBanner } from "@/components/demo-mode-banner";

interface SkillRow {
  skillKey: string;
  label: string;
  category: string;
  level: number;
  xp: number;
  emaScore: number;
  attemptCount: number;
  gap: number;
}

interface AttemptRow {
  id: string;
  score: number | null;
  topic: string | null;
  caseTitle: string;
  caseSlug: string;
  attemptNumber: number;
  submittedAt: string | null;
}

export default function ProgressPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [totals, setTotals] = useState({ attempts: 0, skillsTracked: 0, avgEma: 0 });
  const [targetScore, setTargetScore] = useState(80);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/student/progress?email=${encodeURIComponent(user.email)}`
        );
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setSkills(data.skills || []);
        setAttempts(data.attempts || []);
        setTotals(data.totals || { attempts: 0, skillsTracked: 0, avgEma: 0 });
        setTargetScore(data.targetScore || 80);
        setDemo(Boolean(data.demo));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.email]);

  const weakest = [...skills].sort((a, b) => a.emaScore - b.emaScore).slice(0, 3);

  return (
    <section className="flex flex-col gap-8 py-8 max-w-5xl mx-auto px-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className={title()}>Progress</h1>
          <p className="text-default-500 mt-2">
            Track skill growth across interviews, pitches, and courageous conversations.
          </p>
        </div>
        <Button color="primary" onPress={() => router.push("/plan")}>
          Open learning plan
        </Button>
      </div>

      {demo && (
        <DemoModeBanner message="Placeholder skill progress — replace with live attempts once DATABASE_URL is set." />
      )}

      {loading ? (
        <p className="text-default-500">Loading progress…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardBody className="p-5">
                <p className="text-sm text-default-500">Attempts scored</p>
                <p className="text-3xl font-semibold mt-1">{totals.attempts}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-5">
                <p className="text-sm text-default-500">Skills tracked</p>
                <p className="text-3xl font-semibold mt-1">{totals.skillsTracked}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-5">
                <p className="text-sm text-default-500">Average skill EMA</p>
                <p className="text-3xl font-semibold mt-1">{totals.avgEma}</p>
                <p className="text-xs text-default-400 mt-1">Target {targetScore}</p>
              </CardBody>
            </Card>
          </div>

          {skills.length === 0 ? (
            <Card>
              <CardBody className="py-12 text-center text-default-500">
                <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-50" />
                <p>No scored attempts yet.</p>
                <p className="text-sm mt-1">
                  Complete an assessed practice session to start tracking growth.
                </p>
                <Button
                  className="mt-4"
                  color="primary"
                  onPress={() => router.push("/practice")}
                >
                  Go to Practice
                </Button>
              </CardBody>
            </Card>
          ) : (
            <>
              {weakest.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold mb-3">Focus areas</h2>
                  <div className="flex flex-wrap gap-2">
                    {weakest.map((s) => (
                      <Chip key={s.skillKey} color="warning" variant="flat">
                        {s.label} · {s.emaScore}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h2 className="text-lg font-semibold mb-4">Skills</h2>
                <div className="space-y-4">
                  {skills
                    .slice()
                    .sort((a, b) => b.emaScore - a.emaScore)
                    .map((s) => (
                      <Card key={s.skillKey}>
                        <CardBody className="p-4 gap-2">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium">{s.label}</p>
                              <p className="text-xs text-default-400">
                                Level {s.level} · {s.xp} XP · {s.attemptCount}{" "}
                                attempts · {s.category}
                              </p>
                            </div>
                            <span className="text-lg font-semibold">{s.emaScore}</span>
                          </div>
                          <Progress
                            aria-label={s.label}
                            value={s.emaScore}
                            color={s.emaScore >= targetScore ? "success" : "primary"}
                            className="max-w-full"
                          />
                        </CardBody>
                      </Card>
                    ))}
                </div>
              </div>
            </>
          )}

          {attempts.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-4">Recent attempts</h2>
              <div className="space-y-2">
                {attempts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="w-full text-left"
                    onClick={() => router.push(`/case-play/${a.caseSlug}`)}
                  >
                    <Card className="hover:bg-default-50">
                      <CardBody className="p-4 flex flex-row items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{a.caseTitle}</p>
                          <p className="text-xs text-default-400">
                            Attempt {a.attemptNumber}
                            {a.topic ? ` · ${a.topic}` : ""}
                            {a.submittedAt
                              ? ` · ${new Date(a.submittedAt).toLocaleDateString()}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Chip size="sm" variant="flat">
                            {a.score ?? "—"}
                          </Chip>
                          <ArrowRight className="w-4 h-4 text-default-400" />
                        </div>
                      </CardBody>
                    </Card>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
