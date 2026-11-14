/** Public surface of the vision module. Import from "@/vision", not from deep paths. */
export { POSE_TEMPLATES, POSE_TEMPLATE_INFO, DEFAULT_POSE_ID, getPoseTemplate } from "./poses/catalog";
export { buildPose, headRadiusFor, type PoseSpec } from "./poses/build";
export { BONES, coverMap, drawGuides, placeTemplate, syncCanvas, type GuideFrame, type ViewMap } from "./render";
export { grabFrame, shrinkImage, sourceSize, type FrameSource, type GrabbedFrame, type GrabOptions } from "./frame";
export { requestMotionPermission, watchLevel } from "./level";
export { scoreStill, computeShotScore, comparableScores, type ScoreInput } from "./score";
export { anchoredBox, matchAll, matchFraming, matchPose, type Correction, type FramingMatch, type FramingOptions, type PoseMatch } from "./match";
export { bodyAngles3d, poseFeatures, templateToImage, toIsotropic, type LivePoints, type PoseFeatures } from "./geometry";
export { createPoseTracker, createStillTracker, hasTorso, hasUpperBody, type StillTrackerOptions, type TrackedPose } from "./tracker";
export { createFaceTracker, type FaceTracker } from "./face";
export { fitTargetToFrame, pictureAspect, targetFromPose, targetFromPreview } from "./fromPreview";
export type { CustomTarget, FaceSignals, Limb, Point3, PoseModelName, SilhouetteMask, WorldPoints } from "./types";
