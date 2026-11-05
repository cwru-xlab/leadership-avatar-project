"use client";

import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Spinner } from "@heroui/spinner";
import { Braces, Clock3, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import TechnicalCodingSession from "@/components/technical-interview/TechnicalCodingSession";
import type { StartAvatarRequest } from "@/types";

type Interviewer = { avatarId: string; name: string; voice: { id: string } };

export default function TechnicalCodingPracticePage() {
  const [interviewer, setInterviewer] = useState<Interviewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/interview/interviewers", { cache: "no-store" })
      .then(async (response) => ({ response, data: await response.json() as { interviewers?: Interviewer[]; error?: string } }))
      .then(({ response, data }) => {
        if (!response.ok || !data.interviewers?.[0]) setError(data.error || "We could not load an interviewer.");
        else setInterviewer(data.interviewers[0]);
      })
      .catch(() => setError("We could not load an interviewer."))
      .finally(() => setLoading(false));
  }, []);

  const start = async () => {
    if (!interviewer) return;
    setStarting(true); setError(null);
    try {
      const response = await fetch("/api/practice/session/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ typeSlug: "technical-coding", cameraMode: "OFF", interviewerAvatarId: interviewer.avatarId, interviewerName: interviewer.name }) });
      const data = await response.json().catch(() => ({})) as { reportId?: string; error?: string };
      if (!response.ok || !data.reportId) { setError(data.error || "We could not start the coding session."); return; }
      setReportId(data.reportId);
    } catch { setError("We could not start the coding session."); }
    finally { setStarting(false); }
  };

  if (reportId && interviewer) {
    const avatarConfig: StartAvatarRequest = { quality: "low", avatarName: interviewer.avatarId, voice: { voiceId: interviewer.voice.id, rate: 1.05 }, language: "en" };
    return <TechnicalCodingSession reportId={reportId} avatarConfig={avatarConfig} />;
  }

  return <main className="grid min-h-[100dvh] place-items-center bg-canvas p-5"><Card className="w-full max-w-xl border border-line shadow-none"><CardBody className="gap-6 p-6 sm:p-9"><div className="flex items-start gap-4"><div className="grid size-12 shrink-0 place-items-center rounded-xl bg-cwru-blue text-white"><Braces size={24} /></div><div><p className="text-sm font-semibold text-link">Technical practice</p><h1 className="mt-1 font-display text-3xl font-medium text-cwru-blue">Coding interview room</h1><p className="mt-3 text-sm leading-6 text-muted">You’ll receive one original Python problem selected at random. Explain your approach, code in the workspace, and use visible tests as you work.</p></div></div><div className="grid gap-3 rounded-lg border border-line bg-canvas p-4 text-sm text-ink sm:grid-cols-2"><p className="flex items-center gap-2"><Clock3 size={17} className="text-link" />30-minute target</p><p className="flex items-center gap-2"><ShieldCheck size={17} className="text-link" />Private practice session</p></div>{error && <p role="alert" className="rounded-md bg-danger-50 p-3 text-sm text-danger">{error}</p>}<Button color="primary" size="lg" className="font-semibold" isDisabled={loading || !interviewer} isLoading={starting} onPress={() => void start()}>{loading ? "Preparing interviewer" : "Begin coding session"}</Button>{loading && <Spinner size="sm" color="primary" label="Preparing interviewer" />}</CardBody></Card></main>;
}
