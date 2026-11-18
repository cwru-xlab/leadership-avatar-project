import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  ConnectionQuality,
  LiveAvatarSession,
  SessionState,
  SessionEvent,
  VoiceChatEvent,
  VoiceChatState,
  AgentEventsEnum,
  VoiceChatConfig,
} from "@heygen/liveavatar-web-sdk";

export enum StreamingAvatarSessionState {
  INACTIVE = "inactive",
  CONNECTING = "connecting",
  CONNECTED = "connected",
}

export enum MessageSender {
  CLIENT = "CLIENT",
  AVATAR = "AVATAR",
}

export interface Message {
  id: string;
  sender: MessageSender;
  content: string;
}

function mapSessionState(state: SessionState): StreamingAvatarSessionState {
  switch (state) {
    case SessionState.CONNECTED:
      return StreamingAvatarSessionState.CONNECTED;
    case SessionState.CONNECTING:
      return StreamingAvatarSessionState.CONNECTING;
    default:
      return StreamingAvatarSessionState.INACTIVE;
  }
}

type StreamingAvatarContextProps = {
  sessionRef: React.RefObject<LiveAvatarSession>;
  sessionToken: string;

  isMuted: boolean;
  voiceChatState: VoiceChatState;
  isVoiceChatLoading: boolean;
  isVoiceChatActive: boolean;

  sessionState: StreamingAvatarSessionState;
  isStreamReady: boolean;

  messages: Message[];
  clearMessages: () => void;

  isListening: boolean;
  setIsListening: (v: boolean) => void;
  isUserTalking: boolean;
  isAvatarTalking: boolean;

  connectionQuality: ConnectionQuality;
};

const StreamingAvatarContext = createContext<StreamingAvatarContextProps>({
  sessionRef: { current: null } as unknown as React.RefObject<LiveAvatarSession>,
  sessionToken: "",
  isMuted: true,
  voiceChatState: VoiceChatState.INACTIVE,
  isVoiceChatLoading: false,
  isVoiceChatActive: false,
  sessionState: StreamingAvatarSessionState.INACTIVE,
  isStreamReady: false,
  messages: [],
  clearMessages: () => {},
  isListening: false,
  setIsListening: () => {},
  isUserTalking: false,
  isAvatarTalking: false,
  connectionQuality: ConnectionQuality.UNKNOWN,
});

const useSessionState = (sessionRef: React.RefObject<LiveAvatarSession>) => {
  const [sessionState, setSessionState] = useState<StreamingAvatarSessionState>(
    StreamingAvatarSessionState.INACTIVE,
  );
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>(
    ConnectionQuality.UNKNOWN,
  );
  const [isStreamReady, setIsStreamReady] = useState(false);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;

    const handleStateChange = (state: SessionState) => {
      setSessionState(mapSessionState(state));
      if (state === SessionState.DISCONNECTED) {
        session.removeAllListeners();
        session.voiceChat.removeAllListeners();
        setIsStreamReady(false);
      }
    };

    // Named so `off` can find it: an inline arrow passed to `off` is a new
    // function that was never registered, so the cleanup removed nothing.
    const handleStreamReady = () => setIsStreamReady(true);

    session.on(SessionEvent.SESSION_STATE_CHANGED, handleStateChange);
    session.on(SessionEvent.SESSION_STREAM_READY, handleStreamReady);
    session.on(
      SessionEvent.SESSION_CONNECTION_QUALITY_CHANGED,
      setConnectionQuality,
    );

    return () => {
      session.off(SessionEvent.SESSION_STATE_CHANGED, handleStateChange);
      session.off(SessionEvent.SESSION_STREAM_READY, handleStreamReady);
      session.off(
        SessionEvent.SESSION_CONNECTION_QUALITY_CHANGED,
        setConnectionQuality,
      );
    };
  }, [sessionRef]);

  return { sessionState, isStreamReady, connectionQuality };
};

const useVoiceChatState = (sessionRef: React.RefObject<LiveAvatarSession>) => {
  const [isMuted, setIsMuted] = useState(true);
  const [voiceChatState, setVoiceChatState] = useState<VoiceChatState>(
    VoiceChatState.INACTIVE,
  );

  const isVoiceChatLoading = voiceChatState === VoiceChatState.STARTING;
  const isVoiceChatActive = voiceChatState === VoiceChatState.ACTIVE;

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;

    const handleMuted = () => setIsMuted(true);
    const handleUnmuted = () => setIsMuted(false);

    session.voiceChat.on(VoiceChatEvent.MUTED, handleMuted);
    session.voiceChat.on(VoiceChatEvent.UNMUTED, handleUnmuted);
    session.voiceChat.on(VoiceChatEvent.STATE_CHANGED, setVoiceChatState);

    return () => {
      session.voiceChat.off(VoiceChatEvent.MUTED, handleMuted);
      session.voiceChat.off(VoiceChatEvent.UNMUTED, handleUnmuted);
      session.voiceChat.off(VoiceChatEvent.STATE_CHANGED, setVoiceChatState);
    };
  }, [sessionRef]);

  return { isMuted, voiceChatState, isVoiceChatLoading, isVoiceChatActive };
};

const useTalkingState = (sessionRef: React.RefObject<LiveAvatarSession>) => {
  const [isUserTalking, setIsUserTalking] = useState(false);
  const [isAvatarTalking, setIsAvatarTalking] = useState(false);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;

    const handleUserStarted = () => setIsUserTalking(true);
    const handleUserEnded = () => setIsUserTalking(false);
    const handleAvatarStarted = () => setIsAvatarTalking(true);
    const handleAvatarEnded = () => setIsAvatarTalking(false);

    session.on(AgentEventsEnum.USER_SPEAK_STARTED, handleUserStarted);
    session.on(AgentEventsEnum.USER_SPEAK_ENDED, handleUserEnded);
    session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, handleAvatarStarted);
    session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, handleAvatarEnded);

    // Strict Mode runs this effect twice on one session; without cleanup every
    // speech event fired each handler twice.
    return () => {
      session.off(AgentEventsEnum.USER_SPEAK_STARTED, handleUserStarted);
      session.off(AgentEventsEnum.USER_SPEAK_ENDED, handleUserEnded);
      session.off(AgentEventsEnum.AVATAR_SPEAK_STARTED, handleAvatarStarted);
      session.off(AgentEventsEnum.AVATAR_SPEAK_ENDED, handleAvatarEnded);
    };
  }, [sessionRef]);

  return { isUserTalking, isAvatarTalking };
};

const useMessageState = () => {
  const [messages, setMessages] = useState<Message[]>([]);

  const clearMessages = () => {
    setMessages([]);
  };

  return { messages, clearMessages };
};

const useListeningState = () => {
  const [isListening, setIsListening] = useState(false);
  return { isListening, setIsListening };
};

/** The LiveAvatar API origin the browser SDK talks to during `start()`. */
export function liveAvatarApiUrl(): string {
  return (
    (typeof window !== "undefined"
      ? process.env.NEXT_PUBLIC_LIVEAVATAR_API_URL
      : undefined) || "https://api.liveavatar.com"
  );
}

type StreamingAvatarProviderProps = {
  children: React.ReactNode;
  sessionAccessToken: string;
  voiceChatConfig?: boolean | VoiceChatConfig;
  apiUrl?: string;
};

export const StreamingAvatarProvider = ({
  children,
  sessionAccessToken,
  voiceChatConfig = true,
  apiUrl,
}: StreamingAvatarProviderProps) => {
  const effectiveApiUrl = apiUrl || liveAvatarApiUrl();

  // Lazy initialization: only create the session once, not on every render.
  // Using null as initial value and checking before creating to avoid
  // allocating a new session object on every render.
  const sessionRef = useRef<LiveAvatarSession>(null as any);
  if (!sessionRef.current) {
    sessionRef.current = new LiveAvatarSession(sessionAccessToken, {
      voiceChat: voiceChatConfig,
      apiUrl: effectiveApiUrl,
    });
  }

  const { sessionState, isStreamReady, connectionQuality } =
    useSessionState(sessionRef);
  const { isMuted, voiceChatState, isVoiceChatLoading, isVoiceChatActive } =
    useVoiceChatState(sessionRef);
  const { isUserTalking, isAvatarTalking } = useTalkingState(sessionRef);
  const { messages, clearMessages } = useMessageState();
  const { isListening, setIsListening } = useListeningState();

  return (
    <StreamingAvatarContext.Provider
      value={{
        sessionRef,
        sessionToken: sessionAccessToken,
        isMuted,
        voiceChatState,
        isVoiceChatLoading,
        isVoiceChatActive,
        sessionState,
        isStreamReady,
        messages,
        clearMessages,
        isListening,
        setIsListening,
        isUserTalking,
        isAvatarTalking,
        connectionQuality,
      }}
    >
      {children}
    </StreamingAvatarContext.Provider>
  );
};

export const useStreamingAvatarContext = () => {
  return useContext(StreamingAvatarContext);
};
