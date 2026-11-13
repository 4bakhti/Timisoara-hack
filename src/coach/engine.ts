/**
 * Chooses which engine runs a coaching session.
 *
 *  - "sim": the scripted session, for demos and tests without a person.
 *  - an idea with a pose: body tracking on the device.
 *  - an idea without a person (objects, food, places): server-guided framing.
 */
import { createGuideEngine } from "./guideEngine";
import { createPoseEngine } from "./poseEngine";
import { createSimEngine } from "./simEngine";
import type { Engine, EngineConfig } from "./types";

export function createEngine(cfg: EngineConfig, kind: "auto" | "sim" = "auto"): Engine {
  if (kind === "sim") return createSimEngine(cfg);
  return cfg.idea.subject ? createPoseEngine(cfg) : createGuideEngine(cfg);
}
