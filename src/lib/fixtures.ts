/**
 * Sample data that matches the contracts. Used when the server has no AI key
 * configured, in tests, and to build screens before the real routes exist.
 * Anything served from here must be flagged `mock: true` to the user interface.
 */
import type { Lang, ReviewResponse, ShotPlan } from "./contracts";

/** A person standing by a window: three different shots of the same scene. */
export const SAMPLE_PLAN_PERSON: ShotPlan = {
  scene: {
    subject: "person",
    light: { from: "left", note: "Soft daylight from a window on the left." },
    background: {
      use: ["plain wall behind the subject", "window frame on the left"],
      avoid: ["bright doorway on the right edge", "cluttered shelf"],
    },
    space: "About two metres of free floor in front of the wall.",
  },
  ideas: [
    {
      id: "window-portrait",
      title: "Window-light portrait",
      style: "portrait",
      why: "Light from the side shapes the face; a plain wall keeps attention on the person.",
      photographer: {
        say: "Step closer and frame from the waist up, with the window just out of frame.",
        move: "closer",
        height: "eye",
        orientation: "portrait",
      },
      subject: { say: "Turn slightly toward the window and cross your arms loosely.", poseTemplateId: "arms-crossed" },
      framing: { subjectBox: { x: 0.24, y: 0.14, w: 0.52, h: 0.8 }, levelDeg: 0 },
      usesFromScene: ["window light from the left", "plain wall"],
    },
    {
      id: "relaxed-full",
      title: "Relaxed full-length",
      style: "candid",
      why: "Leaving space on the side the person faces makes the frame feel calm and balanced.",
      photographer: {
        say: "Take two steps back and place them on the right third of the frame.",
        move: "farther",
        height: "eye",
        orientation: "portrait",
      },
      subject: { say: "Hands in your pockets, weight on one leg, look toward the window.", poseTemplateId: "hands-in-pockets" },
      framing: { subjectBox: { x: 0.46, y: 0.1, w: 0.36, h: 0.84 }, levelDeg: 0 },
      usesFromScene: ["free floor in front of the wall", "window on the left as the space to look into"],
    },
    {
      id: "low-angle",
      title: "Low and confident",
      style: "dramatic",
      why: "Shooting from a little below makes a standing pose look taller and more confident.",
      photographer: {
        say: "Lower the phone to chest height and tilt it up slightly. Keep the doorway out of frame.",
        move: "stay",
        height: "low",
        orientation: "portrait",
      },
      subject: { say: "One hand on your hip, chin level, eyes to the camera.", poseTemplateId: "hand-on-hip" },
      framing: { subjectBox: { x: 0.28, y: 0.08, w: 0.44, h: 0.88 }, levelDeg: 0 },
      usesFromScene: ["plain wall as a clean background", "doorway on the right to crop out"],
    },
  ],
};

/** The same sample scene in Romanian, so the Romanian interface never shows English samples. */
export const SAMPLE_PLAN_PERSON_RO: ShotPlan = {
  scene: {
    subject: "person",
    light: { from: "left", note: "Lumină naturală blândă de la o fereastră din stânga." },
    background: {
      use: ["perete simplu în spatele persoanei", "rama ferestrei din stânga"],
      avoid: ["ușa luminoasă din marginea dreaptă", "raftul aglomerat"],
    },
    space: "Aproximativ doi metri de spațiu liber în fața peretelui.",
  },
  ideas: [
    {
      ...SAMPLE_PLAN_PERSON.ideas[0],
      title: "Portret în lumina ferestrei",
      why: "Lumina din lateral modelează fața; peretele simplu ține atenția pe persoană.",
      photographer: {
        ...SAMPLE_PLAN_PERSON.ideas[0].photographer,
        say: "Apropie-te și încadrează de la talie în sus, cu fereastra chiar în afara cadrului.",
      },
      subject: { say: "Întoarce-te ușor spre fereastră și încrucișează lejer brațele.", poseTemplateId: "arms-crossed" },
      usesFromScene: ["lumina ferestrei din stânga", "peretele simplu"],
    },
    {
      ...SAMPLE_PLAN_PERSON.ideas[1],
      title: "Relaxat, din cap până în picioare",
      why: "Spațiul liber în partea în care privește persoana face cadrul calm și echilibrat.",
      photographer: {
        ...SAMPLE_PLAN_PERSON.ideas[1].photographer,
        say: "Fă doi pași în spate și așază persoana pe treimea din dreapta a cadrului.",
      },
      subject: { say: "Mâinile în buzunare, greutatea pe un picior, privește spre fereastră.", poseTemplateId: "hands-in-pockets" },
      usesFromScene: ["spațiul liber din fața peretelui", "fereastra din stânga, spre care privește persoana"],
    },
    {
      ...SAMPLE_PLAN_PERSON.ideas[2],
      title: "De jos, cu încredere",
      why: "Fotografiată puțin de jos, o poziție în picioare pare mai înaltă și mai sigură.",
      photographer: {
        ...SAMPLE_PLAN_PERSON.ideas[2].photographer,
        say: "Coboară telefonul la nivelul pieptului și înclină-l ușor în sus. Ține ușa în afara cadrului.",
      },
      subject: { say: "O mână în șold, bărbia dreaptă, privirea spre cameră.", poseTemplateId: "hand-on-hip" },
      usesFromScene: ["peretele simplu ca fundal curat", "ușa din dreapta, de scos din cadru"],
    },
  ],
};

/** The sample plan in the interface language. */
export function samplePlan(lang: Lang): ShotPlan {
  return lang === "ro" ? SAMPLE_PLAN_PERSON_RO : SAMPLE_PLAN_PERSON;
}

/** A scene without a person: a cup on a table. No pose, framing only. */
export const SAMPLE_PLAN_OBJECT: ShotPlan = {
  scene: {
    subject: "food",
    light: { from: "right", note: "Window light from the right, soft shadows." },
    background: { use: ["wooden table top", "soft shadow of the cup"], avoid: ["phone charger cable", "glare on the laptop screen"] },
    space: "Clear table surface around the cup.",
  },
  ideas: [
    {
      id: "top-down",
      title: "Straight from above",
      style: "detail",
      why: "A top-down view turns the table into a clean graphic background.",
      photographer: { say: "Hold the phone flat above the cup and centre it.", move: "closer", height: "high", orientation: "portrait" },
      framing: { subjectBox: { x: 0.3, y: 0.32, w: 0.4, h: 0.36 }, levelDeg: 0 },
      usesFromScene: ["wooden table top", "round rim of the cup"],
    },
    {
      id: "side-light",
      title: "Low, with the light",
      style: "dramatic",
      why: "Light skimming across the surface shows texture and steam.",
      photographer: { say: "Drop to table height with the window on your right.", move: "closer", height: "low", orientation: "landscape" },
      framing: { subjectBox: { x: 0.36, y: 0.3, w: 0.34, h: 0.5 }, levelDeg: 0 },
      usesFromScene: ["window light from the right", "soft shadow of the cup"],
    },
    {
      id: "off-centre",
      title: "Off to one side",
      style: "wide",
      why: "Placing the subject on a third leaves room for the table to tell the story.",
      photographer: { say: "Step back and put the cup on the left third. Keep the cable out.", move: "farther", height: "eye", orientation: "landscape" },
      framing: { subjectBox: { x: 0.14, y: 0.36, w: 0.26, h: 0.4 }, levelDeg: 0 },
      usesFromScene: ["wooden table top as negative space", "charger cable to crop out"],
    },
  ],
};

const SAMPLE_REVIEW: Record<Lang, ReviewResponse> = {
  en: {
    improved: [
      "The subject now sits on a third instead of dead centre.",
      "The bright doorway is out of the frame.",
      "The pose has a clear shape instead of arms hanging flat.",
    ],
    lesson: {
      title: "Light from the side",
      text: "Turning toward a window puts light on one side of the face and gentle shadow on the other. That gives depth a flat front light cannot.",
    },
  },
  ro: {
    improved: [
      "Subiectul este acum pe o treime a cadrului, nu fix în centru.",
      "Ușa luminoasă a ieșit din cadru.",
      "Poziția are o formă clară, nu doar brațe lăsate pe lângă corp.",
    ],
    lesson: {
      title: "Lumină din lateral",
      text: "Când te întorci spre o fereastră, lumina cade pe o parte a feței și o umbră blândă pe cealaltă. Așa apare adâncimea pe care lumina din față nu o dă.",
    },
  },
};

export function sampleReview(lang: Lang): ReviewResponse {
  return SAMPLE_REVIEW[lang];
}
