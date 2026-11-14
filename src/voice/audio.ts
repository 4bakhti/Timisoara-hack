import { speakInstruction, stopSpeaking } from "@/coach/voice";
import type { ProviderSession } from "./provider";
import type { VoiceLine } from "./types";

export type PlayLine = (line: VoiceLine, signal: AbortSignal) => Promise<void>;

export const playLocalLine: PlayLine = (line, signal) =>
  speakInstruction(line.instruction, line.lang, { localOnly: line.kind !== "correction", signal });

/** The agent is muted before local playback starts and stays muted while that turn drains. */
export class VoiceAudio {
  private session: ProviderSession | null = null;
  private local: { line: VoiceLine; controller: AbortController } | null = null;
  private counting = false;
  private talking = false;
  private suppressing = false;
  private outputEnabled = true;
  private volume: number | null = null;
  private quietTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly play: PlayLine, private readonly onIdle: () => void) {}

  attach(session: ProviderSession | null) {
    this.session = session;
    this.volume = null;
    this.applyVolume();
  }

  get activeLine() {
    return this.local?.line ?? null;
  }

  get canPlayCorrection() {
    return this.outputEnabled && !this.counting && !this.talking && this.local === null;
  }

  setEnabled(enabled: boolean) {
    this.outputEnabled = enabled;
    if (!enabled) this.cancel();
    this.applyVolume();
  }

  setCounting(counting: boolean) {
    if (this.counting === counting) return;
    if (counting) {
      this.counting = true;
      this.cancelLocal();
      this.applyVolume();
    } else {
      this.cancel();
      this.counting = false;
      this.applyVolume();
    }
  }

  setMode(speaking: boolean) {
    this.talking = speaking;
    if (this.suppressing) this.resumeWhenQuiet();
    this.applyVolume();
    if (!speaking) this.onIdle();
  }

  /** A new user turn or a provider interruption can supersede local advice. */
  interrupt() {
    if (this.local?.line.kind === "correction") this.cancelLocal();
    this.applyVolume();
  }

  cancelLocal() {
    const current = this.local;
    this.local = null;
    current?.controller.abort();
    this.applyVolume();
  }

  cancel() {
    if (this.session && this.talking) {
      this.suppressing = true;
      this.resumeWhenQuiet();
    }
    this.cancelLocal();
    stopSpeaking();
  }

  playLine(line: VoiceLine) {
    if (!this.outputEnabled || (line.kind === "correction" && !this.canPlayCorrection)) return;
    const previous = this.local;
    const current = { line, controller: new AbortController() };
    previous?.controller.abort();
    this.local = current;
    this.applyVolume();
    void this.play(line, current.controller.signal).catch(() => undefined).finally(() => {
      if (this.local !== current) return;
      this.local = null;
      if (this.talking) {
        this.suppressing = true;
        this.resumeWhenQuiet();
      }
      this.applyVolume();
      this.onIdle();
    });
  }

  detach() {
    this.session = null;
    this.talking = false;
    this.suppressing = false;
    this.volume = null;
    clearTimeout(this.quietTimer);
  }

  private resumeWhenQuiet() {
    clearTimeout(this.quietTimer);
    if (!this.suppressing || this.talking) return;
    // The SDK reports listening between some streamed chunks. Keep the old turn silent
    // across short gaps rather than resuming its trailing audio during a state change.
    this.quietTimer = setTimeout(() => {
      this.suppressing = false;
      this.applyVolume();
      this.onIdle();
    }, 550);
  }

  private applyVolume() {
    if (!this.session) return;
    const volume = !this.outputEnabled || this.counting || this.local || this.suppressing ? 0 : 1;
    if (volume !== this.volume) {
      this.volume = volume;
      this.session.setVolume({ volume });
    }
  }
}
