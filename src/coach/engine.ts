/**
 * Chooses which tracker runs a coaching session.
 *
 * For now every session uses the simulated tracker. The real one (body tracking
 * on the phone) plugs in here without any change to the hook or the screens.
 */
import { createSimEngine } from "./simEngine";
import type { Engine, EngineConfig } from "./types";

export function createEngine(cfg: EngineConfig, kind: "auto" | "sim" = "auto"): Engine {
  void kind;
  return createSimEngine(cfg);
}
