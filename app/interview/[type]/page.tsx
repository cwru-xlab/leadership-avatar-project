"use client";

import { type ChangeEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import { addToast } from "@heroui/toast";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Clock3,
  FileCheck2,
  FileUp,
  LockKeyhole,
  UserRound,
  UsersRound,
} from "lucide-react";
import InterviewSessionShell from "@/components/interview/InterviewSessionShell";
import { useLayout } from "@/lib/layout-context";
import { getInterviewType } from "@/lib/interview/types";
import type { StartAvatarRequest } from "@/types";

interface InterviewerOption {
  avatarId: string;
  name: string;
  previewUrl: string | null;
  voice: { id: string; name: string };
}

type SetupStep = "interviewer" | "resume" | "session";

const MAX_RESUME_SIZE_BYTES = 10 * 1024 * 1024;

export default function InterviewPage() {
  const params = useParams<{ type: string }>();
  const router = useRouter();
  const { setFullScreen } = useLayout();
  const interviewType = useMemo(() => getInterviewType(params.type), [params.type]);
  const [step, setStep] = useState<SetupStep>("interviewer");
  const [interviewers, setInterviewers] = useState<InterviewerOption[]>([]);
  const [selectedInterviewerId, setSelectedInterviewerId] = useState<string | null>(null);
  const [loadingInterviewers, setLoadingInterviewers] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [resumeFileName, setResumeFileName] = useState<string | undefined>();
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [uploadingResume, setUploadingResume] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    const loadInterviewers = async () => {
      try {
        const response = await fetch("/api/interview/interviewers", {
          cache: "no-store",
        });
        const data = (await response.json().catch(() => ({}))) as {
          interviewers?: InterviewerOption[];
          error?: string;
        };
        if (!response.ok || !data.interviewers?.length) {
          throw new Error(data.error || "No interviewers are available right now.");
        }
        if (!isCurrent) return;
        setInterviewers(data.interviewers);
        setSelectedInterviewerId(data.interviewers[0].avatarId);
      } catch (error) {
        if (!isCurrent) return;
        setCatalogError(
          error instanceof Error
            ? error.message
            : "No interviewers are available right now."
        );
      } finally {
        if (isCurrent) setLoadingInterviewers(false);
      }
    };
    void loadInterviewers();
    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    setFullScreen(step === "session");
    return () => setFullScreen(false);
  }, [setFullScreen, step]);

  const selectedInterviewer = interviewers.find(
    (interviewer) => interviewer.avatarId === selectedInterviewerId
  );

  const avatarConfig: StartAvatarRequest | null = selectedInterviewer
    ? {
        quality: "low",
        avatarName: selectedInterviewer.avatarId,
        voice: {
          voiceId: selectedInterviewer.voice.id,
          rate: 1.05,
        },
        language: "en",
      }
    : null;

  const uploadResume = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      addToast({ title: "Choose a PDF resume", color: "warning" });
      return;
    }
    if (file.size > MAX_RESUME_SIZE_BYTES) {
      addToast({ title: "Your PDF must be 10 MB or smaller", color: "warning" });
      return;
    }

    setUploadingResume(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/interview/upload-resume", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        resumeId?: string;
        resumeText?: string;
      };
      if (!response.ok || !data.resumeId || typeof data.resumeText !== "string") {
        throw new Error(data.error || "We could not process that PDF.");
      }
      setResumeId(data.resumeId);
      setResumeText(data.resumeText);
      setResumeFileName(file.name);
      addToast({ title: "Resume ready", color: "success" });
    } catch (error) {
      addToast({
        title: "Resume upload failed",
        description: error instanceof Error ? error.message : undefined,
        color: "danger",
      });
    } finally {
      setUploadingResume(false);
    }
  };

  if (!interviewType) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#f5f8fa] p-6 text-[#102331]">
        <Card className="max-w-lg border border-[#d4e2e9] shadow-none">
          <CardBody className="items-start gap-4 p-8">
            <CircleAlert className="text-[#0a7391]" size={28} />
            <h1 className="font-serif text-3xl">That interview type is not available.</h1>
            <p className="text-[#526c7b]">Choose a practice interview from your CaseBridge workspace.</p>
            <Button color="primary" onPress={() => router.push("/")}>Back to practice</Button>
          </CardBody>
        </Card>
      </main>
    );
  }

  if (step === "session" && selectedInterviewer && avatarConfig) {
    return (
      <InterviewSessionShell
        interviewType={interviewType}
        interviewerName={selectedInterviewer.name}
        interviewerAvatarId={selectedInterviewer.avatarId}
        avatarConfig={avatarConfig}
        resumeText={resumeText}
        resumeFileName={resumeFileName}
        resumeId={resumeId}
        language="en"
        onExit={() => {
          setStep("resume");
          setFullScreen(false);
        }}
        onFinish={(reportId) => {
          setFullScreen(false);
          router.push(`/interview/${interviewType.slug}/report/${reportId}`);
        }}
      />
    );
  }

  return (
    <main className="min-h-[100dvh] overflow-hidden bg-[#f5f8fa] text-[#102331]">
      <div className="relative isolate overflow-hidden border-b border-[#d8e6ec] bg-[#eaf5f8]">
        <div className="absolute -right-24 top-[-150px] h-96 w-96 rounded-full bg-[#a9ddeb]/60 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-5 pb-12 pt-7 sm:px-8 sm:pb-16">
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[#47616f] transition-colors hover:text-[#0a7391] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0a7391]"
            onClick={() => router.push("/")}
          >
            <ArrowLeft size={16} /> Back to practice
          </button>
          <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_290px] lg:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0a7391]">Interview studio</p>
              <h1 className="mt-3 max-w-3xl font-serif text-4xl leading-[0.98] tracking-[-0.045em] text-[#102331] sm:text-6xl">A focused space to practice how you lead.</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[#4e6977]">{interviewType.description}</p>
            </div>
            <div className="grid gap-3 rounded-2xl border border-[#c8dde5] bg-white/80 p-5 shadow-sm backdrop-blur-sm sm:grid-cols-3 lg:grid-cols-1">
              <Stat icon={<Clock3 size={18} />} value={`${interviewType.targetMinutes} min`} label="Practice" />
              <Stat icon={<UsersRound size={18} />} value="Live avatar" label="Interviewer" />
              <Stat icon={<LockKeyhole size={18} />} value="Private" label="Resume" />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-12">
        <div className="mb-8 flex items-center gap-2" aria-label="Interview setup progress">
          <ProgressItem active={step === "interviewer"} complete={step !== "interviewer"} number="01" label="Interviewer" />
          <div className="h-px flex-1 bg-[#ccdce3]" />
          <ProgressItem active={step === "resume"} complete={false} number="02" label="Resume" />
          <div className="h-px flex-1 bg-[#ccdce3]" />
          <ProgressItem active={false} complete={false} number="03" label="Practice" />
        </div>

        {step === "interviewer" && (
          <section aria-labelledby="interviewer-heading">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[#0a7391]">Step 1 of 2</p>
                <h2 id="interviewer-heading" className="mt-1 font-serif text-3xl tracking-[-0.03em]">Choose your interviewer.</h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-[#58727f]">Each interviewer uses a compatible voice profile, so the session starts without a configuration step.</p>
            </div>

            {loadingInterviewers ? (
              <div className="grid min-h-64 place-items-center rounded-2xl border border-[#d4e2e9] bg-white"><Spinner color="primary" /></div>
            ) : catalogError ? (
              <Card className="border border-danger-200 bg-danger-50 shadow-none"><CardBody className="gap-3 p-6 text-danger-800"><CircleAlert size={22} /><p>{catalogError}</p><Button size="sm" variant="flat" onPress={() => window.location.reload()}>Try again</Button></CardBody></Card>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {interviewers.map((interviewer) => {
                    const selected = interviewer.avatarId === selectedInterviewerId;
                    return (
                      <button
                        key={interviewer.avatarId}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setSelectedInterviewerId(interviewer.avatarId)}
                        className={`group relative min-h-60 overflow-hidden rounded-2xl border text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0a7391] ${selected ? "border-[#0a7391] bg-[#edf9fc] shadow-[0_12px_28px_rgba(16,104,133,0.14)]" : "border-[#d4e2e9] bg-white hover:border-[#82bdcf] hover:shadow-md"}`}
                      >
                        {interviewer.previewUrl ? (
                          <img src={interviewer.previewUrl} alt="" className="absolute inset-0 z-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                        ) : (
                          <div className="absolute inset-0 z-0 bg-[#1d586e]" />
                        )}
                        <div className="absolute inset-0 z-10 bg-gradient-to-t from-[#112c39] via-[#112c39]/20 to-transparent" />
                        <div className="absolute inset-x-0 bottom-0 z-20 p-5 text-white">
                          <div className="mb-3 flex justify-between gap-2"><Chip size="sm" className="bg-white/18 text-white">{interviewer.voice.name}</Chip>{selected && <span className="grid h-6 w-6 place-items-center rounded-full bg-[#79d4b1] text-[#0b3029]"><Check size={15} /></span>}</div>
                          <h3 className="font-serif text-2xl">{interviewer.name}</h3>
                          <p className="mt-1 text-sm text-white/78">Hiring manager · Live session</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-7 flex justify-end"><Button color="primary" size="lg" isDisabled={!selectedInterviewer} endContent={<ArrowRight size={17} />} onPress={() => setStep("resume")}>Continue</Button></div>
              </>
            )}
          </section>
        )}

        {step === "resume" && (
          <section className="mx-auto max-w-3xl" aria-labelledby="resume-heading">
            <div className="rounded-2xl border border-[#d4e2e9] bg-white p-6 shadow-[0_12px_32px_rgba(30,68,85,0.07)] sm:p-9">
              <div className="flex items-start gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e0f3f9] text-[#08718d]"><FileUp size={21} /></div><div><p className="text-sm font-semibold text-[#0a7391]">Step 2 of 2</p><h2 id="resume-heading" className="mt-1 font-serif text-3xl tracking-[-0.03em]">Bring your resume into the room.</h2><p className="mt-3 max-w-xl text-[15px] leading-7 text-[#58727f]">Your interviewer will ask grounded follow-ups about your experience. PDFs stay private and are never shown to other students.</p></div></div>

              {resumeId ? (
                <div className="mt-7 flex items-center gap-3 rounded-xl border border-[#b7e3d4] bg-[#effaf5] p-4 text-[#185b49]"><FileCheck2 size={20} /><div><p className="font-semibold">{resumeFileName}</p><p className="text-sm">Parsed and ready for this interview.</p></div></div>
              ) : (
                <label className={`mt-7 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${uploadingResume ? "border-[#a8c9d5] bg-[#f6fafb]" : "border-[#bad1db] hover:border-[#0a7391] hover:bg-[#f4fbfd]"}`}>
                  {uploadingResume ? <Spinner color="primary" /> : <FileUp className="text-[#0a7391]" size={28} />}
                  <span className="mt-3 font-semibold">{uploadingResume ? "Reading your PDF…" : "Upload a PDF resume"}</span>
                  <span className="mt-1 text-sm text-[#617b88]">PDF only · up to 10 MB</span>
                  <input className="sr-only" type="file" accept="application/pdf" disabled={uploadingResume} onChange={uploadResume} />
                </label>
              )}

              <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-[#e0eaee] pt-6"><Button variant="light" onPress={() => setStep("interviewer")}>Back</Button><div className="flex gap-2"><Button variant="flat" onPress={() => { setResumeId(null); setResumeText(""); setResumeFileName(undefined); setStep("session"); }}>Skip for now</Button><Button color="primary" isDisabled={uploadingResume} endContent={<ArrowRight size={17} />} onPress={() => setStep("session")}>Start interview</Button></div></div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function Stat({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return <div className="flex items-center gap-2 text-[#52707d]"><span className="text-[#0a7391]">{icon}</span><div><p className="text-sm font-semibold text-[#183947]">{value}</p><p className="text-xs">{label}</p></div></div>;
}

function ProgressItem({ active, complete, number, label }: { active: boolean; complete: boolean; number: string; label: string }) {
  return <div className={`flex items-center gap-2 text-xs font-semibold ${active ? "text-[#08718d]" : complete ? "text-[#327b68]" : "text-[#78909b]"}`}><span className={`grid h-6 w-6 place-items-center rounded-full border text-[10px] ${active ? "border-[#08718d] bg-[#08718d] text-white" : complete ? "border-[#74bba8] bg-[#e5f5ee]" : "border-[#b8cbd3]"}`}>{complete ? <Check size={13} /> : number}</span><span className="hidden sm:inline">{label}</span></div>;
}
