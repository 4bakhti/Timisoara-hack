/** Every piece of interface text, in English and Romanian. */
import type { Lang } from "@/lib/contracts";

export const STRINGS = {
  openCamera: { en: "Open the camera", ro: "Deschide camera" },
  usePicture: { en: "Use a picture instead", ro: "Folosește o fotografie" },
  privacy: {
    en: "Nothing leaves your phone until you tap “Read my scene”.",
    ro: "Nimic nu pleacă de pe telefon până nu apeși „Citește scena”.",
  },
  readScene: { en: "Read my scene", ro: "Citește scena" },
  reading1: { en: "Finding the light…", ro: "Caut lumina…" },
  reading2: { en: "Checking the background…", ro: "Verific fundalul…" },
  reading3: { en: "Planning three shots…", ro: "Pregătesc trei cadre…" },
  sample: { en: "Sample suggestions", ro: "Sugestii demonstrative" },
  pickShot: { en: "Pick a shot", ro: "Alege un cadru" },
  useShot: { en: "Use this shot", ro: "Folosește acest cadru" },
  photographer: { en: "Photographer", ro: "Fotograful" },
  inPhoto: { en: "In the photo", ro: "În fotografie" },
  back: { en: "Back", ro: "Înapoi" },
  solo: { en: "Solo", ro: "Singur" },
  friend: { en: "With a friend", ro: "Cu un prieten" },
  voiceOn: { en: "Voice on", ro: "Voce pornită" },
  voiceOff: { en: "Voice off", ro: "Voce oprită" },
  flip: { en: "Flip camera", ro: "Schimbă camera" },
  shutter: { en: "Take it now", ro: "Fă poza acum" },
  starting: { en: "Starting the coach…", ro: "Pornesc antrenorul…" },
  noTracking: {
    en: "Live tracking isn't available on this device. Line up with the outline and take the photo.",
    ro: "Urmărirea live nu este disponibilă pe acest dispozitiv. Aliniază-te cu conturul și fă poza.",
  },
  before: { en: "Before", ro: "Înainte" },
  after: { en: "After", ro: "După" },
  pose: { en: "Pose", ro: "Poziție" },
  framing: { en: "Framing", ro: "Încadrare" },
  crop: { en: "Crop", ro: "Decupaj" },
  light: { en: "Light", ro: "Lumină" },
  level: { en: "Level", ro: "Orizont" },
  notMeasured: { en: "not measured", ro: "nemăsurat" },
  scoring: { en: "Scoring…", ro: "Calculez…" },
  improved: { en: "What improved", ro: "Ce s-a îmbunătățit" },
  lesson: { en: "Lesson", ro: "Lecție" },
  realPhoto: {
    en: "Your photo is a real capture. It is never edited or generated.",
    ro: "Fotografia ta este o captură reală. Nu este niciodată editată sau generată.",
  },
  save: { en: "Save or share", ro: "Salvează sau trimite" },
  another: { en: "Try another idea", ro: "Încearcă altă idee" },
  newScene: { en: "New scene", ro: "Scenă nouă" },
  rate: { en: "How useful was the coaching?", ro: "Cât de util a fost antrenorul?" },
  thanks: { en: "Thank you!", ro: "Mulțumim!" },
  cameraDenied: {
    en: "The camera is blocked. Allow camera access for this site in your browser settings, then reload.",
    ro: "Camera este blocată. Permite accesul la cameră pentru acest site din setările browserului, apoi reîncarcă pagina.",
  },
  cameraMissing: {
    en: "No camera was found. You can still try the coach with a picture.",
    ro: "Nu am găsit nicio cameră. Poți încerca antrenorul cu o fotografie.",
  },
  insecure: {
    en: "The camera needs a secure (https) address. You can still try the coach with a picture.",
    ro: "Camera are nevoie de o adresă securizată (https). Poți încerca antrenorul cu o fotografie.",
  },
} as const satisfies Record<string, Record<Lang, string>>;

export type StringKey = keyof typeof STRINGS;

export function t(key: StringKey, lang: Lang): string {
  return STRINGS[key][lang];
}
