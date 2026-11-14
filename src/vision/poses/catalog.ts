/**
 * The pose library. Every template is written by the team as a few angles
 * (see build.ts) — no photos or third-party pose data are involved.
 *
 * The planner picks a template by id for each shot idea, using `describe` and `tags`.
 * This file has no browser dependencies, so the server can import it too.
 */
import type { PoseTemplate, PoseTemplateInfo } from "@/lib/contracts";
import { buildPose, type PoseSpec } from "./build";

type Entry = Omit<PoseTemplate, "points"> & { spec: PoseSpec };

const standing = { lThigh: 4, lShin: 0, rThigh: 4, rShin: 0 } as const;

const ENTRIES: Entry[] = [
  {
    id: "relaxed-stand",
    name: { en: "Relaxed stand", ro: "Relaxat, în picioare" },
    cue: {
      en: "Stand tall, shift your weight onto one leg and let your arms hang loose.",
      ro: "Stai drept, lasă-ți greutatea pe un picior și ține brațele relaxate.",
    },
    describe: "Standing naturally with weight on one leg, both arms hanging loose at the sides.",
    tags: ["standing", "calm", "full-body"],
    spec: {
      hipShift: 0.05,
      lUpperArm: 9,
      lForearm: 4,
      rUpperArm: 11,
      rForearm: 2,
      lThigh: 2,
      lShin: 0,
      rThigh: 9,
      rShin: -6,
    },
  },
  {
    id: "hands-in-pockets",
    name: { en: "Hands in pockets", ro: "Mâinile în buzunare" },
    cue: {
      en: "Put both hands in your pockets and drop your shoulders.",
      ro: "Bagă ambele mâini în buzunare și lasă umerii jos.",
    },
    describe: "Standing with both hands in trouser or jacket pockets, elbows slightly out.",
    tags: ["standing", "calm", "full-body", "half-body"],
    spec: { lUpperArm: 20, lForearm: -22, rUpperArm: 20, rForearm: -22, ...standing },
  },
  {
    id: "hand-on-hip",
    name: { en: "Hand on hip", ro: "Mâna în șold" },
    cue: {
      en: "Put your left hand on your hip and let the other arm relax.",
      ro: "Pune mâna stângă în șold și lasă celălalt braț relaxat.",
    },
    describe: "Standing with one hand on the hip, elbow pointing out, the other arm relaxed.",
    tags: ["standing", "confident", "full-body", "half-body"],
    spec: {
      hipShift: 0.06,
      lUpperArm: 42,
      lForearm: -58,
      rUpperArm: 8,
      rForearm: 4,
      lThigh: 3,
      lShin: 0,
      rThigh: 10,
      rShin: -4,
    },
  },
  {
    id: "arms-crossed",
    name: { en: "Arms crossed", ro: "Brațele încrucișate" },
    cue: {
      en: "Cross your arms loosely over your chest and stand tall.",
      ro: "Încrucișează lejer brațele la piept și stai drept.",
    },
    describe: "Standing upright with arms crossed over the chest. Reads as confident.",
    tags: ["standing", "confident", "half-body", "full-body"],
    spec: { lUpperArm: 14, lForearm: -104, rUpperArm: 14, rForearm: -98, ...standing },
  },
  {
    id: "hand-in-hair",
    name: { en: "Hand in hair", ro: "Mâna în păr" },
    cue: {
      en: "Raise your right hand to your hair, elbow out to the side.",
      ro: "Du mâna dreaptă la păr, cu cotul spre exterior.",
    },
    describe: "One hand raised to the head or hair with the elbow out, the other arm relaxed.",
    tags: ["standing", "playful", "half-body", "full-body"],
    spec: {
      headTilt: -6,
      lUpperArm: 9,
      lForearm: 3,
      rUpperArm: 135,
      rForearm: -115,
      ...standing,
    },
  },
  {
    id: "lean-side",
    name: { en: "Side lean", ro: "Sprijinit într-o parte" },
    cue: {
      en: "Lean your shoulder against the wall or rail beside you and cross your ankles.",
      ro: "Sprijină-te cu umărul de peretele sau balustrada de lângă tine și încrucișează gleznele.",
    },
    describe:
      "Leaning sideways against a wall, pole, rail or door frame, ankles crossed. Needs something to lean on.",
    tags: ["leaning", "calm", "full-body"],
    spec: {
      lean: 9,
      hipShift: -0.06,
      lUpperArm: 16,
      lForearm: -14,
      rUpperArm: 12,
      rForearm: -20,
      lThigh: -4,
      lShin: -16,
      rThigh: 6,
      rShin: 8,
    },
  },
  {
    id: "walk-toward",
    name: { en: "Walking in", ro: "Mergând spre cameră" },
    cue: {
      en: "Walk slowly toward the camera and let your arms swing.",
      ro: "Mergi încet spre cameră și lasă brațele să se miște natural.",
    },
    describe: "Mid-step walking toward the camera, arms swinging naturally. A candid, moving shot.",
    tags: ["walking", "playful", "full-body"],
    spec: {
      lUpperArm: 14,
      lForearm: -6,
      rUpperArm: 6,
      rForearm: 14,
      lThigh: 6,
      lShin: -4,
      rThigh: 3,
      rShin: 2,
      rThighScale: 0.82,
    },
  },
  {
    id: "three-quarter",
    name: { en: "Three-quarter turn", ro: "Întors pe trei sferturi" },
    cue: {
      en: "Turn your body halfway to the side and look back at the camera.",
      ro: "Întoarce corpul pe jumătate într-o parte și privește înapoi spre cameră.",
    },
    describe: "Body turned about 45 degrees away from the camera, face toward the camera.",
    tags: ["standing", "confident", "half-body", "full-body"],
    spec: { turn: 0.55, turnDeg: 45, lUpperArm: 10, lForearm: -4, rUpperArm: 8, rForearm: 6, ...standing },
  },
  {
    id: "sit-relaxed",
    name: { en: "Sitting, relaxed", ro: "Așezat, relaxat" },
    cue: {
      en: "Sit down, rest your hands on your knees and keep your back long.",
      ro: "Așază-te, pune mâinile pe genunchi și ține spatele drept.",
    },
    describe: "Sitting on a bench, step or chair facing the camera, hands resting on the knees.",
    tags: ["sitting", "calm", "full-body"],
    spec: {
      lUpperArm: 12,
      lForearm: 6,
      rUpperArm: 12,
      rForearm: 6,
      lThigh: 16,
      lShin: -2,
      rThigh: 16,
      rShin: -2,
      lThighScale: 0.38,
      rThighScale: 0.38,
    },
  },
  {
    id: "sit-lean-in",
    name: { en: "Sitting, leaning in", ro: "Așezat, aplecat în față" },
    cue: {
      en: "Sit, lean forward and rest your elbows on your knees.",
      ro: "Așază-te, apleacă-te în față și sprijină coatele pe genunchi.",
    },
    describe: "Sitting and leaning forward with elbows on the knees, hands together. Engaged look.",
    tags: ["sitting", "confident", "full-body"],
    spec: {
      forwardLean: 20,
      lUpperArm: 24,
      lForearm: -52,
      rUpperArm: 24,
      rForearm: -52,
      lThigh: 22,
      lShin: -4,
      rThigh: 22,
      rShin: -4,
      lThighScale: 0.3,
      rThighScale: 0.3,
    },
  },
  {
    id: "arms-up",
    name: { en: "Arms up", ro: "Brațele sus" },
    cue: {
      en: "Throw both arms up and wide. Go big.",
      ro: "Ridică ambele brațe sus și larg. Cu energie!",
    },
    describe: "Both arms raised high and wide in celebration. Works with wide shots and big scenery.",
    tags: ["standing", "playful", "full-body"],
    spec: {
      lUpperArm: 138,
      lForearm: 158,
      rUpperArm: 138,
      rForearm: 158,
      lThigh: 9,
      lShin: 2,
      rThigh: 9,
      rShin: 2,
    },
  },
  {
    id: "thinker",
    name: { en: "Thinker", ro: "Gânditor" },
    cue: {
      en: "Bring your right hand to your chin and rest that elbow on your other arm.",
      ro: "Du mâna dreaptă la bărbie și sprijină cotul pe celălalt braț.",
    },
    describe: "One hand at the chin, the other arm folded across the body supporting the elbow.",
    tags: ["standing", "calm", "half-body"],
    spec: {
      headTilt: -4,
      lUpperArm: 12,
      lForearm: -96,
      rUpperArm: 16,
      rForearm: -168,
      ...standing,
    },
  },
  {
    id: "hold-something",
    name: { en: "Holding something", ro: "Ținând ceva în mâini" },
    cue: {
      en: "Hold your cup, phone or book with both hands at chest height.",
      ro: "Ține cana, telefonul sau cartea cu ambele mâini, la nivelul pieptului.",
    },
    describe:
      "Holding an object such as a cup, book or flowers with both hands in front of the chest.",
    tags: ["standing", "calm", "half-body"],
    spec: { lUpperArm: 16, lForearm: -128, rUpperArm: 16, rForearm: -128, ...standing },
  },
  {
    id: "wave",
    name: { en: "Wave", ro: "Salut cu mâna" },
    cue: {
      en: "Raise your left hand and wave at the camera.",
      ro: "Ridică mâna stângă și fă cu mâna spre cameră.",
    },
    describe: "One arm raised in a friendly wave, the other relaxed. Light and welcoming.",
    tags: ["standing", "playful", "full-body", "half-body"],
    spec: {
      lUpperArm: 96,
      lForearm: 172,
      rUpperArm: 9,
      rForearm: 3,
      hipShift: 0.03,
      ...standing,
    },
  },
];

export const POSE_TEMPLATES: PoseTemplate[] = ENTRIES.map(({ spec, ...rest }) => ({
  ...rest,
  points: buildPose(spec),
}));

const BY_ID = new Map(POSE_TEMPLATES.map((t) => [t.id, t]));

export const DEFAULT_POSE_ID = "relaxed-stand";

/** Returns the template, or the default one when the id is unknown. */
export function getPoseTemplate(id: string | undefined): PoseTemplate {
  return (id && BY_ID.get(id)) || BY_ID.get(DEFAULT_POSE_ID)!;
}

/** The list handed to the planner: ids, descriptions and tags, no geometry. */
export const POSE_TEMPLATE_INFO: PoseTemplateInfo[] = POSE_TEMPLATES.map(
  ({ id, describe, tags }) => ({ id, describe, tags }),
);
