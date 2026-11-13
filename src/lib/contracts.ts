/**
 * Shared contracts.
 *
 * This file is the single agreement between the three parts of the app:
 *   - vision + coach  (src/vision, src/coach)  — tracks the body, decides what to say
 *   - server          (src/server, src/app/api) — talks to Gemini, ElevenLabs, the database
 *   - interface       (src/app, src/components) — screens and overlays
 *
 * Rules for changing it:
 *   - Additive only. Add optional fields; never rename or remove one.
 *   - Coordinates are normalised 0–1 with the origin at the top-left of the image.
 *   - "Left" and "right" on a person always mean the SUBJECT's own left and right.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ basics */

export const Lang = z.enum(["en", "ro"]);
export type Lang = z.infer<typeof Lang>;

/** friend = someone else holds the phone; solo = the phone is propped up. */
export const CoachMode = z.enum(["friend", "solo"]);
export type CoachMode = z.infer<typeof CoachMode>;

const unit = z.number().min(0).max(1);

export const Box = z.object({ x: unit, y: unit, w: unit, h: unit });
export type Box = z.infer<typeof Box>;

/** A JPEG as a data URL ("data:image/jpeg;base64,..."), longest side <= 1024 px. */
export const ImageData = z.string().startsWith("data:image/");
export type ImageData = z.infer<typeof ImageData>;

/* -------------------------------------------------------------- pose data */

export const POSE_POINT_NAMES = [
  "nose",
  "lShoulder",
  "rShoulder",
  "lElbow",
  "rElbow",
  "lWrist",
  "rWrist",
  "lHip",
  "rHip",
  "lKnee",
  "rKnee",
  "lAnkle",
  "rAnkle",
] as const;

export const PosePointName = z.enum(POSE_POINT_NAMES);
export type PosePointName = z.infer<typeof PosePointName>;

export const Point2 = z.tuple([z.number(), z.number()]);
export type Point2 = z.infer<typeof Point2>;

/** All thirteen points, as seen by the camera (not mirrored). */
export const PosePoints = z.record(PosePointName, Point2);
export type PosePoints = z.infer<typeof PosePoints>;

export const PoseTag = z.enum([
  "standing",
  "sitting",
  "leaning",
  "walking",
  "calm",
  "confident",
  "playful",
  "full-body",
  "half-body",
]);
export type PoseTag = z.infer<typeof PoseTag>;

export const Localised = z.object({ en: z.string(), ro: z.string() });
export type Localised = z.infer<typeof Localised>;

export const PoseTemplate = z.object({
  id: z.string(),
  name: Localised,
  /** One sentence telling the person what to do. */
  cue: Localised,
  /** Plain-English description used when asking the planner to choose a pose. */
  describe: z.string(),
  tags: z.array(PoseTag),
  points: PosePoints,
});
export type PoseTemplate = z.infer<typeof PoseTemplate>;

/** What the planner needs to know about a template (no geometry). */
export const PoseTemplateInfo = PoseTemplate.pick({ id: true, describe: true, tags: true });
export type PoseTemplateInfo = z.infer<typeof PoseTemplateInfo>;

/* ----------------------------------------------------------- the shot plan */

export const SubjectKind = z.enum(["person", "group", "object", "food", "place", "pet", "other"]);
export type SubjectKind = z.infer<typeof SubjectKind>;

export const SceneRead = z.object({
  subject: SubjectKind,
  light: z.object({
    from: z.enum(["left", "right", "front", "behind", "above", "flat"]),
    note: z.string(),
  }),
  /** Things that are actually visible in the picture. */
  background: z.object({ use: z.array(z.string()), avoid: z.array(z.string()) }),
  space: z.string(),
});
export type SceneRead = z.infer<typeof SceneRead>;

export const ShotStyle = z.enum(["portrait", "candid", "detail", "wide", "dramatic", "playful"]);
export type ShotStyle = z.infer<typeof ShotStyle>;

export const ShotIdea = z.object({
  id: z.string(),
  title: z.string(),
  style: ShotStyle,
  /** One sentence on why this works. Shown again later as the lesson. */
  why: z.string(),
  photographer: z.object({
    say: z.string(),
    move: z.enum(["closer", "farther", "left", "right", "stay"]),
    height: z.enum(["low", "eye", "high"]),
    orientation: z.enum(["portrait", "landscape"]),
  }),
  /** Absent when there is no person to pose. */
  subject: z.object({ say: z.string(), poseTemplateId: z.string() }).optional(),
  /** Where the subject should end up in the frame, and how level the phone should be. */
  framing: z.object({ subjectBox: Box, levelDeg: z.number().min(-45).max(45) }),
  /** At least two visible things this idea relies on. Used to reject generic advice. */
  usesFromScene: z.array(z.string()).min(2),
});
export type ShotIdea = z.infer<typeof ShotIdea>;

export const ShotPlan = z.object({
  scene: SceneRead,
  ideas: z.array(ShotIdea).length(3),
});
export type ShotPlan = z.infer<typeof ShotPlan>;

/* ----------------------------------------------------------------- scoring */

const pct = z.number().min(0).max(100);

/** Computed on the phone with the same function for the "before" and "after" photo. */
export const ShotScore = z.object({
  total: pct,
  framing: pct,
  /** null when the device gives no tilt reading. */
  level: pct.nullable(),
  /** null when no person is expected or visible. */
  pose: pct.nullable(),
  /** Penalises limbs cut at a joint. null without a person. */
  crop: pct.nullable(),
  /** Face brightness against the background. null without a visible face. */
  light: pct.nullable(),
});
export type ShotScore = z.infer<typeof ShotScore>;

/* --------------------------------------------------------- API: /api/health */

/** Which optional services are configured. The interface adapts to these. */
export const Health = z.object({
  gemini: z.boolean(),
  voice: z.boolean(),
  db: z.boolean(),
  auth: z.boolean(),
  preview: z.boolean(),
  stamp: z.boolean(),
});
export type Health = z.infer<typeof Health>;

/* -------------------------------------------------------- API: /api/analyze */

export const AnalyzeRequest = z.object({
  image: ImageData,
  lang: Lang,
  mode: CoachMode,
  /** Optional context for light advice. */
  where: z.object({ lat: z.number(), lng: z.number() }).optional(),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequest>;

export const AnalyzeResponse = z.object({
  plan: ShotPlan,
  /** true when the plan is canned sample data, not a reading of this photo. */
  mock: z.boolean().optional(),
  model: z.string().optional(),
  ms: z.number().optional(),
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponse>;

/* ---------------------------------------------------------- API: /api/guide */

/** Slow-loop guidance for scenes without a trackable person. */
export const GuideRequest = z.object({
  frame: ImageData, // longest side <= 512 px
  idea: ShotIdea,
  lang: Lang,
});
export type GuideRequest = z.infer<typeof GuideRequest>;

export const GuideResponse = z.object({
  match: pct,
  /** One short correction, or null when the frame already matches. */
  fix: z.string().nullable(),
  mock: z.boolean().optional(),
});
export type GuideResponse = z.infer<typeof GuideResponse>;

/* --------------------------------------------------------- API: /api/review */

export const ReviewRequest = z.object({
  before: ImageData,
  after: ImageData,
  idea: ShotIdea,
  scores: z.object({ before: ShotScore, after: ShotScore }),
  lang: Lang,
});
export type ReviewRequest = z.infer<typeof ReviewRequest>;

export const ReviewResponse = z.object({
  /** One to three concrete improvements, most important first. */
  improved: z.array(z.string()).min(1).max(3),
  lesson: z.object({ title: z.string(), text: z.string() }),
  mock: z.boolean().optional(),
});
export type ReviewResponse = z.infer<typeof ReviewResponse>;

/* -------------------------------------------------------- API: /api/preview */

export const PreviewRequest = z.object({ image: ImageData, idea: ShotIdea, lang: Lang });
export type PreviewRequest = z.infer<typeof PreviewRequest>;

/** The image is an AI sketch of the proposed shot. It is never the final photo. */
export const PreviewResponse = z.object({ image: ImageData, mock: z.boolean().optional() });
export type PreviewResponse = z.infer<typeof PreviewResponse>;

/* ---------------------------------------------------------- API: /api/speak */

/** Response is audio/mpeg. A 501 JSON error means "voice not configured". */
export const SpeakRequest = z.object({ text: z.string().min(1).max(300), lang: Lang });
export type SpeakRequest = z.infer<typeof SpeakRequest>;

/* --------------------------------------------------------- API: /api/events */

export const CoachEvent = z.object({
  /** Milliseconds since the coaching session started. */
  t: z.number(),
  score: pct,
  pose: pct.nullable().optional(),
  framing: pct.nullable().optional(),
  /** Id of the correction being given, if any. See src/coach/phrases.ts. */
  instruction: z.string().nullable().optional(),
  fps: z.number().optional(),
});
export type CoachEvent = z.infer<typeof CoachEvent>;

export const EventsRequest = z.object({
  sessionId: z.string(),
  appVersion: z.string(),
  ideaStyle: ShotStyle.optional(),
  mode: CoachMode.optional(),
  /** How the session ended. */
  outcome: z.enum(["captured", "captured-manually", "abandoned"]).optional(),
  events: z.array(CoachEvent).max(600),
});
export type EventsRequest = z.infer<typeof EventsRequest>;

/* ------------------------------------------------ API: /api/feedback, votes */

export const FeedbackRequest = z.object({
  sessionId: z.string(),
  appVersion: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
  /** Label of the user-testing round, e.g. "round-1". */
  round: z.string().optional(),
});
export type FeedbackRequest = z.infer<typeof FeedbackRequest>;

/** A before/after pair shown in random order; the voter does not know which is which. */
export const VotePair = z.object({ pairId: z.string(), a: z.string(), b: z.string() });
export type VotePair = z.infer<typeof VotePair>;

export const VoteRequest = z.object({ pairId: z.string(), choice: z.enum(["a", "b"]) });
export type VoteRequest = z.infer<typeof VoteRequest>;

/** Opt-in only: a user offers their own before/after pair for blind voting. */
export const PairCreateRequest = z.object({
  before: ImageData,
  after: ImageData,
  consent: z.literal(true),
});
export type PairCreateRequest = z.infer<typeof PairCreateRequest>;

export const PairCreateResponse = z.object({ pairId: z.string() });
export type PairCreateResponse = z.infer<typeof PairCreateResponse>;

/* -------------------------------------------------------- API: /api/recipes */

/** A shot that someone else can open and recreate. */
export const Recipe = z.object({
  id: z.string(),
  title: z.string(),
  idea: ShotIdea,
  targetPose: PoseTemplate.optional(),
  place: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  status: z.enum(["draft", "public", "hidden"]),
  uses: z.number().int().nonnegative(),
  ownerName: z.string().optional(),
  createdAt: z.string(),
});
export type Recipe = z.infer<typeof Recipe>;

export const RecipeCreateRequest = Recipe.pick({
  title: true,
  idea: true,
  targetPose: true,
  place: true,
  lat: true,
  lng: true,
});
export type RecipeCreateRequest = z.infer<typeof RecipeCreateRequest>;

/* ----------------------------------------------------------- API: /api/stats */

/** Numbers for the results dashboard, per app version. */
export const Stats = z.object({
  versions: z.array(
    z.object({
      appVersion: z.string(),
      sessions: z.number(),
      captured: z.number(),
      medianSecondsToMatch: z.number().nullable(),
      avgScoreGain: z.number().nullable(),
      avgRating: z.number().nullable(),
      ratings: z.number(),
    }),
  ),
  votes: z.object({ total: z.number(), preferredAfter: z.number() }),
});
export type Stats = z.infer<typeof Stats>;

/* -------------------------------------------------------------- API errors */

export const ApiError = z.object({
  error: z.string(), // machine-readable, e.g. "not_configured", "bad_request", "rate_limited"
  message: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiError>;
