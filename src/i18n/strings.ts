/** Every piece of interface text, in English and Romanian. */
import type { Lang } from "@/lib/contracts";

export const STRINGS = {
  /* ------------------------------------------------------------- general */
  switchLang: { en: "Language: English. Switch to Romanian.", ro: "Limba: română. Schimbă în engleză." },
  home: { en: "Home", ro: "Acasă" },
  back: { en: "Back", ro: "Înapoi" },
  retry: { en: "Try again", ro: "Încearcă din nou" },
  /* ------------------------------------------- pose camera (screen-reader labels only) */
  cameraSuggest: { en: "Suggest poses for this photo", ro: "Sugerează poziții pentru această fotografie" },
  cameraVoice: { en: "Spoken guidance", ro: "Ghidare vocală" },
  cameraShutter: { en: "Take the photo", ro: "Fă fotografia" },
  cameraFlip: { en: "Switch camera", ro: "Schimbă camera" },
  cameraLastPhoto: { en: "Last photo", ro: "Ultima fotografie" },
  cameraClose: { en: "Close", ro: "Închide" },
  cameraShare: { en: "Share or save", ro: "Trimite sau salvează" },
  cameraPoses: { en: "Poses", ro: "Poziții" },
  cameraPose: { en: "Pose {n} of {total}", ro: "Poziția {n} din {total}" },
  cancel: { en: "Cancel", ro: "Renunță" },
  refresh: { en: "Refresh", ro: "Reîmprospătează" },
  sample: { en: "Sample suggestions", ro: "Sugestii demonstrative" },
  notMeasured: { en: "not measured", ro: "nemăsurat" },

  /* ---------------------------------------------------------------- home */
  homeRead: { en: "Read", ro: "Citește" },
  homeReadText: {
    en: "Point the camera at anything. The app reads the light, the background and the space.",
    ro: "Îndreaptă camera spre orice. Aplicația citește lumina, fundalul și spațiul.",
  },
  homeSuggest: { en: "Suggest", ro: "Propune" },
  homeSuggestText: {
    en: "It proposes three shots that fit this scene, each with a reason.",
    ro: "Propune trei cadre potrivite scenei, fiecare cu un motiv.",
  },
  homeCoach: { en: "Coach", ro: "Îndrumă" },
  homeCoachText: {
    en: "Pick one. It guides the photographer on screen and the person in the photo by voice.",
    ro: "Alege unul. Îl îndrumă pe fotograf pe ecran și pe persoana din fotografie prin voce.",
  },
  homeCapture: { en: "Capture", ro: "Fotografiază" },
  homeCaptureText: {
    en: "When framing and pose match, it counts down and takes the photo. A real one, never generated.",
    ro: "Când încadrarea și poziția se potrivesc, numără invers și face fotografia. Una reală, niciodată generată.",
  },
  start: { en: "Start", ro: "Începe" },
  homeNote: {
    en: "Works in your phone's browser. Nothing to install.",
    ro: "Funcționează în browserul telefonului. Nu trebuie instalat nimic.",
  },
  navRecipes: { en: "Recipes", ro: "Rețete" },
  navStats: { en: "Results", ro: "Rezultate" },
  navLab: { en: "Lab", ro: "Laborator" },

  scanToTry: { en: "Scan to try it on your phone", ro: "Scanează ca să o încerci pe telefon" },
  scanQrAlt: { en: "QR code that opens the camera coach", ro: "Cod QR care deschide antrenorul foto" },
  scanLocal: {
    en: "This address only works on this computer. Open the app from its public address for a code phones can use.",
    ro: "Această adresă funcționează doar pe acest calculator. Deschide aplicația de la adresa ei publică pentru un cod pe care îl pot folosi telefoanele.",
  },
  navDemo: { en: "Demo", ro: "Demonstrație" },

  /* ---------------------------------------------------------------- demo */
  demoBadge: { en: "Demo: sample data", ro: "Demonstrație: date exemplu" },
  demoTitle: { en: "Demo", ro: "Demonstrație" },
  demoIntro: {
    en: "A walk through the whole flow on a drawn scene. No camera, no network and no AI: the ideas, the coaching and the review are prepared samples, not a reading of anything real.",
    ro: "O parcurgere a întregului flux pe o scenă desenată. Fără cameră, fără rețea și fără AI: ideile, îndrumarea și analiza sunt exemple pregătite, nu citirea a ceva real.",
  },
  demoStart: { en: "Start the demo", ro: "Pornește demonstrația" },
  demoRead: { en: "Show the sample ideas", ro: "Arată ideile exemplu" },
  demoIdeasNote: {
    en: "Prepared sample ideas. In the real app they come from reading your own scene.",
    ro: "Idei exemplu pregătite. În aplicația reală vin din citirea scenei tale.",
  },
  demoCoachNote: { en: "Scripted coaching: nobody is being tracked.", ro: "Îndrumare scriptată: nu este urmărit nimeni." },
  demoReviewNote: {
    en: "Sample review text, prepared in advance. It does not describe these pictures.",
    ro: "Text de analiză exemplu, pregătit dinainte. Nu descrie aceste imagini.",
  },
  demoPhotoNote: {
    en: "In the demo the “photo” is a copy of the drawing. In the real app it is a real capture from your camera.",
    ro: "În demonstrație, „fotografia” este o copie a desenului. În aplicația reală este o captură reală de la camera ta.",
  },
  demoNoRecipe: {
    en: "Recipes are turned off in the demo: sample ideas are not published.",
    ro: "Rețetele sunt dezactivate în demonstrație: ideile exemplu nu sunt publicate.",
  },
  demoNoFeedback: {
    en: "Feedback is turned off in the demo, so a demo run is never counted as a real test.",
    ro: "Părerile sunt dezactivate în demonstrație, ca o rulare demonstrativă să nu fie numărată ca un test real.",
  },
  demoAgain: { en: "Run the demo again", ro: "Rulează din nou demonstrația" },
  tryReal: { en: "Try it with your camera", ro: "Încearc-o cu camera ta" },
  watchDemo: { en: "Camera or network not working? Watch the demo", ro: "Camera sau rețeaua nu merg? Vezi demonstrația" },
  demoSceneAlt: {
    en: "Drawing of a person standing by a window in a room",
    ro: "Desen cu o persoană în picioare lângă o fereastră, într-o cameră",
  },

  /* ---------------------------------------------------- voice conversation */
  talkStart: { en: "Talk to the coach", ro: "Vorbește cu antrenorul" },
  talkStop: { en: "Stop talking", ro: "Oprește conversația" },
  talkConsent: {
    en: "While this is on, your microphone audio is sent to ElevenLabs so the coach can hear you and answer. No photos are sent. Turn it off at any time.",
    ro: "Cât timp este pornit, sunetul de la microfon este trimis la ElevenLabs, ca antrenorul să te audă și să răspundă. Nu se trimit fotografii. Îl poți opri oricând.",
  },
  talkAgree: { en: "Start talking", ro: "Începe conversația" },
  talkMute: { en: "Mute mic", ro: "Oprește microfonul" },
  talkUnmute: { en: "Unmute mic", ro: "Pornește microfonul" },
  talkStatusDisconnected: { en: "Voice: off", ro: "Voce: oprită" },
  talkStatusConnecting: { en: "Voice: connecting…", ro: "Voce: se conectează…" },
  talkStatusListening: { en: "Voice: listening", ro: "Voce: ascultă" },
  talkStatusSpeaking: { en: "Voice: speaking", ro: "Voce: vorbește" },
  talkStatusError: { en: "Voice: not available", ro: "Voce: indisponibilă" },
  talkReasonNotConfigured: { en: "The voice service is not set up.", ro: "Serviciul de voce nu este configurat." },
  talkReasonMic: { en: "No microphone was found.", ro: "Nu a fost găsit niciun microfon." },
  talkReasonDenied: {
    en: "The microphone is blocked. Allow it in your browser settings.",
    ro: "Microfonul este blocat. Permite-l din setările browserului.",
  },
  talkReasonRate: { en: "Too many attempts. Try again in a minute.", ro: "Prea multe încercări. Încearcă din nou peste un minut." },
  talkReasonProvider: { en: "The voice service is not answering.", ro: "Serviciul de voce nu răspunde." },
  talkReasonLost: { en: "The connection was lost.", ro: "Conexiunea s-a pierdut." },
  talkTouchStillWorks: { en: "The buttons keep working.", ro: "Butoanele funcționează în continuare." },
  paused: { en: "Paused", ro: "În pauză" },
  resume: { en: "Resume", ro: "Continuă" },

  /* --------------------------------------------------------------- shoot */
  openCamera: { en: "Open the camera", ro: "Deschide camera" },
  usePicture: { en: "Use a picture instead", ro: "Folosește o fotografie" },
  privacy: {
    en: "Nothing leaves your phone until you tap “Read my scene”.",
    ro: "Nimic nu pleacă de pe telefon până nu apeși „Citește scena”.",
  },
  privacyRecipe: {
    en: "Nothing leaves your phone while you line up the shot. Photos are sent only if you ask to compare them afterwards.",
    ro: "Nimic nu pleacă de pe telefon cât timp pregătești cadrul. Fotografiile sunt trimise doar dacă ceri apoi să fie comparate.",
  },
  privacyRecipeGuided: {
    en: "This shot has no person to track, so while the coach runs, small frames from the camera are sent to the server to check the framing. Nothing is sent before you start the coach.",
    ro: "Acest cadru nu are o persoană de urmărit, așa că, în timp ce antrenorul rulează, cadre mici de la cameră sunt trimise la server pentru a verifica încadrarea. Nimic nu este trimis înainte să pornești antrenorul.",
  },
  readScene: { en: "Read my scene", ro: "Citește scena" },
  reading1: { en: "Finding the light…", ro: "Caut lumina…" },
  reading2: { en: "Checking the background…", ro: "Verific fundalul…" },
  reading3: { en: "Planning three shots…", ro: "Pregătesc trei cadre…" },
  sampleIdeasNote: {
    en: "The scene could not be read, so these are examples, not suggestions for your scene.",
    ro: "Scena nu a putut fi citită, așa că acestea sunt exemple, nu sugestii pentru scena ta.",
  },
  pickShot: { en: "Pick a shot", ro: "Alege un cadru" },
  useShot: { en: "Use this shot", ro: "Folosește acest cadru" },
  aiPreviewLabel: { en: "AI preview, not your photo", ro: "Previzualizare AI, nu fotografia ta" },
  drawingPose: { en: "Drawing this pose…", ro: "Desenez această poziție…" },
  previewsNote: {
    en: "The previews are drawn by AI from your scene photo. Your final photo is always a real capture.",
    ro: "Previzualizările sunt desenate de AI din fotografia scenei. Fotografia finală este mereu o captură reală.",
  },
  photographer: { en: "Photographer", ro: "Fotograful" },
  inPhoto: { en: "In the photo", ro: "În fotografie" },
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
  recreating: { en: "Recreating a recipe", ro: "Recreezi o rețetă" },
  backToRecipe: { en: "Back to the recipe", ro: "Înapoi la rețetă" },
  startRecipe: { en: "Start coaching this shot", ro: "Pornește antrenorul pentru acest cadru" },
  frameFailed: {
    en: "The picture could not be read. Try again, or choose another picture.",
    ro: "Imaginea nu a putut fi citită. Încearcă din nou sau alege altă fotografie.",
  },
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

  /* -------------------------------------------------------------- result */
  before: { en: "Before", ro: "Înainte" },
  after: { en: "After", ro: "După" },
  pose: { en: "Pose", ro: "Poziție" },
  framing: { en: "Framing", ro: "Încadrare" },
  crop: { en: "Crop", ro: "Decupaj" },
  light: { en: "Light", ro: "Lumină" },
  level: { en: "Level", ro: "Orizont" },
  notMeasuredKey: { en: "– = not measured", ro: "– = nemăsurat" },
  scoreNote: {
    en: "The score shows how closely a photo follows the chosen idea's pose and framing. It does not say how good the photo is.",
    ro: "Scorul arată cât de aproape este fotografia de poziția și încadrarea ideii alese. Nu spune cât de bună este fotografia.",
  },
  sameMeasuresNote: {
    en: "Both totals count only what was measured in both photos.",
    ro: "Ambele totaluri iau în calcul doar ce s-a măsurat în ambele fotografii.",
  },
  scoring: { en: "Scoring…", ro: "Calculez…" },
  comparing: { en: "Comparing your two photos…", ro: "Compar cele două fotografii…" },
  improved: { en: "What improved", ro: "Ce s-a îmbunătățit" },
  sampleReview: { en: "Sample text, not about your photos", ro: "Text demonstrativ, nu despre fotografiile tale" },
  lesson: { en: "Lesson", ro: "Lecție" },
  whyItWorks: { en: "Why it works", ro: "De ce funcționează" },
  askReview: { en: "Compare my two photos", ro: "Compară cele două fotografii" },
  askReviewNote: {
    en: "Sends the before and after photos to the server to describe what changed.",
    ro: "Trimite fotografiile „înainte” și „după” la server pentru a descrie ce s-a schimbat.",
  },
  realPhoto: {
    en: "Your photo is a real capture. It is never edited or generated.",
    ro: "Fotografia ta este o captură reală. Nu este niciodată editată sau generată.",
  },
  save: { en: "Save or share", ro: "Salvează sau trimite" },
  another: { en: "Try another idea", ro: "Încearcă altă idee" },
  newScene: { en: "New scene", ro: "Scenă nouă" },
  shootAgain: { en: "Shoot it again", ro: "Mai fă o dată" },

  /* ------------------------------------------------------------ feedback */
  rate: { en: "How useful was the coaching?", ro: "Cât de util a fost antrenorul?" },
  rateScale: { en: "1 = not useful, 5 = very useful", ro: "1 = deloc util, 5 = foarte util" },
  ratingOption: { en: "{n} out of 5", ro: "{n} din 5" },
  commentLabel: { en: "Anything to add? (optional)", ro: "Vrei să adaugi ceva? (opțional)" },
  commentPlaceholder: { en: "What helped, what got in the way…", ro: "Ce a ajutat, ce te-a încurcat…" },
  feedbackPrivacy: {
    en: "Sent: your rating, your comment, the app version and a random code for this session. No photo.",
    ro: "Se trimit: nota, comentariul, versiunea aplicației și un cod aleator pentru această sesiune. Nicio fotografie.",
  },
  pickRating: { en: "Choose a rating to send.", ro: "Alege o notă pentru a trimite." },
  sendFeedback: { en: "Send feedback", ro: "Trimite părerea" },
  sending: { en: "Sending…", ro: "Se trimite…" },
  feedbackSaved: { en: "Thank you. Your feedback was saved.", ro: "Mulțumim. Părerea ta a fost salvată." },
  feedbackSavedTemp: {
    en: "Thank you. Your feedback was saved in temporary demo storage: this server has no database, so it can be lost when the server restarts.",
    ro: "Mulțumim. Părerea ta a fost salvată într-un spațiu temporar, de demonstrație: serverul nu are bază de date, deci se poate pierde la repornirea lui.",
  },
  feedbackFailed: { en: "Your feedback was not saved.", ro: "Părerea ta nu a fost salvată." },
  feedbackFailedOffline: {
    en: "You seem to be offline. Reconnect, then try again.",
    ro: "Se pare că nu ai conexiune. Reconectează-te, apoi încearcă din nou.",
  },
  feedbackFailedServer: {
    en: "The server did not accept it; the feedback service may not be available yet. Your rating and comment are still here.",
    ro: "Serverul nu a acceptat-o; este posibil ca serviciul de feedback să nu fie disponibil încă. Nota și comentariul tău sunt încă aici.",
  },

  /* -------------------------------------------------- publishing a recipe */
  makeRecipe: { en: "Turn this shot into a recipe", ro: "Transformă cadrul într-o rețetă" },
  makeRecipeHint: {
    en: "A recipe lets other people recreate this shot. Your photos are not included.",
    ro: "O rețetă le permite altora să recreeze acest cadru. Fotografiile tale nu sunt incluse.",
  },
  recipePreview: { en: "Recipe preview", ro: "Previzualizare rețetă" },
  recipeTitle: { en: "Title", ro: "Titlu" },
  recipeIdea: { en: "The shot", ro: "Cadrul" },
  recipePlace: { en: "Place (optional)", ro: "Loc (opțional)" },
  recipePlaceHint: { en: "For example: Piața Unirii, Timișoara", ro: "De exemplu: Piața Unirii, Timișoara" },
  addPosition: { en: "Add my current position (optional)", ro: "Adaugă poziția mea actuală (opțional)" },
  positionHint: {
    en: "Only if you add it: your position is published with the recipe so others can find the spot.",
    ro: "Doar dacă o adaugi: poziția ta este publicată împreună cu rețeta, ca alții să găsească locul.",
  },
  locating: { en: "Finding your position…", ro: "Îți caut poziția…" },
  positionAdded: { en: "Position added: {coords}", ro: "Poziție adăugată: {coords}" },
  removePosition: { en: "Remove position", ro: "Elimină poziția" },
  positionDenied: {
    en: "Location access was refused. Everything works without it.",
    ro: "Accesul la locație a fost refuzat. Totul funcționează și fără.",
  },
  positionUnavailable: {
    en: "Your position could not be found. Everything works without it.",
    ro: "Poziția ta nu a putut fi găsită. Totul funcționează și fără.",
  },
  publishNotice: {
    en: "Publishing makes this recipe public: anyone with the link or QR code can open it, and it appears in the public recipe list. What is published: the title, the shot shown above, and the place or position if you add them. Your photos are never uploaded.",
    ro: "Publicarea face rețeta publică: oricine are linkul sau codul QR o poate deschide, iar rețeta apare în lista publică. Se publică: titlul, cadrul de mai sus și locul sau poziția, dacă le adaugi. Fotografiile tale nu sunt încărcate niciodată.",
  },
  publish: { en: "Publish recipe", ro: "Publică rețeta" },
  publishing: { en: "Publishing…", ro: "Se publică…" },
  samplePublishBlocked: {
    en: "This idea is a sample, not a reading of your scene, so it cannot be published as a recipe.",
    ro: "Această idee este un exemplu, nu o citire a scenei tale, așa că nu poate fi publicată ca rețetă.",
  },
  notPublished: { en: "Not published.", ro: "Nu a fost publicată." },
  errAuth: {
    en: "Publishing needs sign-in, and sign-in is not available yet.",
    ro: "Publicarea necesită autentificare, iar autentificarea nu este disponibilă încă.",
  },
  errMissing: {
    en: "The recipe service is not available on this server yet.",
    ro: "Serviciul de rețete nu este disponibil încă pe acest server.",
  },
  errNotConfigured: {
    en: "Recipe storage is not set up on this server.",
    ro: "Stocarea rețetelor nu este configurată pe acest server.",
  },
  errRate: {
    en: "Too many requests. Wait a minute, then try again.",
    ro: "Prea multe cereri. Așteaptă un minut, apoi încearcă din nou.",
  },
  errRejected: {
    en: "The server rejected this recipe. Check the title and the place, then try again.",
    ro: "Serverul a respins rețeta. Verifică titlul și locul, apoi încearcă din nou.",
  },
  errNetwork: {
    en: "The server could not be reached. Check your connection, then try again.",
    ro: "Serverul nu a putut fi contactat. Verifică conexiunea, apoi încearcă din nou.",
  },
  errServer: {
    en: "The server had a problem. Try again in a moment.",
    ro: "Serverul a întâmpinat o problemă. Încearcă din nou peste puțin timp.",
  },
  errUnconfirmed: {
    en: "The server answered in an unexpected way, so the recipe cannot be confirmed as published.",
    ro: "Serverul a răspuns într-un mod neașteptat, așa că publicarea rețetei nu poate fi confirmată.",
  },
  published: { en: "Your recipe is public.", ro: "Rețeta ta este publică." },
  publishedNotPublic: {
    en: "The recipe was saved, but the server did not make it public (status: {status}). Other people cannot open it yet.",
    ro: "Rețeta a fost salvată, dar serverul nu a făcut-o publică (stare: {status}). Alții nu o pot deschide încă.",
  },
  tempStorageRecipe: {
    en: "Temporary demo storage: this server has no database, so recipes and their links can disappear when the server restarts.",
    ro: "Stocare temporară, de demonstrație: serverul nu are bază de date, deci rețetele și linkurile lor pot dispărea la repornirea serverului.",
  },

  /* ------------------------------------------------------ sharing a link */
  shareLinkLabel: { en: "Link to this recipe", ro: "Linkul rețetei" },
  localLink: {
    en: "This link points to this device only. Open the app from its public address to get a link that works on other phones.",
    ro: "Acest link funcționează doar pe acest dispozitiv. Deschide aplicația de la adresa ei publică pentru un link care merge și pe alte telefoane.",
  },
  qrAlt: { en: "QR code for the recipe link", ro: "Cod QR pentru linkul rețetei" },
  qrHint: { en: "Scan to open this recipe on another phone.", ro: "Scanează pentru a deschide rețeta pe alt telefon." },
  qrFailed: {
    en: "The QR code could not be drawn. The link still works.",
    ro: "Codul QR nu a putut fi desenat. Linkul funcționează în continuare.",
  },
  copyLink: { en: "Copy link", ro: "Copiază linkul" },
  copied: { en: "Link copied.", ro: "Link copiat." },
  copyFailed: {
    en: "Could not copy. Select the link and copy it by hand.",
    ro: "Nu am putut copia. Selectează linkul și copiază-l manual.",
  },
  shareLink: { en: "Share link", ro: "Trimite linkul" },
  openRecipe: { en: "Open the recipe", ro: "Deschide rețeta" },

  /* -------------------------------------------------------- recipe pages */
  recipesTitle: { en: "Recipes", ro: "Rețete" },
  recipesIntro: {
    en: "Shots other people published. Open one and the coach helps you recreate it.",
    ro: "Cadre publicate de alți oameni. Deschide unul, iar antrenorul te ajută să-l recreezi.",
  },
  recipesLoading: { en: "Loading recipes…", ro: "Se încarcă rețetele…" },
  recipesEmpty: { en: "No public recipes to show.", ro: "Nu există rețete publice de afișat." },
  recipesEmptyWhy: {
    en: "The recipe service answered: nobody has published a recipe yet.",
    ro: "Serviciul de rețete a răspuns: nimeni nu a publicat încă o rețetă.",
  },
  makeFirst: { en: "Take a photo and publish one", ro: "Fă o fotografie și publică una" },
  sortNear: { en: "Sort by distance from me", ro: "Ordonează după distanța față de mine" },
  sortNearHint: {
    en: "Your position is used on this phone only, to sort the list. It is not sent anywhere.",
    ro: "Poziția ta este folosită doar pe acest telefon, pentru a ordona lista. Nu este trimisă nicăieri.",
  },
  sortedNear: { en: "Sorted by distance from you.", ro: "Ordonate după distanța față de tine." },
  distanceAway: { en: "{d} away", ro: "la {d}" },
  usedTimes: { en: "Uses: {n}", ro: "Utilizări: {n}" },
  recipeLoading: { en: "Loading the recipe…", ro: "Se încarcă rețeta…" },
  recipeMissing: { en: "This recipe could not be loaded.", ro: "Rețeta nu a putut fi încărcată." },
  recipeNotFound: { en: "There is no recipe at this link.", ro: "Nu există nicio rețetă la acest link." },
  recipeNotFoundWhy: {
    en: "It may have been removed, or the link may be mistyped.",
    ro: "Este posibil să fi fost eliminată sau ca linkul să fie scris greșit.",
  },
  recipeUnavailableWhy: {
    en: "The recipe service did not answer. The recipe may still exist: try again in a moment.",
    ro: "Serviciul de rețete nu a răspuns. Rețeta poate exista în continuare: încearcă din nou peste puțin timp.",
  },
  recipesNone: { en: "No recipes have been published yet.", ro: "Nu a fost publicată încă nicio rețetă." },
  recipesUnavailable: { en: "The recipe list is not available.", ro: "Lista de rețete nu este disponibilă." },
  recipesUnavailableWhy: {
    en: "The recipe service did not answer. Nothing is shown rather than an incomplete list.",
    ro: "Serviciul de rețete nu a răspuns. Nu afișăm nimic, în loc de o listă incompletă.",
  },
  madeFromSample: { en: "Made from sample suggestions", ro: "Făcută din sugestii demonstrative" },
  samplePublishNote: {
    en: "This idea is a sample, not a reading of your scene. It is published with the label “made from sample suggestions”.",
    ro: "Această idee este un exemplu, nu o citire a scenei tale. Este publicată cu eticheta „făcută din sugestii demonstrative”.",
  },
  recipeMissingWhy: {
    en: "It may not exist, it may have been removed, or the recipe service may be unavailable right now. The app cannot tell which.",
    ro: "Este posibil să nu existe, să fi fost eliminată sau ca serviciul de rețete să nu fie disponibil acum. Aplicația nu poate ști care dintre ele.",
  },
  allRecipes: { en: "All recipes", ro: "Toate rețetele" },
  recreate: { en: "Recreate this shot", ro: "Recreează acest cadru" },
  recreateHint: {
    en: "Opens the camera coach with this shot. You choose when to start the camera.",
    ro: "Deschide antrenorul cu acest cadru. Tu alegi când pornește camera.",
  },
  lookFor: { en: "Look for", ro: "Caută în scenă" },
  placeLabel: { en: "Place", ro: "Loc" },
  positionLabel: { en: "Position", ro: "Poziție" },
  openMap: { en: "Open in a map", ro: "Deschide pe hartă" },
  byOwner: { en: "by {name}", ro: "de {name}" },
  publishedOn: { en: "Published {date}", ro: "Publicată pe {date}" },
  notPublicBanner: {
    en: "This recipe is not public (status: {status}).",
    ro: "Această rețetă nu este publică (stare: {status}).",
  },
  stylePortrait: { en: "Portrait", ro: "Portret" },
  styleCandid: { en: "Candid", ro: "Spontan" },
  styleDetail: { en: "Detail", ro: "Detaliu" },
  styleWide: { en: "Wide", ro: "Cadru larg" },
  styleDramatic: { en: "Dramatic", ro: "Dramatic" },
  stylePlayful: { en: "Playful", ro: "Jucăuș" },

  /* --------------------------------------------------------------- stats */
  statsTitle: { en: "Results", ro: "Rezultate" },
  statsIntro: {
    en: "What was actually recorded during user testing, by app version. Nothing here is estimated or filled in.",
    ro: "Ce s-a înregistrat efectiv în timpul testelor cu utilizatori, pe versiuni ale aplicației. Nimic de aici nu este estimat sau completat.",
  },
  statsLoading: { en: "Loading the numbers…", ro: "Se încarcă cifrele…" },
  statsUnavailable: { en: "The numbers are not available.", ro: "Cifrele nu sunt disponibile." },
  statsUnavailableWhy: {
    en: "The results service did not answer, or it is not set up on this server. No numbers are shown rather than made-up ones.",
    ro: "Serviciul de rezultate nu a răspuns sau nu este configurat pe acest server. Nu afișăm nicio cifră în loc să inventăm unele.",
  },
  statsEmpty: { en: "Nothing has been recorded yet.", ro: "Nu s-a înregistrat nimic încă." },
  statsEmptyWhy: {
    en: "The results service answered, and it holds no coaching sessions, ratings or votes.",
    ro: "Serviciul de rezultate a răspuns și nu conține nicio sesiune de antrenament, notă sau vot.",
  },
  statsTemp: {
    en: "Temporary demo storage: this server has no database. These numbers live in its memory and reset when it restarts.",
    ro: "Stocare temporară, de demonstrație: serverul nu are bază de date. Cifrele sunt ținute în memoria lui și se resetează la repornire.",
  },
  statsSmall: {
    en: "These are small numbers. Read them as early observations, not conclusions.",
    ro: "Cifrele sunt mici. Privește-le ca pe observații timpurii, nu ca pe concluzii.",
  },
  activityTitle: { en: "Coaching sessions per hour", ro: "Sesiuni de antrenament pe oră" },
  activityIntro: {
    en: "The last 48 hours. Point at or tap a column for that hour's average live score and frame rate.",
    ro: "Ultimele 48 de ore. Atinge o coloană pentru scorul live mediu și cadrele pe secundă din acea oră.",
  },
  activityNone: { en: "No coaching in the last 48 hours.", ro: "Niciun antrenament în ultimele 48 de ore." },
  activityTotal: {
    en: "Coaching sessions per hour, {n} in the last 48 hours",
    ro: "Sesiuni de antrenament pe oră, total în ultimele 48 de ore: {n}",
  },
  activitySessions: { en: "{n} sessions", ro: "sesiuni: {n}" },
  activityOneSession: { en: "1 session", ro: "sesiuni: 1" },
  activityScore: { en: "average live score {n}", ro: "scor live mediu: {n}" },
  activityFps: { en: "{n} frames per second", ro: "cadre pe secundă: {n}" },
  activityTable: { en: "Show as a table", ro: "Arată ca tabel" },
  activityHourCol: { en: "Hour", ro: "Ora" },
  activityScoreCol: { en: "Average live score", ro: "Scor live mediu" },
  activityFpsCol: { en: "Frames per second", ro: "Cadre pe secundă" },
  activitySourceCagg: {
    en: "Rolled up live by a TimescaleDB continuous aggregate on Tiger Data.",
    ro: "Agregat în timp real de un continuous aggregate TimescaleDB pe Tiger Data.",
  },
  activitySourceEvents: {
    en: "Computed directly from the recorded coaching samples.",
    ro: "Calculat direct din eșantioanele de antrenament înregistrate.",
  },
  activitySourceMemory: {
    en: "From this server's temporary memory.",
    ro: "Din memoria temporară a acestui server.",
  },
  versionLabel: { en: "Version {v}", ro: "Versiunea {v}" },
  thisBuild: { en: "this build", ro: "versiunea curentă" },
  sessions: { en: "Coaching sessions", ro: "Sesiuni de antrenament" },
  captured: { en: "Ended with a photo", ro: "Încheiate cu o fotografie" },
  ofTotal: { en: "{a} of {b}", ro: "{a} din {b}" },
  medianTime: { en: "Median time to a matching shot", ro: "Timp median până la un cadru potrivit" },
  secondsValue: { en: "{n} s", ro: "{n} s" },
  scoreGain: { en: "Average change in match score", ro: "Schimbarea medie a scorului de potrivire" },
  pointsValue: { en: "{n} points", ro: "{n} puncte" },
  ratingAvg: { en: "Average rating", ro: "Nota medie" },
  ratingValue: { en: "{avg} out of 5 (ratings: {n})", ro: "{avg} din 5 (note: {n})" },
  noRatings: { en: "No ratings yet", ro: "Nicio notă încă" },
  unmeasured: { en: "Not measured", ro: "Nemăsurat" },
  votesTitle: { en: "Blind votes", ro: "Voturi oarbe" },
  votesNone: { en: "No blind votes have been recorded.", ro: "Nu s-a înregistrat niciun vot orb." },
  votesLine: {
    en: "{a} of {b} votes preferred the photo taken after coaching.",
    ro: "{a} din {b} voturi au preferat fotografia făcută după antrenament.",
  },
  votesExplain: {
    en: "Voters see a before and an after photo in random order, without knowing which is which.",
    ro: "Votanții văd o fotografie „înainte” și una „după” în ordine aleatoare, fără să știe care este care.",
  },
  scoreCaveat: {
    en: "The match score measures how closely a photo follows the chosen idea's pose and framing. It is not an objective measure of photo quality.",
    ro: "Scorul de potrivire măsoară cât de aproape este o fotografie de poziția și încadrarea ideii alese. Nu este o măsură obiectivă a calității fotografiei.",
  },
} as const satisfies Record<string, Record<Lang, string>>;

export type StringKey = keyof typeof STRINGS;

export function t(key: StringKey, lang: Lang): string {
  return STRINGS[key][lang];
}

/** Like `t`, with `{name}` placeholders filled in. */
export function tf(key: StringKey, lang: Lang, values: Record<string, string | number>): string {
  return t(key, lang).replace(/\{(\w+)\}/g, (whole, name: string) => (name in values ? String(values[name]) : whole));
}

/** Numbers the way each language writes them, with at most one decimal. */
export function formatNumber(value: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === "ro" ? "ro-RO" : "en-GB", { maximumFractionDigits: 1 }).format(value);
}
