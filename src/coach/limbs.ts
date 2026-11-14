/** Which body part a correction is about, so the drawing can colour that part. */
import type { Limb } from "@/vision/types";
import type { PhraseId } from "./phrases";

const LIMB_BY_PREFIX: [RegExp, Limb][] = [
  [/_left_(arm|elbow)$|^hand_(in|out)_left$/, "leftArm"],
  [/_right_(arm|elbow)$|^hand_(in|out)_right$/, "rightArm"],
  [/_left_(knee|leg)$/, "leftLeg"],
  [/_right_(knee|leg)$/, "rightLeg"],
  [/^(lean_left|lean_right|lean_forward|straighten_up|stand_straight|turn_side|face_camera|relax_shoulders)$/, "torso"],
  [/^(tilt_head_left|tilt_head_right|look_at_camera|chin_up|chin_down|eyes_open|smile)$/, "head"],
];

/** null for corrections that are not about one body part (framing, countdown, encouragement). */
export function limbForPhrase(id: PhraseId | "custom" | null | undefined): Limb | null {
  if (!id || id === "custom") return null;
  for (const [pattern, limb] of LIMB_BY_PREFIX) if (pattern.test(id)) return limb;
  return null;
}
