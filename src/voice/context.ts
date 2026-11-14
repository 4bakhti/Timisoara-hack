import type { VoiceContext, VoiceLine } from "./types";

export const MAX_CONTEXT_AGE_MS = 6000;

export function isFresh(context: VoiceContext | null, now: number): context is VoiceContext {
  return context !== null && now - context.updatedAt <= MAX_CONTEXT_AGE_MS && context.updatedAt <= now + 1000;
}

const text = (value: string, limit = 160) => value.replace(/\s+/g, " ").trim().slice(0, limit);

/** Only these fields reach ElevenLabs. The heartbeat never goes over the wire. */
export function describeContext(context: VoiceContext) {
  const scene = context.scene;
  const instruction = context.phase === "coach" && !context.paused ? context.instruction : null;
  return JSON.stringify({
    language: context.lang,
    phase: context.phase,
    ideas: context.ideas.slice(0, 3).map(({ id, title }) => ({ id: id.slice(0, 256), title: text(title) })),
    selectedIdeaId: context.selectedIdeaId?.slice(0, 256) ?? null,
    // Sample plans supply idea choices only. Their invented landmarks are excluded.
    scene: scene && {
      subject: scene.subject,
      lighting: { from: scene.light.from, note: text(scene.light.note) },
      space: text(scene.space),
      use: scene.background.use.slice(0, 5).map((value) => text(value, 70)),
      avoid: scene.background.avoid.slice(0, 5).map((value) => text(value, 70)),
    },
    coachPhase: context.coachPhase,
    correction: instruction && {
      id: instruction.id,
      text: text(instruction.text, 300),
      recipient: instruction.to,
    },
    personTracked: context.personTracked,
    paused: context.paused,
    cameraReady: context.cameraReady,
  });
}

export function sameInstruction(a: VoiceContext["instruction"], b: VoiceContext["instruction"]) {
  return a?.id === b?.id && a?.text === b?.text && a?.to === b?.to;
}

export function isCounting(context: VoiceContext | null) {
  return context?.phase === "coach" && !context.paused &&
    (context.coachPhase === "holding" || context.coachPhase === "countdown");
}

export function canRepeat(context: VoiceContext): boolean {
  return context.phase === "coach" && Boolean(context.selectedIdeaId && context.instruction) &&
    !context.paused && (context.coachPhase === "searching" || context.coachPhase === "coaching");
}

export function belongsToContext(line: VoiceLine, context: VoiceContext) {
  if (context.phase !== "coach" || context.paused || line.ideaId !== context.selectedIdeaId || line.lang !== context.lang) {
    return false;
  }
  if (line.kind !== "correction") return true;
  if (context.coachPhase !== "coaching" && context.coachPhase !== "searching") return false;
  // Intro and encouragement are paced by the engine but need not be shown on screen.
  return ["intro_solo", "intro_friend", "almost"].includes(line.instruction.id) ||
    sameInstruction(context.instruction, line.instruction);
}
