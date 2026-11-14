import { z } from "zod";
import { canRepeat, isCounting } from "./context";
import type { VoiceToolName } from "./provider";
import type { VoiceActionResult, VoiceActions, VoiceContext, VoiceRejection } from "./types";

export const TOOL_INPUT = {
  select_idea: z.strictObject({ ideaId: z.string().min(1).max(256) }),
  set_coaching_paused: z.strictObject({ paused: z.boolean() }),
  repeat_instruction: z.strictObject({}),
  request_capture: z.strictObject({}),
};

type ActionOutcome = "idea_selected" | "paused" | "resumed" | "captured";
type ToolResult = VoiceActionResult<ActionOutcome> | {
  ok: true;
  outcome: "repeat_instruction";
  instruction: NonNullable<VoiceContext["instruction"]>;
};

type ActionIntent = { ideaId: string } | { paused: boolean } | { capture: true };
type PendingAction = { intent: ActionIntent; origin: VoiceContext; controller: AbortController };

export const rejectTool = (reason: VoiceRejection): ToolResult => ({ ok: false, reason });

export class VoiceTools {
  private calls = new Map<string, { name: VoiceToolName; result: Promise<ToolResult> }>();
  private active: PendingAction | null = null;
  private waiting: Pick<PendingAction, "intent" | "origin"> | null = null;
  private resultClosed = false;

  constructor(
    private readonly actions: () => VoiceActions,
    private readonly freshContext: () => VoiceContext | null,
    private readonly cancelSpeech: () => void,
  ) {}

  dispatch(name: VoiceToolName, id: string, args: unknown, hasUserTurn: boolean): Promise<string> {
    if (!id || id.length > 256) return Promise.resolve(JSON.stringify(rejectTool("invalid_arguments")));
    const prior = this.calls.get(id);
    if (prior) {
      return prior.name === name
        ? prior.result.then(JSON.stringify)
        : Promise.resolve(JSON.stringify(rejectTool("invalid_arguments")));
    }
    if (this.resultClosed) return Promise.resolve(JSON.stringify(rejectTool("stale")));
    if (this.calls.size >= 200) return Promise.resolve(JSON.stringify(rejectTool("busy")));
    // Register before calling a callback, so reentrant/repeated IDs share its outcome.
    const result = Promise.resolve().then(() => hasUserTurn ? this.run(name, args) : rejectTool("unavailable"));
    this.calls.set(id, { name, result });
    return result.then(JSON.stringify);
  }

  contextChanged(context: VoiceContext) {
    if (this.waiting && (this.applied(this.waiting.intent, context) ||
        this.waiting.origin.phase !== context.phase ||
        this.waiting.origin.selectedIdeaId !== context.selectedIdeaId ||
        this.waiting.origin.lang !== context.lang)) this.waiting = null;

    const action = this.active;
    if (!action || this.applied(action.intent, context)) return;
    const { origin: previous, intent } = action;
    if (previous.phase !== context.phase || previous.selectedIdeaId !== context.selectedIdeaId ||
        previous.paused !== context.paused || previous.lang !== context.lang ||
        ("ideaId" in intent && !context.ideas.some((idea) => idea.id === intent.ideaId)) ||
        ("capture" in intent && (!context.cameraReady || isCounting(context)))) {
      action.controller.abort();
    }
  }

  closeForResult() { this.resultClosed = true; }

  end() {
    this.resultClosed = true;
    this.active?.controller.abort();
    this.active = null;
    this.waiting = null;
  }

  private async run(name: VoiceToolName, args: unknown): Promise<ToolResult> {
    const context = this.freshContext();
    if (!context || this.resultClosed) return rejectTool("stale");

    switch (name) {
      case "select_idea": {
        const parsed = TOOL_INPUT.select_idea.safeParse(args);
        if (!parsed.success) return rejectTool("invalid_arguments");
        const { ideaId } = parsed.data;
        if (context.phase !== "ideas" && context.phase !== "coach") return rejectTool("wrong_phase");
        if (context.coachPhase === "captured") return rejectTool("already_captured");
        if (!context.ideas.some((idea) => idea.id === ideaId)) return rejectTool("unknown_idea");
        if (this.waiting || this.active) return rejectTool("busy");
        if (context.selectedIdeaId === ideaId && context.phase === "coach") return { ok: true, outcome: "idea_selected" };
        return this.apply({ ideaId }, context, (signal) => this.actions().selectIdea(ideaId, signal));
      }
      case "set_coaching_paused": {
        const parsed = TOOL_INPUT.set_coaching_paused.safeParse(args);
        if (!parsed.success) return rejectTool("invalid_arguments");
        const { paused } = parsed.data;
        if (context.phase !== "coach") return rejectTool("wrong_phase");
        if (context.coachPhase === "captured") return rejectTool("already_captured");
        if (this.waiting || this.active) return rejectTool("busy");
        if (context.paused === paused) return { ok: true, outcome: paused ? "paused" : "resumed" };
        return this.apply({ paused }, context, (signal) => this.actions().setCoachingPaused(paused, signal));
      }
      case "repeat_instruction": {
        if (!TOOL_INPUT.repeat_instruction.safeParse(args).success) return rejectTool("invalid_arguments");
        if (this.waiting || this.active) return rejectTool("busy");
        if (context.paused) return rejectTool("paused");
        if (!canRepeat(context) || !context.instruction) return rejectTool("no_instruction");
        return { ok: true, outcome: "repeat_instruction", instruction: context.instruction };
      }
      case "request_capture": {
        if (!TOOL_INPUT.request_capture.safeParse(args).success) return rejectTool("invalid_arguments");
        if (context.phase === "result" || context.coachPhase === "captured" || (this.waiting && "capture" in this.waiting.intent)) {
          return rejectTool("already_captured");
        }
        if (context.phase !== "coach" || !context.selectedIdeaId) return rejectTool("wrong_phase");
        if (context.paused) return rejectTool("paused");
        if (!context.cameraReady) return rejectTool("camera_not_ready");
        if (isCounting(context)) return rejectTool("capture_in_progress");
        if (this.waiting || this.active) {
          return rejectTool(this.active && "capture" in this.active.intent ? "capture_in_progress" : "busy");
        }
        return this.apply({ capture: true }, context, (signal) => this.actions().requestCapture(signal));
      }
    }
  }

  private applied(intent: ActionIntent, context: VoiceContext) {
    if ("capture" in intent) return context.phase === "result" || context.coachPhase === "captured";
    if ("ideaId" in intent) return context.phase === "coach" && context.selectedIdeaId === intent.ideaId;
    return context.phase === "coach" && context.paused === intent.paused;
  }

  private async apply(
    intent: ActionIntent,
    origin: VoiceContext,
    callback: (signal: AbortSignal) => VoiceActionResult<ActionOutcome> | Promise<VoiceActionResult<ActionOutcome>>,
  ): Promise<ToolResult> {
    const action = { intent, origin, controller: new AbortController() };
    this.active = action;
    this.cancelSpeech();
    try {
      const result = await callback(action.controller.signal);
      if (action.controller.signal.aborted) return rejectTool("stale");
      const context = this.freshContext();
      if (result.ok && (!context || !this.applied(intent, context))) this.waiting = { intent, origin };
      return result;
    } catch {
      return rejectTool(action.controller.signal.aborted ? "stale" : "unavailable");
    } finally {
      if (this.active === action) this.active = null;
    }
  }
}
