import { Conversation, type PartialOptions } from "@elevenlabs/client";
import { api, ApiFailure } from "@/lib/api";
import type { Lang } from "@/lib/contracts";
import type { VoiceDirectorState, VoiceUnavailableReason } from "./types";

export const TOOL_NAMES = ["select_idea", "set_coaching_paused", "repeat_instruction", "request_capture"] as const;
export type VoiceToolName = (typeof TOOL_NAMES)[number];

export interface ProviderSession {
  endSession(): Promise<void>;
  setMicMuted(muted: boolean): void;
  setVolume(input: { volume: number }): void;
  sendContextualUpdate(text: string): void;
  sendUserActivity(): void;
  isOpen(): boolean;
}

export interface ProviderEvents {
  configured(): void;
  created(session: ProviderSession): void;
  mode(mode: "speaking" | "listening"): void;
  transcript(line: NonNullable<VoiceDirectorState["transcript"]>): void;
  interrupted(): void;
  vad(score: number): void;
  disconnected(): void;
  failed(): void;
  tool(name: VoiceToolName, id: string, parameters: unknown): Promise<string>;
}

export class VoiceProviderFailure extends Error {
  constructor(readonly reason: VoiceUnavailableReason) {
    super(reason);
  }
}

export async function connectVoice(lang: Lang, signal: AbortSignal, events: ProviderEvents): Promise<ProviderSession> {
  let signedUrl: string;
  try {
    ({ signedUrl } = await api.voiceSession(signal));
  } catch (error) {
    const code = error instanceof ApiFailure ? error.code : null;
    if (code === "not_configured") throw new VoiceProviderFailure("not_configured");
    if (code === "rate_limited") throw new VoiceProviderFailure("rate_limited");
    throw new VoiceProviderFailure("provider_unavailable");
  }
  signal.throwIfAborted();
  events.configured();

  // The SDK's tool handler receives parameters only. The pinned SDK publishes the
  // incoming event synchronously before dispatching that exact handler.
  let call: { name: string; id: string } | null = null;
  const clientTools: NonNullable<PartialOptions["clientTools"]> = {};
  for (const name of TOOL_NAMES) {
    clientTools[name] = (parameters) => {
      const current = call;
      call = null;
      return current?.name === name
        ? events.tool(name, current.id, parameters)
        : JSON.stringify({ ok: false, reason: "invalid_arguments" });
    };
  }

  return Conversation.startSession({
    signedUrl,
    connectionType: "websocket",
    textOnly: false,
    useWakeLock: false,
    overrides: { agent: { language: lang } },
    clientTools,
    onIncomingEvent: (raw: unknown) => {
      call = readToolCall(raw);
    },
    onConversationCreated: events.created,
    onDisconnect: events.disconnected,
    onError: events.failed,
    onModeChange: ({ mode }) => events.mode(mode),
    onMessage: ({ role, message }) => events.transcript({ speaker: role, text: message }),
    onInterruption: events.interrupted,
    onVadScore: ({ vadScore }) => events.vad(vadScore),
  });
}

function readToolCall(raw: unknown) {
  if (!raw || typeof raw !== "object" || !("type" in raw) || raw.type !== "client_tool_call" ||
      !("client_tool_call" in raw)) return null;
  const call = raw.client_tool_call;
  if (!call || typeof call !== "object" ||
      !("tool_name" in call) || typeof call.tool_name !== "string" ||
      !("tool_call_id" in call) || typeof call.tool_call_id !== "string") return null;
  return { name: call.tool_name, id: call.tool_call_id };
}
