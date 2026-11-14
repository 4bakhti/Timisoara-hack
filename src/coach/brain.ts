/**
 * The coach's decisions: given what the tracker measured this frame, which single
 * correction to show, when to speak, and when to take the photo.
 *
 * Pure and deterministic (time is passed in), so it can be tested without a
 * camera. The measuring happens in src/vision; the talking in voice.ts.
 *
 * Behaviour in short:
 *  - Framing problems come before pose problems; the largest problem wins.
 *  - A correction must persist before it replaces the current one, so the
 *    instruction does not flicker.
 *  - Lines are spoken one at a time with pauses, and not repeated straight away.
 *  - When everything matches for a moment: "hold", 3, 2, 1, capture.
 *    A clear drop during the countdown cancels it.
 */
import type { CoachMode } from "@/lib/contracts";
import type { Correction, FramingMatch, PoseMatch } from "@/vision/match";
import type { FaceSignals } from "@/vision/types";
import { phraseAudience, type PhraseId } from "./phrases";
import type { CoachPhase } from "./types";

export interface Measurement {
  /** Milliseconds; any monotonic clock. */
  now: number;
  personVisible: boolean;
  /** null when the idea has no pose or it could not be measured this frame. */
  pose: PoseMatch | null;
  framing: FramingMatch | null;
  /** Phone roll away from level, in degrees. null when the device gives no reading. */
  levelError: number | null;
  /** Face signals near a match (null when unknown). TO USE (Person C): e.g. never shoot with closed eyes. */
  face?: FaceSignals | null;
}

export interface Decision {
  phase: CoachPhase;
  /** Overall match 0–100, smoothed. */
  score: number;
  parts: { pose: number | null; framing: number | null; level: number | null };
  /** The one correction to show now. */
  instruction: PhraseId | null;
  countdown: number | null;
  /** A line to say now. At most one per update. */
  speak: PhraseId | null;
  /** true exactly once: take the photo now. */
  capture: boolean;
}

export interface BrainOptions {
  mode: CoachMode;
  /** false for ideas without a pose: only framing and level are judged. */
  expectPose: boolean;
}

export const TIMING = {
  /** Without a person for this long, go back to searching. */
  lostAfter: 1200,
  /** A new top correction must persist this long before it replaces the current one. */
  switchAfter: 700,
  /** The first correction, or one after the previous was resolved, appears faster. */
  appearAfter: 250,
  /** A correction must be on screen this long before it is spoken. */
  speakAfter: 800,
  /** Minimum silence between spoken lines. */
  speakGap: 2600,
  /** The same line may be said again after this. */
  repeatAfter: 6500,
  /** Everything must match for this long before "hold". */
  settleFor: 400,
  /** Length of the "hold" before the countdown. */
  holdFor: 900,
  countStep: 800,
} as const;

/** Score needed to start the capture sequence, and the score below which it is cancelled. */
export const READY_SCORE = 84;
export const DROP_SCORE = 70;

const WEIGHTS = { pose: 0.5, framing: 0.38, level: 0.12 } as const;
const LEVEL_TOLERANCE_DEG = 4;
const MINOR_POSE_WEIGHT = 0.12;
const BLOCKING_POSE_WEIGHT = 0.35;
const COUNT_LINES: PhraseId[] = ["three", "two", "one"];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function levelScore(errorDeg: number | null): number | null {
  if (errorDeg === null) return null;
  return Math.round(clamp(100 - Math.max(0, Math.abs(errorDeg) - 1.5) * 9, 0, 100));
}

export class CoachBrain {
  private phase: CoachPhase = "loading";
  private score = 0;
  private hasScore = false;
  private lastSeenAt: number | null = null;
  private everSeen = false;

  private current: PhraseId | null = null;
  private currentSince = 0;
  private pending: PhraseId | null = null;
  private pendingSince = 0;

  private introduced = false;
  private lastSpoken: PhraseId | null = null;
  private lastSpokeAt = -Infinity;
  private saidAlmost = false;

  private readySince: number | null = null;
  private holdSince = 0;
  private countSince = 0;
  private countStep = -1;
  private done = false;

  constructor(private readonly opts: BrainOptions) {}

  update(m: Measurement): Decision {
    const parts = {
      pose: this.opts.expectPose ? (m.pose?.score ?? null) : null,
      framing: m.framing?.score ?? null,
      level: levelScore(m.levelError),
    };
    const base = { parts, countdown: null, speak: null, capture: false } as const;

    if (this.done) {
      return { ...base, phase: "captured", score: Math.round(this.score), instruction: "got_it" };
    }

    let speak: PhraseId | null = null;
    if (!this.introduced) {
      this.introduced = true;
      speak = this.say(this.opts.mode === "solo" ? "intro_solo" : "intro_friend", m.now);
    }

    // --- nobody in the frame
    if (!m.personVisible) {
      const goneFor = this.lastSeenAt === null ? Infinity : m.now - this.lastSeenAt;
      if (goneFor > TIMING.lostAfter) {
        this.resetCapture();
        this.phase = "searching";
        const line: PhraseId = this.everSeen ? "lost" : "step_in";
        this.setCurrent(line, m.now);
        speak ??= this.maybeSpeak(m.now);
        return { ...base, phase: "searching", score: 0, instruction: line, speak };
      }
      // Brief dropout: keep showing what we showed, decide nothing new.
      return {
        ...base,
        phase: this.phase === "loading" ? "searching" : this.phase,
        score: Math.round(this.score),
        instruction: this.current,
        countdown: this.countdownValue(),
        speak,
      };
    }
    this.lastSeenAt = m.now;
    this.everSeen = true;

    // --- score
    const raw = combine(parts);
    this.score = this.hasScore ? this.score + 0.35 * (raw - this.score) : raw;
    this.hasScore = true;
    const score = Math.round(this.score);

    // --- what could be corrected, most important first
    const candidates = this.candidates(m);
    const blocking = candidates.some((c) => c.weight >= BLOCKING_POSE_WEIGHT);
    const ready = this.score >= READY_SCORE && !blocking;

    // --- capture sequence
    if (this.phase === "holding" || this.phase === "countdown") {
      const framingBroke = candidates.some((c) => c.weight > 1.5);
      if (this.score < DROP_SCORE || framingBroke) {
        this.resetCapture();
        this.phase = "coaching";
      } else if (this.phase === "holding") {
        if (m.now - this.holdSince >= TIMING.holdFor) {
          this.phase = "countdown";
          this.countSince = m.now;
          this.countStep = -1;
        } else {
          return { ...base, phase: "holding", score, instruction: "hold", speak };
        }
      }
      if (this.phase === "countdown") {
        const step = Math.floor((m.now - this.countSince) / TIMING.countStep);
        if (step >= COUNT_LINES.length) {
          this.done = true;
          this.phase = "captured";
          return { ...base, phase: "captured", score, instruction: "got_it", speak: this.say("got_it", m.now), capture: true };
        }
        if (step !== this.countStep) {
          this.countStep = step;
          speak = this.say(COUNT_LINES[step], m.now);
        }
        return { ...base, phase: "countdown", score, instruction: COUNT_LINES[step], countdown: COUNT_LINES.length - step, speak };
      }
    }

    // --- coaching
    this.phase = "coaching";
    if (ready) {
      this.readySince ??= m.now;
      if (m.now - this.readySince >= TIMING.settleFor) {
        this.phase = "holding";
        this.holdSince = m.now;
        this.current = "hold";
        this.currentSince = m.now;
        this.pending = null;
        return { ...base, phase: "holding", score, instruction: "hold", speak: this.say("hold", m.now) };
      }
    } else {
      this.readySince = null;
    }

    this.chooseInstruction(candidates, m.now);
    speak ??= this.maybeSpeak(m.now);
    if (!speak && !this.saidAlmost && this.score >= 74 && m.now - this.lastSpokeAt >= 4500) {
      this.saidAlmost = true;
      speak = this.say("almost", m.now);
    }
    if (this.score < 60) this.saidAlmost = false;

    return { ...base, phase: "coaching", score, instruction: this.current, speak };
  }

  private candidates(m: Measurement): Correction[] {
    const list: Correction[] = [...(m.framing?.corrections ?? [])];
    if (this.opts.mode === "friend" && m.levelError !== null && Math.abs(m.levelError) > LEVEL_TOLERANCE_DEG) {
      list.push({ id: "cam_level", weight: 1.1 + Math.min(1, (Math.abs(m.levelError) - LEVEL_TOLERANCE_DEG) / 10) });
    }
    if (this.opts.expectPose && m.pose) {
      for (const c of m.pose.corrections) if (c.weight >= MINOR_POSE_WEIGHT) list.push(c);
    }
    return list.sort((a, b) => b.weight - a.weight);
  }

  /** Changes the shown instruction only when a new one has persisted. */
  private chooseInstruction(candidates: Correction[], now: number): void {
    const top = candidates[0]?.id ?? null;
    const currentStillValid = this.current !== null && candidates.some((c) => c.id === this.current);
    if (top === this.current) {
      this.pending = null;
      return;
    }
    if (top !== this.pending) {
      this.pending = top;
      this.pendingSince = now;
    }
    const wait = currentStillValid ? TIMING.switchAfter : TIMING.appearAfter;
    if (now - this.pendingSince >= wait) {
      this.setCurrent(top, now);
      this.pending = null;
    }
  }

  private setCurrent(id: PhraseId | null, now: number): void {
    if (this.current === id) return;
    this.current = id;
    this.currentSince = now;
  }

  /** Whether a line is meant to be heard in this mode. */
  private audible(id: PhraseId): boolean {
    return this.opts.mode === "solo" || phraseAudience(id) !== "photographer";
  }

  private maybeSpeak(now: number): PhraseId | null {
    const id = this.current;
    if (!id || !this.audible(id)) return null;
    if (now - this.currentSince < TIMING.speakAfter) return null;
    if (now - this.lastSpokeAt < TIMING.speakGap) return null;
    if (id === this.lastSpoken && now - this.lastSpokeAt < TIMING.repeatAfter) return null;
    return this.say(id, now);
  }

  private say(id: PhraseId, now: number): PhraseId | null {
    if (!this.audible(id)) return null;
    this.lastSpoken = id;
    this.lastSpokeAt = now;
    return id;
  }

  private countdownValue(): number | null {
    return this.phase === "countdown" && this.countStep >= 0 ? COUNT_LINES.length - this.countStep : null;
  }

  private resetCapture(): void {
    this.readySince = null;
    this.countStep = -1;
  }
}

function combine(parts: { pose: number | null; framing: number | null; level: number | null }): number {
  let total = 0;
  let weights = 0;
  for (const key of ["pose", "framing", "level"] as const) {
    const value = parts[key];
    if (value === null) continue;
    total += WEIGHTS[key] * value;
    weights += WEIGHTS[key];
  }
  return weights ? total / weights : 0;
}
