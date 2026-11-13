/**
 * Everything the coach can say, in English and Romanian.
 *
 * These lines are fixed so they can be pre-generated as audio clips and played
 * with no delay: public/voice/<lang>/<id>.mp3 (see the voice script).
 * Ids are stable — they are also logged as the "instruction" in coach events.
 *
 * "left" and "right" always mean the listener's own left and right.
 * The coach talks about pose, light and framing only — never about bodies or looks.
 */
import type { Lang, Localised } from "@/lib/contracts";

/** Who the line is for. The photographer's lines are shown on screen in friend mode. */
export type Audience = "subject" | "photographer" | "anyone";

interface Phrase extends Localised {
  to: Audience;
}

const p = (to: Audience, en: string, ro: string): Phrase => ({ to, en, ro });

export const PHRASES = {
  // --- start and presence
  intro_solo: p("subject", "I'll guide you by voice. Step in front of the camera.", "Te ghidez eu prin voce. Vino în fața camerei."),
  intro_friend: p("anyone", "I'll help with the pose. Your friend frames the shot.", "Eu te ajut cu poziția. Prietenul tău încadrează."),
  step_in: p("subject", "Step into the frame.", "Intră în cadru."),
  lost: p("subject", "I can't see you. Come back into the frame.", "Nu te mai văd. Revino în cadru."),

  // --- where the subject stands (solo mode)
  step_back: p("subject", "Take a step back.", "Fă un pas în spate."),
  come_closer: p("subject", "Come a little closer.", "Vino puțin mai aproape."),
  move_left: p("subject", "Take a small step to your left.", "Fă un pas mic spre stânga ta."),
  move_right: p("subject", "Take a small step to your right.", "Fă un pas mic spre dreapta ta."),

  // --- how the photographer holds the phone (friend mode)
  cam_left: p("photographer", "Point the phone a little to the left.", "Îndreaptă telefonul puțin spre stânga."),
  cam_right: p("photographer", "Point the phone a little to the right.", "Îndreaptă telefonul puțin spre dreapta."),
  cam_up: p("photographer", "Tilt the phone up a little.", "Înclină telefonul puțin în sus."),
  cam_down: p("photographer", "Tilt the phone down a little.", "Înclină telefonul puțin în jos."),
  cam_closer: p("photographer", "Move a little closer.", "Apropie-te puțin."),
  cam_back: p("photographer", "Move back a little.", "Depărtează-te puțin."),
  cam_level_cw: p("photographer", "Straighten the phone: rotate it slightly to the right.", "Îndreaptă telefonul: rotește-l puțin spre dreapta."),
  cam_level_ccw: p("photographer", "Straighten the phone: rotate it slightly to the left.", "Îndreaptă telefonul: rotește-l puțin spre stânga."),

  // --- arms
  raise_left_arm: p("subject", "Raise your left arm a little.", "Ridică puțin brațul stâng."),
  raise_right_arm: p("subject", "Raise your right arm a little.", "Ridică puțin brațul drept."),
  lower_left_arm: p("subject", "Lower your left arm a little.", "Coboară puțin brațul stâng."),
  lower_right_arm: p("subject", "Lower your right arm a little.", "Coboară puțin brațul drept."),
  bend_left_elbow: p("subject", "Bend your left elbow more.", "Îndoaie mai mult cotul stâng."),
  bend_right_elbow: p("subject", "Bend your right elbow more.", "Îndoaie mai mult cotul drept."),
  straighten_left_arm: p("subject", "Straighten your left arm a little.", "Întinde puțin brațul stâng."),
  straighten_right_arm: p("subject", "Straighten your right arm a little.", "Întinde puțin brațul drept."),

  // --- legs
  bend_left_knee: p("subject", "Bend your left knee a little.", "Îndoaie puțin genunchiul stâng."),
  bend_right_knee: p("subject", "Bend your right knee a little.", "Îndoaie puțin genunchiul drept."),
  straighten_left_leg: p("subject", "Straighten your left leg.", "Îndreaptă piciorul stâng."),
  straighten_right_leg: p("subject", "Straighten your right leg.", "Îndreaptă piciorul drept."),

  // --- torso and head
  lean_left: p("subject", "Lean a little to your left.", "Înclină-te puțin spre stânga ta."),
  lean_right: p("subject", "Lean a little to your right.", "Înclină-te puțin spre dreapta ta."),
  stand_straight: p("subject", "Stand up straight.", "Stai drept."),
  turn_side: p("subject", "Turn your body slightly to the side.", "Întoarce-te puțin într-o parte."),
  face_camera: p("subject", "Turn to face the camera.", "Întoarce-te cu fața spre cameră."),
  tilt_head_left: p("subject", "Tilt your head slightly to your left.", "Înclină puțin capul spre stânga ta."),
  tilt_head_right: p("subject", "Tilt your head slightly to your right.", "Înclină puțin capul spre dreapta ta."),
  relax_shoulders: p("subject", "Relax your shoulders.", "Relaxează umerii."),

  // --- encouragement and capture
  almost: p("anyone", "Almost there.", "Aproape gata."),
  nice: p("anyone", "That looks great.", "Arată foarte bine."),
  hold: p("anyone", "Perfect. Hold still.", "Perfect. Nu te mișca."),
  three: p("anyone", "Three.", "Trei."),
  two: p("anyone", "Two.", "Doi."),
  one: p("anyone", "One.", "Unu."),
  got_it: p("anyone", "Got it!", "Gata, am făcut poza!"),
} as const satisfies Record<string, Phrase>;

export type PhraseId = keyof typeof PHRASES;

export const PHRASE_IDS = Object.keys(PHRASES) as PhraseId[];

export function phraseText(id: PhraseId, lang: Lang): string {
  return PHRASES[id][lang];
}

export function phraseAudience(id: PhraseId): Audience {
  return PHRASES[id].to;
}

/** Where a pre-generated clip for this line lives, relative to the site root. */
export function phraseClipUrl(id: PhraseId, lang: Lang): string {
  return `/voice/${lang}/${id}.mp3`;
}
