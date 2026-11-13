/** Public surface of the vision module. Import from "@/vision", not from deep paths. */
export { POSE_TEMPLATES, POSE_TEMPLATE_INFO, DEFAULT_POSE_ID, getPoseTemplate } from "./poses/catalog";
export { buildPose, headRadiusFor, type PoseSpec } from "./poses/build";
export { BONES, coverMap, drawGuides, placeTemplate, syncCanvas, type GuideFrame, type ViewMap } from "./render";
export { grabFrame, shrinkImage, type GrabbedFrame, type GrabOptions } from "./frame";
