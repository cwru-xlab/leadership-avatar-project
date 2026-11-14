"use client";

// SECURITY: Only show test pages in development mode
if (typeof window !== "undefined" && process.env.NODE_ENV !== "development") {
  throw new Error("Test pages are only available in development mode");
}

import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Mic, MicOff } from "lucide-react";

import { PushToTalkControl } from "@/components/session/SessionRoom";
import {
  RecordingIcon,
  RECORDING_FILL_CLASS,
  type RecordButtonVariant,
} from "@/components/session/RecordingIcon";

/**
 * Side-by-side comparison of the tap-to-record button states (client tweak
 * 2026-11-14). "Before" reproduces the old red + crossed-out mic; the three
 * variants are the RecordingIcon options. Renders every surface that hosts the
 * button: session-room bar, floating round button, kiosk.
 */
const VARIANTS: { id: RecordButtonVariant; name: string }[] = [
  { id: "send", name: "A · Send arrow (default)" },
  { id: "live-dot", name: "B · Pulsing live dot" },
  { id: "waveform", name: "C · Audio waveform" },
];

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3" data-testid={`col-${title}`}>
      <p className="text-[13px] font-semibold text-light-blue">{title}</p>
      {children}
    </div>
  );
}

function FloatingButton({ recording, icon }: { recording: boolean; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        size="lg"
        color={recording ? "success" : "primary"}
        className={`rounded-full w-14 h-14 shadow-lg ${recording ? "scale-110" : ""}`}
        isIconOnly
      >
        {icon}
      </Button>
      <p className="text-xs text-white/60">{recording ? "Tap again to send" : "Tap to record"}</p>
    </div>
  );
}

export default function RecordButtonTestPage() {
  const noop = () => {};

  return (
    <div className="min-h-screen bg-canvas p-8 flex flex-col gap-8">
      <h1 className="font-display text-[32px] text-cwru-blue">Record button states</h1>

      <section className="rounded-xl bg-ink p-8 flex flex-col gap-8" data-testid="session-bar">
        <p className="text-white font-semibold">Session room bar (SessionRoom, CoachedSessionShell, coding)</p>
        <div className="grid grid-cols-5 gap-6">
          <Column title="Idle">
            <PushToTalkControl isRecording={false} isTranscribing={false} isDisabled={false} onToggle={noop} />
          </Column>
          <Column title="Before (recording)">
            <Button size="sm" variant="solid" color="danger" className="font-medium text-white" startContent={<MicOff size={15} />}>
              Tap again to send
            </Button>
          </Column>
          {VARIANTS.map((v) => (
            <Column key={v.id} title={v.name}>
              <PushToTalkControl isRecording isTranscribing={false} isDisabled={false} onToggle={noop} variant={v.id} />
            </Column>
          ))}
        </div>
      </section>

      <section className="rounded-xl bg-ink p-8 flex flex-col gap-8" data-testid="floating">
        <p className="text-white font-semibold">Floating button over avatar (case study, legacy case)</p>
        <div className="grid grid-cols-5 gap-6">
          <Column title="Idle">
            <FloatingButton recording={false} icon={<Mic className="w-5 h-5" />} />
          </Column>
          <Column title="Before (recording)">
            <div className="flex flex-col items-center gap-2">
              <Button size="lg" color="danger" className="rounded-full w-14 h-14 shadow-lg scale-110" isIconOnly>
                <MicOff className="w-5 h-5" />
              </Button>
              <p className="text-xs text-white/60">Tap again to send</p>
            </div>
          </Column>
          {VARIANTS.map((v) => (
            <Column key={v.id} title={v.name}>
              <FloatingButton recording icon={<RecordingIcon className="w-5 h-5" variant={v.id} />} />
            </Column>
          ))}
        </div>
      </section>

      <section className="rounded-xl bg-white border border-line p-8 flex flex-col gap-8" data-testid="kiosk">
        <p className="text-ink font-semibold">Kiosk touch screen</p>
        <div className="grid grid-cols-5 gap-6">
          {[
            { key: "idle", title: "Idle", cls: "bg-blue-500", icon: <Mic className="w-16 h-16 text-white" />, label: "Tap to record" },
            { key: "before", title: "Before (recording)", cls: "bg-red-500 scale-110", icon: <Spinner size="lg" color="white" variant="wave" />, label: "Tap again to send" },
            ...VARIANTS.map((v) => ({
              key: v.id,
              title: v.name,
              cls: `${RECORDING_FILL_CLASS} scale-110`,
              icon: <RecordingIcon className="w-16 h-16 text-white" variant={v.id} />,
              label: "Tap again to send",
            })),
          ].map((k) => (
            <div key={k.key} className="flex flex-col items-center gap-3">
              <p className="text-[13px] font-semibold text-muted">{k.title}</p>
              <Button className={`w-40 h-40 rounded-full shadow-lg ${k.cls}`} isIconOnly size="lg">
                {k.icon}
              </Button>
              <p className="text-2xl font-medium text-gray-800">{k.label}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
