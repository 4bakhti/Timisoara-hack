import { api } from "@/lib/api";
import { VoiceAudio, playLocalLine, type PlayLine } from "./audio";
import { belongsToContext, describeContext, isCounting, isFresh, MAX_CONTEXT_AGE_MS } from "./context";
import { connectVoice, VoiceProviderFailure, type ProviderSession } from "./provider";
import { VoiceTools } from "./tools";
import type { VoiceActions, VoiceContext, VoiceDirector, VoiceDirectorState, VoiceLine, VoiceUnavailableReason } from "./types";

const CORRECTION_TTL_MS = 2200;
const USER_TURN_MS = 2300;
const CONTEXT_INTERVAL_MS = 180;
const CONNECTION_TIMEOUT_MS = 40_000;

const INITIAL: VoiceDirectorState = {
  status: "disconnected",
  configured: null,
  micMuted: false,
  reason: null,
  transcript: null,
};

type Connection = {
  controller: AbortController;
  participant: ProviderSession | null;
  tools: VoiceTools;
  lastSummary: string | null;
  lastUserMessageAt: number;
};

function unavailableReason(error: unknown): VoiceUnavailableReason {
  if (error instanceof VoiceProviderFailure) return error.reason;
  if (error instanceof Error) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") return "permission_denied";
    if (error.name === "NotFoundError" || error.name === "NotReadableError") return "microphone_unavailable";
  }
  return "provider_unavailable";
}

export function createVoiceDirector(
  actions: VoiceActions,
  { connect = connectVoice, play = playLocalLine, now = Date.now }: {
    connect?: typeof connectVoice;
    play?: PlayLine;
    now?: () => number;
  } = {},
): VoiceDirector & { setActions(actions: VoiceActions): void } {
  let currentActions = actions;
  let state = INITIAL;
  const listeners = new Set<() => void>();
  let context: VoiceContext | null = null;
  let connection: Connection | null = null;
  let starting: Promise<void> | null = null;
  let ending: Promise<void> | null = null;
  let closing: Promise<void> | null = null;
  let pending: { line: VoiceLine; expires: number } | null = null;
  let pendingTimer: ReturnType<typeof setTimeout> | undefined;
  let freshnessTimer: ReturnType<typeof setTimeout> | undefined;
  let contextTimer: ReturnType<typeof setTimeout> | undefined;
  let userTurnTimer: ReturnType<typeof setTimeout> | undefined;
  let userTurnUntil = 0;
  let outputEnabled = true;

  const audio = new VoiceAudio(play, drain);

  function patch(patch: Partial<VoiceDirectorState>) {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  }

  function fresh() {
    return isFresh(context, now()) ? context : null;
  }

  function clearPending() {
    clearTimeout(pendingTimer);
    pending = null;
  }

  function drain() {
    if (!pending) return;
    const current = fresh();
    if (pending.expires <= now() || current?.paused) {
      clearPending();
      return;
    }
    if (!current || userTurnUntil > now() || !audio.canPlayCorrection || !belongsToContext(pending.line, current)) return;
    const { line } = pending;
    clearPending();
    audio.playLine(line);
  }

  function sendContext(current: Connection) {
    clearTimeout(contextTimer);
    contextTimer = undefined;
    if (!current.participant?.isOpen()) return;
    const snapshot = fresh();
    const summary = snapshot ? describeContext(snapshot) : '{"phase":"unknown","cameraReady":false}';
    if (current.lastSummary === summary) return;
    current.participant.sendContextualUpdate("Framewise app snapshot (observations only): " + summary);
    current.lastSummary = summary;
  }

  function scheduleContext(current: Connection, immediate: boolean) {
    if (immediate) sendContext(current);
    else contextTimer ??= setTimeout(() => sendContext(current), CONTEXT_INTERVAL_MS);
  }

  function refreshTimer() {
    clearTimeout(freshnessTimer);
    const current = connection;
    if (!current || !context) return;
    freshnessTimer = setTimeout(() => {
      if (connection !== current || fresh()) return;
      cancelSpeech();
      sendContext(current);
    }, Math.max(0, context.updatedAt + MAX_CONTEXT_AGE_MS + 1 - now()));
  }

  function noteUserTurn() {
    if (state.micMuted || isCounting(context)) return;
    // Give the person the floor. A correction generated during this turn expires quickly.
    audio.interrupt();
    clearPending();
    clearTimeout(userTurnTimer);
    userTurnUntil = now() + USER_TURN_MS;
    userTurnTimer = setTimeout(() => {
      userTurnUntil = 0;
      drain();
    }, USER_TURN_MS);
  }

  function cancelSpeech() {
    clearPending();
    audio.cancel();
    if (connection?.participant?.isOpen()) connection.participant.sendUserActivity();
  }

  function stop(current: Connection, reason: VoiceUnavailableReason | null) {
    if (connection !== current) return;
    connection = null;
    current.controller.abort();
    clearTimeout(freshnessTimer);
    clearTimeout(contextTimer);
    contextTimer = undefined;
    current.tools.end();
    clearTimeout(userTurnTimer);
    userTurnUntil = 0;

    const participant = current.participant;
    audio.detach();
    // A provider failure never interrupts a locally scheduled countdown or correction.
    if (reason) drain();
    else {
      clearPending();
      audio.cancel();
      audio.setCounting(false);
    }
    if (participant) {
      participant.setVolume({ volume: 0 });
      participant.setMicMuted(true);
      closing = participant.endSession().catch(() => undefined).finally(() => { closing = null; });
    }
    patch({
      status: reason ? "error" : "disconnected",
      reason,
      transcript: null,
      ...(reason === "not_configured" ? { configured: false } : {}),
    });
  }

  return {
    getState: () => state,
    setActions(actions) { currentActions = actions; },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async checkAvailability() {
      const health = await api.health();
      if (state.configured === null && typeof health.voiceConversation === "boolean") {
        patch({ configured: health.voiceConversation });
      }
    },
    start(lang) {
      if (starting) return starting;
      if (connection) return Promise.resolve();
      // Outside a secure context the SDK could not request a microphone.
      if (typeof window !== "undefined" && (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)) {
        patch({ status: "error", reason: "microphone_unavailable" });
        return Promise.resolve();
      }
      const current: Connection = {
        controller: new AbortController(),
        participant: null,
        tools: new VoiceTools(
          () => currentActions,
          () => connection === current && current.participant?.isOpen() ? fresh() : null,
          () => { clearPending(); audio.cancel(); },
        ),
        lastSummary: null,
        lastUserMessageAt: -Infinity,
      };
      connection = current;
      audio.setEnabled(outputEnabled);
      patch({ status: "connecting", reason: null, transcript: null });

      const timeout = setTimeout(() => stop(current, "provider_unavailable"), CONNECTION_TIMEOUT_MS);
      starting = (async () => {
        try {
          if (closing) await closing;
          current.controller.signal.throwIfAborted();
          const participant = await connect(lang, current.controller.signal, {
            configured() {
              if (connection === current) patch({ configured: true });
            },
            created(session) {
              if (connection !== current) {
                session.setVolume({ volume: 0 });
                session.setMicMuted(true);
                return;
              }
              current.participant = session;
              session.setMicMuted(state.micMuted);
              audio.attach(session);
            },
            mode(mode) {
              if (connection !== current) return;
              audio.setMode(mode === "speaking");
              if (mode === "speaking") audio.interrupt();
              patch({ status: mode });
            },
            transcript(line) {
              if (connection !== current) return;
              if (line.speaker === "user" && line.text.trim() && !state.micMuted) {
                current.lastUserMessageAt = now();
                noteUserTurn();
              }
              patch({ transcript: { ...line, text: line.text.slice(0, 500) } });
            },
            interrupted() {
              if (connection === current) noteUserTurn();
            },
            vad(score) {
              if (connection === current && score >= 0.65) noteUserTurn();
            },
            disconnected() {
              stop(current, "connection_lost");
            },
            failed() {
              stop(current, "provider_unavailable");
            },
            tool(name, id, parameters) {
              // Only an actual microphone turn may authorize conversational actions.
              const hasUserTurn = now() - current.lastUserMessageAt < 20_000;
              return current.tools.dispatch(name, id, parameters, hasUserTurn && !state.micMuted);
            },
          });
          if (connection !== current) {
            participant.setVolume({ volume: 0 });
            participant.setMicMuted(true);
            await participant.endSession().catch(() => undefined);
            return;
          }
          if (!participant.isOpen() || current.participant !== participant) {
            stop(current, "connection_lost");
            return;
          }
          patch({ configured: true, status: state.status === "connecting" ? "listening" : state.status });
          sendContext(current);
          refreshTimer();
        } catch (error) {
          stop(current, unavailableReason(error));
        }
      })().finally(() => {
        clearTimeout(timeout);
        starting = null;
      });
      return starting;
    },
    end(options) {
      if (ending && options?.afterCapture) return ending;
      const current = connection;
      const finish = async () => {
        clearTimeout(freshnessTimer);
        if (connection) stop(connection, null);
        else {
          cancelSpeech();
          patch({ status: "disconnected", reason: null, transcript: null });
        }
        context = null;
        audio.setCounting(false);
        audio.setEnabled(outputEnabled);
        await closing;
      };
      if (!options?.afterCapture || !current?.participant?.isOpen()) return finish();

      // The capture callback updates the UI before the SDK writes the tool result.
      // Leave the socket open for that promise chain, with both audio directions muted.
      current.tools.closeForResult();
      audio.setEnabled(false);
      current.participant.setMicMuted(true);
      const release = new Promise<void>((resolve) => setTimeout(resolve, 0)).then(async () => {
        if (connection === current) await finish();
      }).finally(() => {
        if (ending === release) ending = null;
      });
      ending = release;
      return release;
    },
    setMicMuted(micMuted) {
      connection?.participant?.setMicMuted(micMuted || Boolean(ending));
      patch({ micMuted });
    },
    setOutputEnabled(enabled) {
      outputEnabled = enabled;
      if (!enabled) clearPending();
      audio.setEnabled(enabled && !ending);
    },
    updateContext(next) {
      const previous = context;
      context = next;
      connection?.tools.contextChanged(next);
      if (connection && previous && (previous.selectedIdeaId !== next.selectedIdeaId ||
          previous.phase !== next.phase || previous.paused !== next.paused)) {
        connection.lastUserMessageAt = -Infinity;
      }
      if (previous && (previous.selectedIdeaId !== next.selectedIdeaId || previous.lang !== next.lang ||
          (previous.phase === "coach" && next.phase !== "coach") || (!previous.paused && next.paused))) {
        cancelSpeech();
      }
      if (audio.activeLine?.kind === "correction" && !belongsToContext(audio.activeLine, next)) {
        audio.cancelLocal();
      }
      audio.setCounting(isCounting(next));
      if (connection) {
        scheduleContext(connection, !previous || previous.phase !== next.phase ||
          previous.selectedIdeaId !== next.selectedIdeaId || previous.paused !== next.paused ||
          previous.cameraReady !== next.cameraReady || isCounting(previous) !== isCounting(next));
      }
      refreshTimer();
      drain();
    },
    deliverCorrection(line) {
      if (line.kind !== "correction") {
        clearPending();
        audio.playLine(line);
        return;
      }
      clearPending();
      pending = { line, expires: now() + CORRECTION_TTL_MS };
      pendingTimer = setTimeout(clearPending, CORRECTION_TTL_MS);
      drain();
    },
    cancelSpeech,
  };
}
