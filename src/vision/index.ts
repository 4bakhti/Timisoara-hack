/** Public surface of the vision module. Import from "@/vision", not from deep paths. */
export { POSE_TEMPLATES, POSE_TEMPLATE_INFO, DEFAULT_POSE_ID, getPoseTemplate } from "./poses/catalog";
export { buildPose, headRadiusFor, type PoseSpec } from "./poses/build";
export { BONES, coverMap, drawGuides, placeTemplate, syncCanvas, type GuideFrame, type ViewMap } from "./render";
export { grabFrame, shrinkImage, sourceSize, type FrameSource, type GrabbedFrame, type GrabOptions } from "./frame";
export { requestMotionPermission, watchLevel } from "./level";
export { scoreStill, computeShotScore, type ScoreInput } from "./score";
export { matchAll, matchFraming, matchPose, type Correction, type FramingMatch, type PoseMatch } from "./match";
export { poseFeatures, templateToImage, toIsotropic, type LivePoints, type PoseFeatures } from "./geometry";
export { createPoseTracker, createStillTracker, hasTorso, type TrackedPose } from "./tracker";
