"use client";

/**
 * Case-study (student-authored scenario) live-session view.
 *
 * Ported from the playing branch of `app/case-play/[caseId]/page.tsx` so
 * plan 13-11 can delete the duplicate scenario pipeline from that page.
 * PracticeSessionShell delegates here when
 * `sessionConfig.instance.kind === "case-study"`.
 *
 * Intro + camera consent live on SetupWizard; this component owns the
 * multi-role chat, text/avatar toggle, `/api/interaction/save`, metrics
 * capture, and `/api/practice/session/finish`.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import { Input } from "@heroui/input";
import {
  Users,
  Send,
  LogOut,
  CheckCircle,
  MessageSquare,
  Type,
  Video,
  Mic,
  MicOff,
  DoorOpen,
} from "lucide-react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { addToast } from "@heroui/toast";
import AvatarImage from "@/components/AvatarImage";
import type {
  CaseStudy,
  CaseAvatar,
  InteractionLog,
  InteractionEvent,
  RoleMessage,
  StartAvatarRequest,
  VideoAudioProfile,
} from "@/types";
import InteractiveAvatarWrapper, {
  type InteractiveAvatarRef,
} from "@/components/HeyGenAvatar/InteractiveAvatar";
import { HeygenSessionError } from "@/lib/heygen-client";
import { StreamingAvatarSessionState } from "@/components/HeyGenAvatar/logic";
import {
  resolveAttemptLanguage,
  type AttemptLanguage,
} from "@/lib/languages";
import { extractSpeakable } from "@/lib/interview/speakable";
import SelfViewThumbnail from "@/components/metrics/SelfViewThumbnail";
import FaceDetectionBanner from "@/components/metrics/FaceDetectionBanner";
import {
  requestCameraStream,
  createVisualCapture,
  type VisualCaptureHandle,
} from "@/lib/metrics/visual-capture";
import { createVocalCapture } from "@/lib/metrics/vocal-capture";
import type { CameraMode, VisualMetrics, VocalMetrics } from "@/lib/metrics/types";

type InteractionMode = "text" | "avatar";
type SaveState = "idle" | "saving" | "saved" | "error";

const logSignature = (log: InteractionLog) =>
  `${log.totalMessages ?? 0}:${log.events.length}:${Object.keys(log.roleInteractions).length}`;

export interface CaseStudySessionViewProps {
  caseData: CaseStudy;
  reportId: string;
  cameraMode: CameraMode;
  initialLog: InteractionLog;
  language?: string;
  onExit: () => void;
  onFinish: (reportId: string) => void;
}

export default function CaseStudySessionView({
  caseData,
  reportId,
  cameraMode,
  initialLog,
  language,
  onExit,
  onFinish,
}: CaseStudySessionViewProps) {
  const attemptLanguage: AttemptLanguage = resolveAttemptLanguage(language);
  const caseId = caseData.id;
  // Always the scenario pipeline — this view is never used for legacy admin cases.
  const isScenario = true;
  const pageState = "playing" as const;

  const [interactionLog, setInteractionLog] = useState<InteractionLog | null>(initialLog);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [mode] = useState<"assessed">("assessed");

  const visualCaptureRef = useRef<VisualCaptureHandle | null>(null);
  const vocalCaptureRef = useRef<ReturnType<typeof createVocalCapture> | null>(null);
  const scenarioCameraStreamRef = useRef<MediaStream | null>(null);
  const [scenarioSelfViewStream, setScenarioSelfViewStream] = useState<MediaStream | null>(null);
  const [faceDetected, setFaceDetected] = useState(true);

  const [selectedRole, setSelectedRole] = useState<CaseAvatar | null>(null);
  const [chatMessages, setChatMessages] = useState<Record<string, RoleMessage[]>>({});
  const [currentInput, setCurrentInput] = useState("");
  const [sending, setSending] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [leavingCase, setLeavingCase] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const interactionLogRef = useRef<InteractionLog | null>(initialLog);
  const saveInFlightRef = useRef(false);
  const lastSavedSigRef = useRef<string>("");

  const [interactionMode, setInteractionMode] = useState<InteractionMode>("text");
  const [streamingText, setStreamingText] = useState("");
  const interactionModeRef = useRef<InteractionMode>("text");
  useEffect(() => {
    interactionModeRef.current = interactionMode;
  }, [interactionMode]);
  const [heygenAvatarConfigured, setHeygenAvatarConfigured] = useState<boolean | null>(null);
  const avatarRef = useRef<InteractiveAvatarRef>(null);
  const [avatarConfig, setAvatarConfig] = useState<StartAvatarRequest | null>(null);
  const [avatarConfigLoading, setAvatarConfigLoading] = useState(false);

  const [avatarTimeLimitSeconds, setAvatarTimeLimitSeconds] = useState<number | null>(null);
  const [avatarTotalSeconds, setAvatarTotalSeconds] = useState(0);
  const [avatarLimitExhausted, setAvatarLimitExhausted] = useState(false);
  const [avatarGrandfathered, setAvatarGrandfathered] = useState(false);
  const avatarModeStartRef = useRef<number | null>(null);
  const avatarTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const avatarTotalSecondsRef = useRef(0);

  const [avatarPortraits, setAvatarPortraits] = useState<Record<string, string>>({});
  const [showFinishModal, setShowFinishModal] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);
  const playStartedAtRef = useRef<number | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartRef = useRef(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const meterSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const meterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const peakRmsRef = useRef(0);
  const recordingStartInFlightRef = useRef(false);

  // Silence unused-setter lint for cohort-only time-limit state (kept for UI parity).
  void setAvatarTimeLimitSeconds;

  useEffect(() => {
    if (pageState !== "playing") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/avatar/status");
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setHeygenAvatarConfigured(Boolean(data.heygenConfigured));
      } catch {
        if (!cancelled) setHeygenAvatarConfigured(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageState]);

  // If server reports HeyGen unavailable, do not stay in avatar mode
  useEffect(() => {
    if (pageState !== "playing") return;
    if (heygenAvatarConfigured !== false) return;
    if (interactionMode !== "avatar") return;
    setInteractionMode("text");
  }, [pageState, heygenAvatarConfigured, interactionMode]);
  // Fetch avatar portrait images from their linked profiles
  useEffect(() => {
    if (!caseData?.avatars) return;
    const avatarsWithProfiles = caseData.avatars.filter((a) => a.profileId);
    if (avatarsWithProfiles.length === 0) return;

    Promise.all(
      avatarsWithProfiles.map(async (avatar) => {
        try {
          const res = await fetch(`/api/profile/get?id=${encodeURIComponent(avatar.profileId!)}`);
          if (!res.ok) return null;
          const data = await res.json();
          const portrait = data.profile?.portrait;
          if (portrait) return { id: avatar.id, portrait };
        } catch {}
        return null;
      })
    ).then((results) => {
      const portraits: Record<string, string> = {};
      for (const r of results) {
        if (r) portraits[r.id] = r.portrait;
      }
      setAvatarPortraits(portraits);
    });
  }, [caseData]);
  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, selectedRole]);

  // Keep ref in sync so auto-save always has the latest log
  useEffect(() => {
    interactionLogRef.current = interactionLog;
  }, [interactionLog]);

  // Auto-save every 15 seconds for assessed mode
  useEffect(() => {
    if (pageState === "playing" && mode === "assessed") {
      autoSaveRef.current = setInterval(() => {
        if (interactionLogRef.current) {
          queueAutosave(interactionLogRef.current);
        }
      }, 15000);

      return () => {
        if (autoSaveRef.current) clearInterval(autoSaveRef.current);
      };
    }
  }, [pageState, mode]);

  // Keep avatarTotalSecondsRef in sync with state
  useEffect(() => {
    avatarTotalSecondsRef.current = avatarTotalSeconds;
  }, [avatarTotalSeconds]);

  // Cleanup avatar timer on unmount
  useEffect(() => {
    return () => {
      if (avatarTimerRef.current) clearInterval(avatarTimerRef.current);
    };
  }, []);
  const releaseMicStream = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (recorder?.state === "recording") {
      // Leaving a scenario should not send a partial answer after the page closes.
      recorder.onstop = null;
      recorder.stop();
    }
    recordingStartInFlightRef.current = false;
    setIsRecording(false);
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    // Tear the meter down with the stream: its source node references it, and
    // browsers cap how many AudioContexts a page may hold open.
    if (meterTimerRef.current !== null) {
      clearInterval(meterTimerRef.current);
      meterTimerRef.current = null;
    }
    meterSourceRef.current?.disconnect();
    meterSourceRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  // Release the mic on unmount so the browser recording indicator clears.
  useEffect(() => releaseMicStream, [releaseMicStream]);

  // ---- Scenario-only capture lifecycle (Task 2) ----
  // Vocal capture is created once per scenario run, independent of
  // cameraMode — audio accounting exists regardless of the camera choice.
  // Never created for the admin case-study path.
  useEffect(() => {
    if (!isScenario) return;
    vocalCaptureRef.current = createVocalCapture();
    return () => {
      vocalCaptureRef.current?.detachStream();
      vocalCaptureRef.current = null;
    };
  }, [isScenario]);

  /** Stops the visual engine, returns its final scalar metrics, and stops
   * every camera track. Idempotent and safe from any exit path — the camera
   * LED must go out every time this runs, and does so synchronously, ahead
   * of the (now async, but bounded) engine stop awaited below. */
  const stopAndReleaseVisualCapture = useCallback(async (): Promise<VisualMetrics | null> => {
    const handle = visualCaptureRef.current;
    visualCaptureRef.current = null;
    scenarioCameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    scenarioCameraStreamRef.current = null;
    setScenarioSelfViewStream(null);

    let result: VisualMetrics | null = null;
    try {
      result = (await handle?.stop()) ?? null;
    } catch {
      result = null;
    }
    return result;
  }, []);

  /** Combined release for exit paths that don't need the resulting metrics
   * (unmount, Save & exit) — mirrors `stopAndReleaseVisualCapture` plus the
   * vocal engine's stream detach. Runs from an unmount cleanup, where a
   * promise cannot be awaited, so the engine stop is fire-and-forget; the
   * camera track release inside it is still synchronous and immediate. */
  const releaseScenarioCapture = useCallback(() => {
    void stopAndReleaseVisualCapture().catch(() => {});
    vocalCaptureRef.current?.detachStream();
  }, [stopAndReleaseVisualCapture]);

  // Release camera + vocal capture on unmount — a fourth exit path
  // alongside Finish, Save & exit, and a pageState change away from
  // "playing" (Finish/Save & exit navigate away entirely, so unmount is
  // this effect's only real trigger, but it must still fire).
  useEffect(() => releaseScenarioCapture, [releaseScenarioCapture]);

  // Visual capture starts once the run is live (`pageState === "playing"`),
  // gated on `isScenario && cameraMode === "ON"`. Deliberately NOT gated on
  // the avatar connecting: unlike the interview flow (whose avatar is always
  // present regardless of the text/voice input choice), a case-play run may
  // stay in text mode the ENTIRE time and never render an avatar at all — a
  // camera-on run answered entirely by typing must still produce a Visual
  // score (see 10-10-PLAN.md verify case 2), so this cannot depend on an
  // avatar-connected signal that a text-only run would never emit. Starting
  // immediately here also avoids any risk of the two independent connections
  // (camera getUserMedia vs. the HeyGen WebRTC handshake) contending with
  // each other, which protects REQ-49 at least as well as sequencing them.
  // Keeps the visual engine's conversational window locked to the recorder.
  // An effect on `isRecording` rather than a call beside each
  // `setIsRecording` — there are three of those, and hand-wiring each is how
  // the visual window would drift away from the vocal pipeline's turn
  // accounting.
  useEffect(() => {
    isRecordingRef.current = isRecording;
    visualCaptureRef.current?.setSpeaking(isRecording);
  }, [isRecording]);

  useEffect(() => {
    if (pageState === "playing" && playStartedAtRef.current === null) {
      playStartedAtRef.current = Date.now();
    }
  }, [pageState]);

  useEffect(() => {
    if (pageState !== "playing") return;
    if (!isScenario || cameraMode !== "ON") return;
    if (visualCaptureRef.current) return;
    let cancelled = false;
    void (async () => {
      const result = await requestCameraStream();
      if (cancelled) {
        // The effect was torn down while getUserMedia was in flight. The
        // stream still opened, so stop it here — returning without stopping
        // orphans a live camera that no teardown path can reach, leaving the
        // indicator light on after the session ends.
        if (result.ok) {
          result.stream.getTracks().forEach((t) => t.stop());
        }
        return;
      }
      if (!result.ok) {
        // The intro screen's own probe already succeeded — the camera was
        // seized or revoked between screens. The student is already live;
        // never block a running session. The null visual block resolves to
        // INSUFFICIENT_DATA server-side (REQ-42).
        addToast({
          title: "Your camera stopped responding",
          description: "Visual won't be measured for this session.",
          color: "warning",
        });
        return;
      }
      // Defence in depth against a second acquisition slipping through.
      if (scenarioCameraStreamRef.current) {
        scenarioCameraStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      scenarioCameraStreamRef.current = result.stream;
      setScenarioSelfViewStream(result.stream);
      const capture = createVisualCapture({
        stream: result.stream,
        // MUST be the same zero point the transcript is stamped against —
        // `log.startedAt`, which `buildScenarioTranscript` renders elapsed
        // times from. Using a separate page-local clock here would offset
        // every episode from the sentence it belongs to, plausibly and with
        // no visible symptom. `playStartedAtRef` is only a fallback for the
        // case where the log has somehow not landed yet.
        sessionStartedAtMs:
          interactionLogRef.current?.startedAt ??
          playStartedAtRef.current ??
          Date.now(),
        onFaceStateChange: (detected) => setFaceDetected(detected),
      });
      visualCaptureRef.current = capture;
      capture.setSpeaking(isRecordingRef.current);
      void capture.start();
    })();
    return () => {
      cancelled = true;
    };
  }, [pageState, isScenario, cameraMode]);

  // Save interaction on page unload (tab close / navigate away)
  useEffect(() => {
    const handleUnload = () => {
      const log = interactionLogRef.current;
      if (log && log.mode === "assessed") {
        navigator.sendBeacon(
          "/api/interaction/save",
          new Blob([JSON.stringify({ log })], { type: "application/json" })
        );
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);
  // Watch for limit exhaustion — set flag without interrupting current session
  useEffect(() => {
    if (avatarTimeLimitSeconds !== null && avatarTotalSeconds >= avatarTimeLimitSeconds && !avatarLimitExhausted) {
      setAvatarLimitExhausted(true);
      // If currently in an active avatar session, let it finish
      if (interactionMode === "avatar") {
        setAvatarGrandfathered(true);
      }
    }
  }, [avatarTotalSeconds, avatarTimeLimitSeconds, avatarLimitExhausted, interactionMode]);
  // Load avatar config when role changes or when switching to avatar mode.
  // Student-authored scenario characters carry a raw HeyGen `avatarId`/
  // `voiceId` pair and need no lookup; legacy admin cases carry a
  // `profileId` and resolve through `/api/profile/get` exactly as before.
  useEffect(() => {
    if (interactionMode !== "avatar" || !selectedRole) return;
    if (selectedRole.avatarId && selectedRole.voiceId) {
      setAvatarConfigLoading(false);
      setAvatarConfig({
        quality: "low",
        avatarName: selectedRole.avatarId,
        voice: { voiceId: selectedRole.voiceId, rate: 1.05 },
        language: attemptLanguage.code,
      });
    } else if (selectedRole.profileId) {
      loadAvatarConfig(selectedRole.profileId);
    }
  }, [interactionMode, selectedRole]);

  const loadAvatarConfig = async (profileId: string) => {
    setAvatarConfigLoading(true);
    try {
      const res = await fetch(`/api/profile/get?id=${encodeURIComponent(profileId)}`);
      if (!res.ok) throw new Error("Failed to load profile");
      const data = await res.json();
      const profile: VideoAudioProfile = data.profile;
      setAvatarConfig({
        quality: profile.quality,
        avatarName: profile.avatarName,
        knowledgeId: profile.knowledgeId,
        voice: profile.voice,
        // The attempt's language wins over the profile's: it is what the
        // student chose and what the role is being told to speak.
        language: attemptLanguage.code,
      });
    } catch (err) {
      console.error("Failed to load avatar profile:", err);
      addToast({ title: "Failed to load avatar profile, using defaults", color: "warning" });
      setAvatarConfig(null);
    } finally {
      setAvatarConfigLoading(false);
    }
  };

  const saveInteraction = async (log: InteractionLog) => {
    if (log.mode !== "assessed") return;
    const sig = logSignature(log);
    setSaveState("saving");
    try {
      await fetch("/api/interaction/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ log }),
      });
      lastSavedSigRef.current = sig;
      setSaveState("saved");
      setLastSavedAt(Date.now());
    } catch (err) {
      console.error("Save failed:", err);
      setSaveState("error");
    }
  };

  /** Non-blocking autosave: skips when clean or a save is already in flight. */
  const queueAutosave = (log: InteractionLog) => {
    if (log.mode !== "assessed") return;
    if (saveInFlightRef.current) return;
    if (logSignature(log) === lastSavedSigRef.current) return;
    saveInFlightRef.current = true;
    void saveInteraction(log).finally(() => {
      saveInFlightRef.current = false;
    });
  };

  const handleSelectRole = (role: CaseAvatar) => {
    if (!interactionLog) return;

    const now = Date.now();

    // If we were in another role, add exit event
    if (selectedRole && selectedRole.id !== role.id) {
      const exitEvent: InteractionEvent = {
        type: "exit_role",
        roleId: selectedRole.id,
        roleName: selectedRole.name,
        timestamp: now,
      };
      interactionLog.events.push(exitEvent);

      // Update the exitedAt for the previous role
      if (interactionLog.roleInteractions[selectedRole.id]) {
        interactionLog.roleInteractions[selectedRole.id].exitedAt = now;
      }

      // Stop avatar session when switching roles
      if (interactionMode === "avatar") {
        stopAvatarTimer();
        avatarRef.current?.stopSession();
      }
    }

    // Add enter event
    const enterEvent: InteractionEvent = {
      type: "enter_role",
      roleId: role.id,
      roleName: role.name,
      timestamp: now,
    };
    interactionLog.events.push(enterEvent);

    // Ensure role interaction exists
    if (!interactionLog.roleInteractions[role.id]) {
      interactionLog.roleInteractions[role.id] = {
        roleId: role.id,
        roleName: role.name,
        messages: [],
        enteredAt: now,
      };
    } else {
      // Re-entering an existing role
      interactionLog.roleInteractions[role.id].enteredAt = now;
      interactionLog.roleInteractions[role.id].exitedAt = undefined;
    }

    setSelectedRole(role);
    setInteractionLog({ ...interactionLog });

    // Force text mode when switching to a new role if avatar limit is exhausted
    if (avatarLimitExhausted && interactionMode === "avatar") {
      setAvatarGrandfathered(false);
      setInteractionMode("text");
    }
  };

  const stopAvatarTimer = () => {
    if (avatarTimerRef.current) {
      clearInterval(avatarTimerRef.current);
      avatarTimerRef.current = null;
    }
    avatarModeStartRef.current = null;
    // avatarTotalSeconds is NOT reset — it keeps accumulating across sessions
  };

  const startAvatarTimer = useCallback(() => {
    if (avatarTimerRef.current) return;
    avatarModeStartRef.current = Date.now();
    const baseTotal = avatarTotalSecondsRef.current;
    avatarTimerRef.current = setInterval(() => {
      if (avatarModeStartRef.current !== null) {
        setAvatarTotalSeconds(baseTotal + Math.round((Date.now() - avatarModeStartRef.current) / 1000));
      }
    }, 1000);
  }, []);

  const handleAvatarSessionStateChange = useCallback((state: StreamingAvatarSessionState) => {
    if (state === StreamingAvatarSessionState.CONNECTED) {
      startAvatarTimer();
    } else {
      stopAvatarTimer();
    }
  }, [startAvatarTimer]);

  const handleAvatarTokenError = useCallback((err: HeygenSessionError) => {
    if (err.code === "HEYGEN_MISSING_KEY" || err.code === "HEYGEN_INVALID_KEY") {
      setHeygenAvatarConfigured(false);
      setInteractionMode("text");
      addToast({
        title: "Switched to text chat",
        description: err.message,
        color: "warning",
      });
    }
  }, []);

  const handleSwitchInteractionMode = (newMode: InteractionMode) => {
    if (newMode === interactionMode) return;
    if (!interactionLog || !selectedRole) return;

    // Block switching to avatar if limit is exhausted
    if (newMode === "avatar" && avatarLimitExhausted) return;

    if (newMode === "avatar" && heygenAvatarConfigured === false) {
      addToast({
        title: "Avatar unavailable",
        description:
          "HeyGen is not configured or the API key is invalid. Use text chat or ask your instructor to set HEYGEN_API_KEY.",
        color: "warning",
      });
      return;
    }

    const now = Date.now();

    // Log the mode switch event
    const switchEvent: InteractionEvent = {
      type: "switch_interaction_mode",
      roleId: selectedRole.id,
      roleName: selectedRole.name,
      timestamp: now,
      interactionMode: newMode,
    };
    interactionLog.events.push(switchEvent);
    setInteractionLog({ ...interactionLog });

    if (newMode === "avatar") {
      // Timer will start when the avatar session reports CONNECTED
    } else if (interactionMode === "avatar") {
      // Pause timer — total already includes this session's time via setInterval
      stopAvatarTimer();
      avatarRef.current?.stopSession();
      setAvatarGrandfathered(false);
      releaseMicStream();
    }

    setInteractionMode(newMode);
  };

  // Shared function to send a message and get AI response (used by both text and voice input)
  const sendMessageAndGetResponse = async (userMessage: string) => {
    if (!selectedRole || !interactionLog || !caseData) return;

    setSending(true);

    const now = Date.now();
    const userMsg: RoleMessage = { role: "user", content: userMessage, timestamp: now };
    const roleId = selectedRole.id;

    // Update local chat state
    setChatMessages((prev) => ({
      ...prev,
      [roleId]: [...(prev[roleId] || []), userMsg],
    }));

    // Update interaction log
    interactionLog.roleInteractions[roleId].messages.push(userMsg);
    interactionLog.events.push({
      type: "send_message",
      roleId,
      roleName: selectedRole.name,
      timestamp: now,
      messageContent: userMessage,
      messageRole: "user",
    });

    try {
      // Cap prompt growth: keep the most recent turns only. The case background
      // lives in the system message (server-side) and is unaffected by this window.
      const HISTORY_TURNS = 10;              // ~10 user+assistant exchanges
      const allMessages = interactionLog.roleInteractions[roleId].messages;
      const roleHistory = allMessages
        .slice(-HISTORY_TURNS * 2)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/interaction/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: roleHistory,
          language: attemptLanguage.code,
          systemPrompt: `Background information about this case study:\n${caseData.backgroundInfo}`,
          roleContext: {
            roleName: selectedRole.name,
            role: selectedRole.role,
            additionalInfo: selectedRole.additionalInfo,
          },
        }),
      });

      if (!res.ok) throw new Error("Chat failed");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream reader");
      const decoder = new TextDecoder();

      let sseBuffer = "";
      let fullText = "";
      let speakBuffer = "";
      let streamErrored = false;

      const flush = (final: boolean) => {
        const { chunks, rest } = extractSpeakable(speakBuffer);
        speakBuffer = rest;
        for (const c of chunks) {
          if (interactionModeRef.current === "avatar") avatarRef.current?.speak(c);
        }
        if (final && speakBuffer.trim()) {
          if (interactionModeRef.current === "avatar") avatarRef.current?.speak(speakBuffer.trim());
          speakBuffer = "";
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let evt: { type?: string; delta?: string; content?: string };
          try {
            evt = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (evt.type === "content") {
            const piece = evt.delta ?? "";
            if (!piece) continue;
            fullText += piece;
            speakBuffer += piece;
            setStreamingText(fullText);
            flush(false);
          } else if (evt.type === "error") {
            streamErrored = true;
          }
        }
      }

      flush(true);
      setStreamingText("");

      if (streamErrored || !fullText.trim()) {
        // If we spoke any text before the error, log it as a partial message
        if (fullText.trim()) {
          const partialMsg: RoleMessage = {
            role: "assistant",
            content: fullText,
            timestamp: Date.now(),
          };
          setChatMessages((prev) => ({
            ...prev,
            [roleId]: [...(prev[roleId] || []), partialMsg],
          }));
          interactionLog.roleInteractions[roleId].messages.push(partialMsg);
          interactionLog.events.push({
            type: "receive_message",
            roleId,
            roleName: selectedRole.name,
            timestamp: Date.now(),
            messageContent: fullText,
            messageRole: "assistant",
            // Mark as partial so evaluator knows this was interrupted
            partial: true,
          } as any); // Cast needed since partial field may not be in type yet
          setInteractionLog({ ...interactionLog });
        }
        throw new Error("Chat stream failed");
      }

      const assistantMsg: RoleMessage = {
        role: "assistant",
        content: fullText,
        timestamp: Date.now(),
      };
      setChatMessages((prev) => ({
        ...prev,
        [roleId]: [...(prev[roleId] || []), assistantMsg],
      }));
      interactionLog.roleInteractions[roleId].messages.push(assistantMsg);
      interactionLog.events.push({
        type: "receive_message",
        roleId,
        roleName: selectedRole.name,
        timestamp: Date.now(),
        messageContent: fullText,
        messageRole: "assistant",
      });
      setInteractionLog({ ...interactionLog });
      return fullText;
    } catch (err) {
      console.error("Chat error:", err);
      // Stop the avatar from speaking any queued audio
      if (interactionModeRef.current === "avatar") {
        avatarRef.current?.interrupt?.();
      }
      addToast({ title: "Failed to get response", color: "danger" });
      setStreamingText("");
    } finally {
      setSending(false);
    }
  };

  // This is the only path that records a TYPED turn (REQ-44). The
  // push-to-talk path below records its own SPOKEN turn inside
  // `processRecording` and must never also count as typed — the two are
  // mutually exclusive per submission, which is exactly what makes the
  // turn-level accounting correct across a mid-session Text/Avatar switch
  // (see the file-level note at `processRecording`).
  const handleSendMessage = async () => {
    if (!currentInput.trim()) return;
    const userMessage = currentInput.trim();
    setCurrentInput("");
    if (isScenario) vocalCaptureRef.current?.recordTypedTurn();
    await sendMessageAndGetResponse(userMessage);
  };

  // Push-to-talk handlers for avatar mode
  /** Acquire the mic once and reuse it; re-acquire if tracks were ended externally. */
  const getMicStream = async (): Promise<MediaStream> => {
    const existing = micStreamRef.current;
    const live = existing?.getAudioTracks().some((t) => t.readyState === "live");
    if (existing && live) return existing;
    existing?.getTracks().forEach((t) => t.stop());
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStreamRef.current = stream;
    // Reuses the SAME audio stream the push-to-talk path already owns — no
    // second getUserMedia({ audio: true }) call. The vocal engine runs its
    // own independent AnalyserNode and does not touch startLevelMetering/
    // peakRmsRef above.
    if (isScenario) vocalCaptureRef.current?.attachStream(stream);
    return stream;
  };

  /**
   * Sample the mic's loudness while recording and remember the loudest moment.
   * A muted mic, or Chrome bound to the wrong input device, still produces a
   * long well-formed webm — duration and byte size cannot tell it apart from
   * speech, but the signal level can.
   */
  const startLevelMetering = (stream: MediaStream) => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return; // No Web Audio: fall back to the size/duration gate alone.

      const ctx = audioCtxRef.current ?? new AudioCtx();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") void ctx.resume();

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      meterSourceRef.current = source;

      const samples = new Float32Array(analyser.fftSize);
      peakRmsRef.current = 0;
      meterTimerRef.current = setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        let sumSquares = 0;
        for (const s of samples) sumSquares += s * s;
        const rms = Math.sqrt(sumSquares / samples.length);
        if (rms > peakRmsRef.current) peakRmsRef.current = rms;
      }, 50);
    } catch (error) {
      // Metering is a guard, not a feature — never block recording on it.
      console.warn("Level metering unavailable:", error);
    }
  };

  const stopLevelMetering = () => {
    if (meterTimerRef.current !== null) {
      clearInterval(meterTimerRef.current);
      meterTimerRef.current = null;
    }
    meterSourceRef.current?.disconnect();
    meterSourceRef.current = null;
  };

  const startRecording = async () => {
    if (
      sending ||
      isTranscribing ||
      recordingStartInFlightRef.current ||
      mediaRecorderRef.current?.state === "recording"
    ) {
      return;
    }
    recordingStartInFlightRef.current = true;
    try {
      const stream = await getMicStream();
      if (sending || isTranscribing) return;
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (mediaRecorderRef.current === mediaRecorder) {
          mediaRecorderRef.current = null;
        }
        // Stream is cached and intentionally left live for the next recording.
        stopLevelMetering();
        void processRecording();
      };

      recordingStartRef.current = Date.now();
      avatarRef.current?.interrupt();
      startLevelMetering(stream);
      mediaRecorder.start();
      // Deliberately uncapped — see the matching note in
      // `components/interview/InterviewSessionShell.tsx`. A long answer is a
      // conciseness finding for the report, not something to truncate.
      setIsRecording(true);
    } catch (error) {
      console.error("Error starting recording:", error);
      addToast({ title: "Could not access microphone", color: "danger" });
    } finally {
      recordingStartInFlightRef.current = false;
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state !== "recording") return;
    recorder.stop();
    setIsRecording(false);
  };

  // A near-silent clip makes gpt-4o-transcribe hallucinate — it invents a phrase
  // in a random language, which then gets sent to the LLM as a real user turn.
  // Drop anything too short, too small, or too quiet to contain speech.
  const MIN_RECORDING_MS = 400;
  const MIN_AUDIO_BYTES = 2048;
  // Peak RMS over the clip. Room noise sits near 0.001–0.005; speech peaks well
  // above 0.05 even from a quiet speaker at arm's length.
  const MIN_PEAK_RMS = 0.01;

  const processRecording = async () => {
    if (audioChunksRef.current.length === 0) return;

    const elapsedMs = Date.now() - recordingStartRef.current;
    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
    const peakRms = peakRmsRef.current;

    if (elapsedMs < MIN_RECORDING_MS || audioBlob.size < MIN_AUDIO_BYTES) {
      audioChunksRef.current = [];
      addToast({
        title: "Nothing recorded",
        description: "Tap the microphone, speak, then tap again to send.",
        color: "warning",
      });
      return;
    }

    // peakRms is 0 when metering could not run at all; don't reject on that.
    if (peakRms > 0 && peakRms < MIN_PEAK_RMS) {
      audioChunksRef.current = [];
      console.warn(`[mic] discarded silent clip (peak RMS ${peakRms.toFixed(5)})`);
      addToast({
        title: "No speech detected",
        description:
          "Your microphone picked up silence. Check that the right input device is selected and not muted.",
        color: "warning",
      });
      return;
    }

    // Q4 (this is the resolution — see 10-10-PLAN.md and 10-CONTEXT.md):
    // `interactionMode` (text/avatar) is a SEPARATE control from `cameraMode`
    // and, unlike the camera lock, it CAN be switched mid-run via
    // `handleSwitchInteractionMode`. Forcing a second locked control just to
    // make vocal accounting simple was rejected — nobody asked for that, and
    // it would make the toggle behave inconsistently with itself. Instead,
    // accounting is TURN-LEVEL with a SESSION-LEVEL verdict: every turn is
    // tagged spoken or typed the moment it happens (here, and in
    // `handleSendMessage`'s `recordTypedTurn()`), and `resolveVocalOutcome`
    // (lib/metrics/coverage.ts, consumed by the evaluation runners from
    // 10-07) decides from the AGGREGATE at finish — scored if there was
    // enough real speech, `TYPED_ONLY` if the student never spoke at all,
    // `SPEECH_TOO_SHORT` if they spoke but not enough to score reliably
    // (12-08 Task 1 checkpoint, Defect F split these two apart — they used
    // to collapse into one `TYPED_ONLY` reason, which told a student who
    // DID speak that they had typed). A mixed session is
    // therefore scored on its spoken portion only: typed turns contribute
    // nothing and subtract nothing (REQ-44). Do not "simplify" this to a
    // session-level flag — that would penalise a student who typed two
    // answers and spoke the rest.
    //
    // Fire-and-forget, never awaited — the live transcription latency the
    // student feels must be unchanged. A clip rejected by either guard above
    // is not a spoken turn and must never reach here.
    if (isScenario) vocalCaptureRef.current?.submitSpokenTurn(audioBlob, elapsedMs);

    setIsTranscribing(true);

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      formData.append("language", attemptLanguage.code);

      const response = await fetch("/api/audio/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Transcription failed");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");
      const decoder = new TextDecoder();

      let buffer = "";
      let transcribedText = "";
      let transcriptionFailed = false;
      let finished = false;

      setPartialTranscript("");

      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let data: { type?: string; text?: string; delta?: string };
          try {
            data = JSON.parse(line.slice(6));
          } catch (parseError) {
            console.error("Error parsing transcription frame:", parseError);
            continue;
          }
          if (data.type === "delta") {
            transcribedText = data.text ?? transcribedText;
            setPartialTranscript(transcribedText);   // show it as it arrives
          } else if (data.type === "done") {
            transcribedText = data.text ?? transcribedText;
            setPartialTranscript(transcribedText);
            finished = true;                          // now actually exits the outer loop
            break;
          } else if (data.type === "error") {
            transcriptionFailed = true;
            finished = true;
            break;
          }
        }
      }
      void reader.cancel().catch(() => {});           // release the body early

      if (transcriptionFailed) throw new Error("Transcription error");

      if (transcribedText.trim()) {
        await sendMessageAndGetResponse(transcribedText.trim());
      }
    } catch (error) {
      console.error("Error processing recording:", error);
      addToast({ title: "Failed to transcribe audio", color: "danger" });
    } finally {
      setIsTranscribing(false);
      setPartialTranscript("");
    }
  };

  const toggleRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      stopRecording();
      return;
    }
    void startRecording();
  };


  const handleFinish = async () => {
    if (!interactionLog) return;

    setFinishing(true);
    try {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);

      if (interactionMode === "avatar") {
        stopAvatarTimer();
        avatarRef.current?.stopSession();
      }

      releaseMicStream();

      let visual: VisualMetrics | null = null;
      let vocal: VocalMetrics | null = null;
      try {
        visual = await stopAndReleaseVisualCapture();
      } catch {
        visual = null;
      }
      try {
        vocal = (await vocalCaptureRef.current?.drain()) ?? null;
      } catch {
        vocal = null;
      }
      vocalCaptureRef.current?.detachStream();

      const res = await fetch("/api/practice/session/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          reportId,
          log: interactionLog,
          metrics: { cameraMode, visual, vocal },
        }),
      });

      if (!res.ok && res.status !== 409) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data?.error === "string" ? data.error : "Failed to finish",
        );
      }

      addToast({
        title: "Session complete — your report is being prepared.",
        color: "success",
      });

      onFinish(reportId);
    } catch (err) {
      console.error("Finish error:", err);
      addToast({ title: "Failed to end session", color: "danger" });
    } finally {
      setFinishing(false);
    }
  };

  const handleSaveAndExit = async () => {
    setLeavingCase(true);
    try {
      if (autoSaveRef.current) {
        clearInterval(autoSaveRef.current);
        autoSaveRef.current = null;
      }
      if (interactionMode === "avatar") {
        stopAvatarTimer();
        avatarRef.current?.stopSession();
        setAvatarGrandfathered(false);
      }
      releaseMicStream();
      releaseScenarioCapture();
      const log = interactionLogRef.current;
      if (log?.mode === "assessed") {
        await saveInteraction(log);
      }
      addToast({
        title: "Progress saved",
        description:
          "Continue later from My Cases. Nothing was submitted for grading.",
        color: "success",
      });
      onExit();
    } catch (err) {
      console.error("Save and exit failed:", err);
      addToast({
        title: "Could not save before leaving",
        description: "Check your connection and try again.",
        color: "danger",
      });
    } finally {
      setLeavingCase(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Check if current role has an avatar configured for avatar mode — either
  // a student-scenario avatarId/voiceId pair or a legacy admin profileId.
  const roleHasAvatarProfile =
    (selectedRole?.avatarId != null && selectedRole?.voiceId != null) ||
    selectedRole?.profileId != null;

  // PLAYING PAGE
  const currentRoleMessages = selectedRole ? (chatMessages[selectedRole.id] || []) : [];

  return (
    <div className="relative flex h-full gap-4 p-4">
      {/* Left sidebar - Roles */}
      <div className="w-64 shrink-0 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Roles</h3>
          <Chip size="sm" variant="flat" color={mode === "assessed" ? "primary" : "default"}>
            {mode === "assessed" ? "Assessed" : "Explore"}
          </Chip>
        </div>
        {mode === "assessed" && (
          <p className="text-xs text-default-500">
            Progress auto-saves every 15s. You can close this page and continue later.
          </p>
        )}
        {mode === "assessed" && (
          <p className={`text-xs ${saveState === "error" ? "text-danger-500" : "text-default-400"}`}>
            {saveState === "saving" && "Saving..."}
            {saveState === "saved" && `Saved at ${lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString() : "just now"}`}
            {saveState === "error" && "Auto-save failed. We will retry shortly."}
            {saveState === "idle" && "Autosave is ready."}
          </p>
        )}
        {heygenAvatarConfigured === false && (
          <p className="text-xs text-warning-700 dark:text-warning-600">
            Avatar mode is unavailable (HeyGen API key missing or invalid on the server). Text chat still works.
          </p>
        )}

        <div className="flex flex-col gap-2 flex-1 overflow-y-auto px-1 -mx-1">
          {caseData.avatars?.map((avatar) => {
            const msgCount = (chatMessages[avatar.id] || []).length;
            const isSelected = selectedRole?.id === avatar.id;
            return (
              <Card
                key={avatar.id}
                isPressable
                className={`transition-all ${isSelected ? "border-2 border-primary bg-primary/5" : "hover:bg-default-50"}`}
                onPress={() => handleSelectRole(avatar)}
              >
                <CardBody className="p-3">
                  <div className="flex items-center gap-3">
                    <AvatarImage
                      portrait={avatarPortraits[avatar.id]}
                      name={avatar.name}
                      size={32}
                      className="shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{avatar.name}</p>
                      <p className="text-xs text-default-500 line-clamp-1">{avatar.role}</p>
                      {msgCount > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          <MessageSquare className="w-3 h-3 text-default-400" />
                          <span className="text-xs text-default-400">{msgCount} messages</span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 w-full shrink-0">
          <Button
            variant="bordered"
            color="default"
            startContent={<DoorOpen className="w-4 h-4" />}
            onPress={handleSaveAndExit}
            isLoading={leavingCase}
            isDisabled={finishing}
            className="w-full"
          >
            Save &amp; exit
          </Button>
          <p className="text-[11px] text-center text-default-400 leading-snug px-0.5">
            Returns to My Cases without submitting. Your attempt stays in progress.
          </p>
          <Button
            color="danger"
            variant="flat"
            startContent={<CheckCircle className="w-4 h-4" />}
            onPress={() => setShowFinishModal(true)}
            isLoading={finishing}
            isDisabled={leavingCase}
            className="w-full"
          >
            I&apos;m Finished
          </Button>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col border rounded-lg overflow-hidden">
        {!selectedRole ? (
          <div className="flex-1 flex items-center justify-center text-default-400">
            <div className="text-center">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Select a person to talk to</p>
              <p className="text-sm">Choose from the roles on the left</p>
            </div>
          </div>
        ) : interactionMode === "avatar" && avatarLimitExhausted && !avatarGrandfathered ? (
          /* ── Avatar limit exhausted screen ── */
          <div className="flex-1 flex items-center justify-center bg-default-50">
            <div className="text-center max-w-md px-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-danger-100 flex items-center justify-center">
                <Video className="w-8 h-8 text-danger-500" />
              </div>
              <h3 className="text-xl font-semibold text-default-800 mb-2">Avatar Time Used Up</h3>
              <p className="text-default-500 mb-6">
                You have used all {avatarTimeLimitSeconds !== null ? avatarTimeLimitSeconds / 60 : 0} minutes of avatar interaction for this case. You can continue the case study using text chat.
              </p>
              <Button
                color="primary"
                onPress={() => setInteractionMode("text")}
                startContent={<Type className="w-4 h-4" />}
              >
                Continue with Text
              </Button>
            </div>
          </div>
        ) : interactionMode === "avatar" ? (
          /* ── Immersive avatar mode: video fills the area, UI floats on top ── */
          <div className="relative flex-1 bg-black overflow-hidden">
            {/* Background video layer */}
            {avatarConfigLoading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Spinner size="lg" label="Loading avatar..." className="text-white" />
              </div>
            ) : (
              <div className="absolute inset-0">
                <InteractiveAvatarWrapper
                  ref={avatarRef}
                  config={avatarConfig ?? undefined}
                  showHistory={false}
                  autoStart={true}
                  cleanMode={true}
                  onSessionStateChange={handleAvatarSessionStateChange}
                  onSessionTokenError={handleAvatarTokenError}
                />
              </div>
            )}

            {/* Self-view in the bottom-right of the AVATAR panel, the usual
                video-call convention. In text mode there is no avatar panel,
                so a page-level fallback renders it instead (see below). */}
            <SelfViewThumbnail stream={scenarioSelfViewStream} />

            {/* Floating header */}
            <div className="absolute top-0 left-0 right-0 z-10 p-3 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent">
              <div>
                <p className="font-semibold text-white">{selectedRole.name}</p>
                <p className="text-sm text-white/70">{selectedRole.role}</p>
              </div>
              <div className="flex items-center gap-2">
                {roleHasAvatarProfile && (
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="flat"
                        className="bg-white/10 text-white/70"
                        onPress={() => handleSwitchInteractionMode("text")}
                        startContent={<Type className="w-3 h-3" />}
                      >
                        Text
                      </Button>
                      {(() => {
                        const limitExhausted = avatarLimitExhausted;
                        const avatarUnavailable = heygenAvatarConfigured !== true;
                        return (
                          <Button
                            size="sm"
                            variant="flat"
                            className="bg-white/20 text-white"
                            onPress={() => handleSwitchInteractionMode("avatar")}
                            startContent={<Video className="w-3 h-3" />}
                            isDisabled={limitExhausted || avatarUnavailable}
                          >
                            Avatar
                          </Button>
                        );
                      })()}
                    </div>
                    {avatarTimeLimitSeconds !== null && (
                      <span className={`text-xs font-medium ${avatarLimitExhausted ? "text-danger-400" : "text-white/60"}`}>
                        {avatarLimitExhausted
                          ? "Limit reached"
                          : (() => {
                              const remaining = avatarTimeLimitSeconds - avatarTotalSeconds;
                              return remaining < 60
                                ? `${remaining}s left`
                                : `${Math.floor(remaining / 60)}m left`;
                            })()
                        }
                      </span>
                    )}
                  </div>
                )}
                <Button
                  size="sm"
                  variant="flat"
                  className="bg-white/10 text-white/70 hover:bg-white/20"
                  startContent={<LogOut className="w-4 h-4" />}
                  onPress={() => {
                    if (interactionLog && selectedRole) {
                      const now = Date.now();
                      interactionLog.events.push({
                        type: "exit_role",
                        roleId: selectedRole.id,
                        roleName: selectedRole.name,
                        timestamp: now,
                      });
                      if (interactionLog.roleInteractions[selectedRole.id]) {
                        interactionLog.roleInteractions[selectedRole.id].exitedAt = now;
                      }
                      setInteractionLog({ ...interactionLog });
                    }
                    stopAvatarTimer();
                    avatarRef.current?.stopSession();
                    setAvatarGrandfathered(false);
                    setSelectedRole(null);
                  }}
                >
                  Back to Roles
                </Button>
              </div>
            </div>

            {/* Floating input area */}
            <div className="absolute bottom-0 left-0 right-0 z-10 p-4 bg-gradient-to-t from-black/60 to-transparent">
              <div className="flex flex-col items-center gap-2">
                {(isRecording || isTranscribing || partialTranscript) && partialTranscript && (
                  <div className="max-w-lg mb-1 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-sm">
                    <p className="text-sm text-white/90 text-center line-clamp-2">{partialTranscript}</p>
                  </div>
                )}
                <Button
                  size="lg"
                  color={isRecording ? "danger" : "primary"}
                  className={`rounded-full w-14 h-14 transition-all shadow-lg ${isRecording ? "scale-110" : ""}`}
                  isIconOnly
                  isDisabled={sending || isTranscribing}
                  onPress={toggleRecording}
                  aria-label={isRecording ? "Stop recording and send answer" : "Start recording answer"}
                >
                  {isRecording ? (
                    <MicOff className="w-5 h-5" />
                  ) : isTranscribing ? (
                    <Spinner size="sm" color="white" />
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
                </Button>
                <p className="text-xs text-white/60">
                  {isRecording
                    ? "Tap again to send"
                    : isTranscribing
                      ? (partialTranscript ? "Transcribing..." : "Processing audio...")
                      : sending
                        ? "Getting response..."
                        : "Tap to record"}
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* ── Standard text mode layout ── */
          <>
            {/* Chat header */}
            <div className="p-4 border-b bg-default-50 flex items-center justify-between">
              <div>
                <p className="font-semibold">{selectedRole.name}</p>
                <p className="text-sm text-default-500">{selectedRole.role}</p>
              </div>
              <div className="flex items-center gap-2">
                {roleHasAvatarProfile && (
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="flat"
                        color="primary"
                        onPress={() => handleSwitchInteractionMode("text")}
                        startContent={<Type className="w-3 h-3" />}
                      >
                        Text
                      </Button>
                      {(() => {
                        const limitExhausted = avatarLimitExhausted;
                        const avatarUnavailable = heygenAvatarConfigured !== true;
                        return (
                          <Button
                            size="sm"
                            variant="flat"
                            color="default"
                            onPress={() => handleSwitchInteractionMode("avatar")}
                            startContent={<Video className="w-3 h-3" />}
                            isDisabled={limitExhausted || avatarUnavailable}
                          >
                            Avatar
                          </Button>
                        );
                      })()}
                    </div>
                    {avatarTimeLimitSeconds !== null && (
                      <span className={`text-xs font-medium ${avatarLimitExhausted ? "text-danger-500" : "text-default-400"}`}>
                        {avatarLimitExhausted
                          ? "Limit reached"
                          : (() => {
                              const remaining = avatarTimeLimitSeconds - avatarTotalSeconds;
                              return remaining < 60
                                ? `${remaining}s left`
                                : `${Math.floor(remaining / 60)}m left`;
                            })()
                        }
                      </span>
                    )}
                  </div>
                )}
                <Button
                  size="sm"
                  variant="light"
                  startContent={<LogOut className="w-4 h-4" />}
                  onPress={() => {
                    if (interactionLog && selectedRole) {
                      const now = Date.now();
                      interactionLog.events.push({
                        type: "exit_role",
                        roleId: selectedRole.id,
                        roleName: selectedRole.name,
                        timestamp: now,
                      });
                      if (interactionLog.roleInteractions[selectedRole.id]) {
                        interactionLog.roleInteractions[selectedRole.id].exitedAt = now;
                      }
                      setInteractionLog({ ...interactionLog });
                    }
                    setSelectedRole(null);
                  }}
                >
                  Back to Roles
                </Button>
              </div>
            </div>

            {/* Messages */}
            {avatarLimitExhausted && roleHasAvatarProfile && (
              <div className="p-4 border-b bg-warning-50 flex items-start gap-3">
                <Video className="w-5 h-5 text-warning-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-warning-800 text-sm">Avatar time limit reached</p>
                  <p className="text-xs text-warning-700 mt-0.5">
                    You have used all {avatarTimeLimitSeconds !== null ? avatarTimeLimitSeconds / 60 : 0} minutes of avatar interaction for this case. You can continue with text mode.
                  </p>
                </div>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {currentRoleMessages.length === 0 && (
                <div className="text-center text-default-400 py-8">
                  <p>Start a conversation with {selectedRole.name}</p>
                </div>
              )}
              {currentRoleMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] p-3 rounded-lg ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-default-100"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <p className={`text-xs mt-1 ${msg.role === "user" ? "text-primary-foreground/60" : "text-default-400"}`}>
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-default-100 p-3 rounded-lg max-w-[80%]">
                    {streamingText ? (
                      <p className="text-sm whitespace-pre-wrap">{streamingText}</p>
                    ) : (
                      <Spinner size="sm" />
                    )}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Text input */}
            <div className="p-4 border-t">
              <div className="flex gap-2">
                <Input
                  placeholder={`Message ${selectedRole.name}...`}
                  value={currentInput}
                  onValueChange={setCurrentInput}
                  onKeyDown={handleKeyDown}
                  isDisabled={sending}
                  className="flex-1"
                />
                <Button
                  isIconOnly
                  color="primary"
                  onPress={handleSendMessage}
                  isLoading={sending}
                  isDisabled={!currentInput.trim()}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Finish confirmation modal */}
      <Modal isOpen={showFinishModal} onClose={() => setShowFinishModal(false)} size="sm">
        <ModalContent>
          <ModalHeader>End This Session?</ModalHeader>
          <ModalBody>
            <p className="text-default-600">
              Are you sure you&apos;re finished with the entire case? Submitting now ends this attempt and it will no longer appear under Unfinished Sessions.
            </p>
            <p className="text-default-600">
              You won&apos;t be able to continue this conversation or make any changes after submission.
              {mode === "assessed" && (
                <span className="block mt-2 font-medium text-warning-600">
                  This is an assessed attempt. Submission will trigger evaluation.
                </span>
              )}
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setShowFinishModal(false)}>
              Keep Going
            </Button>
            <Button
              color="danger"
              onPress={() => {
                setShowFinishModal(false);
                handleFinish();
              }}
              isLoading={finishing}
            >
              Yes, I&apos;m Finished
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Live capture affordances (REQ-43), scenario runs only. The self-view
          normally lives inside the avatar panel (bottom-right, the usual
          video-call convention); this is the TEXT-mode fallback, since that
          layout has no avatar panel to anchor to. The banner is non-blocking
          and folds away the moment the face is picked up again; neither
          element scores or coaches. */}
      {isScenario && (
        <>
          {interactionMode !== "avatar" && (
            <SelfViewThumbnail stream={scenarioSelfViewStream} />
          )}
          <FaceDetectionBanner visible={cameraMode === "ON" && !faceDetected} />
        </>
      )}
    </div>
  );
}
