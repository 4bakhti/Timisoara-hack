/** Makes a plan from the model safe to use: sane boxes, known poses, unique ids. */
import type { Box, ShotPlan } from "@/lib/contracts";
import { DEFAULT_POSE_ID, POSE_TEMPLATE_INFO } from "@/vision/poses/catalog";

const KNOWN_POSES = new Set(POSE_TEMPLATE_INFO.map((p) => p.id));
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function tidyBox(box: Box): Box {
  const w = clamp(box.w, 0.15, 1);
  const h = clamp(box.h, 0.15, 1);
  return {
    x: clamp(box.x, 0, 1 - w),
    y: clamp(box.y, 0, 1 - h),
    w,
    h,
  };
}

export function tidyPlan(plan: ShotPlan): ShotPlan {
  const seen = new Set<string>();
  return {
    scene: plan.scene,
    ideas: plan.ideas.map((idea, index) => {
      let id = idea.id.trim() || `idea-${index + 1}`;
      if (seen.has(id)) id = `${id}-${index + 1}`;
      seen.add(id);
      return {
        ...idea,
        id,
        subject: idea.subject
          ? {
              ...idea.subject,
              poseTemplateId: KNOWN_POSES.has(idea.subject.poseTemplateId) ? idea.subject.poseTemplateId : DEFAULT_POSE_ID,
            }
          : undefined,
        framing: { subjectBox: tidyBox(idea.framing.subjectBox), levelDeg: clamp(idea.framing.levelDeg, -20, 20) },
      };
    }),
  };
}
