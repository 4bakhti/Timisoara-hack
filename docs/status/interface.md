# Interface: status

Updated: Sat 14 Nov 2026

Branch: `claude-2/interface-part2`. Parts 1–3 were merged into `main` through PR #4 (`3c1a7ae`). Parts 4–5 and this file are in a new pull request into `main` (link in the PR list; not merged). Not deployed.

## Routes

| Route | What it is | Backend it uses |
|---|---|---|
| `/` | Home in both languages. On screens 1024 px and wider, a QR code for `<this address>/shoot` with "Scan to try it on your phone". Links to recipes, results, demo, lab | none |
| `/shoot` | The shooting flow. `?round=round-1` labels feedback (letters, digits, dashes, up to 20 characters; anything else is ignored) | analyze, review, guide, preview, feedback, recipes, events, health, optional voice session |
| `/demo` | The whole flow on a drawn scene, the bundled sample plan, the scripted coach and the sample review. Every screen says "Demo: sample data" | none: no requests except the local drawing |
| `/recipes` | Public recipes | `GET /api/recipes` |
| `/r/[id]` | One recipe, link, QR code, "Recreate this shot" | `GET /api/recipes/[id]`, `POST /api/recipes/[id]/use` |
| `/stats` | Recorded results by app version | `GET /api/stats` |
| `/manifest.webmanifest`, `/icon.svg`, `/apple-icon` | Web manifest (`start_url: /shoot`, portrait, dark), drawn SVG icon, PNG home-screen icon drawn from the same shapes | none |

## What each part does

1. **Judges' entry.** Desktop QR code, app icon, manifest, bilingual page description, `?round=` passed to the feedback form.
2. **Demo mode.** `ShootFlow` with `demo`: no camera, network or AI. The coach speaks with the phone's own voice only (`deviceSpeech`), so even `/api/speak` is not called. The "before" picture is not scored, because scoring would download the tracking model; it shows "not measured". Recipes and feedback are off, with the reason shown. `/shoot` links to the demo after a camera refusal, a missing camera, an insecure address, or when the scene could not be read.
3. **Voice conversation.** Hidden unless `health.voiceConversation` is true (it is false on this server). When available: "Talk to the coach" → the consent line (microphone audio goes to ElevenLabs, no photos) → "Start talking", which calls `unlockAudio()` and `director.start(lang)` in that tap. The control shows status, a mic mute and "Stop talking", and gives the reason on error while the touch controls keep working. `selectIdea`, `setCoachingPaused` and `requestCapture` use the same paths as touch, call `cancelPendingCapture()` first and check the abort signal before changing anything. A spoken pause shows "Paused" with a touch "Resume". Context goes to the director on every change and every 2 s: offered ideas, selected idea, scene facts only for a real reading, coach phase, instruction, person tracked, paused, camera ready. No images or landmarks are sent. The speech object goes to the coach only while talking. A language change restarts the conversation. The result screen calls `end({ afterCapture: true })`; leaving the flow calls `end()`. The demo never mounts the director, because it checks the server on mount.
4. **Layout.** On landscape phones and screens 1024 px and wider, the camera fills the width; video, picture and overlay canvas share one box (checked: all 812×375 at 812×375). Panels and bottom controls keep a 512 px column. Idea cards are capped at 384 px, and the before/after pictures at 70% of the screen height in landscape. Fixes found in the walk: the ideas header wraps instead of squeezing the title, the sample note sits on a dark backing, and camera pills are at least 44 px wide.
5. **Storage routes (after Codex-2's merge).** `RecipeView` uses `recipes.load`: "There is no recipe at this link" (no retry) vs "service did not answer" (retry). `RecipeList` uses `listResult`: "No recipes have been published yet" vs "The recipe list is not available". `StatsView` uses `statsResult`. The storage mode comes from `stats.storage`, then `health.storage`, then `health.db` (`src/state/storage.ts`). Feedback sends `afterTotal`, and `beforeTotal` only when the "before" picture was scored. `recipes.use(id)` is called once per visit, from "Start coaching this shot", never on page load. Sample ideas can be published with `sample: true` and are labelled "Made from sample suggestions" in the preview, the published card, the list and the detail page.

## Checks actually run

| Check | Result | Backend |
|---|---|---|
| `npm run check` after each part | passed every time; final: types, lint, 232 tests passed, 7 skipped (other workstreams' opt-in tests), build | not involved |
| Interaction tests added in this branch | round label, desktop QR, demo (no server calls, labels, disabled saving), voice (14 tests), recipe not-found vs unavailable, list unavailable vs empty, stats storage mode, sample recipes, use counted on start only, feedback totals | **mocked** (`vi.mock`; `@/voice` replaced by a stand-in) |
| `/` at 1280×800 and 375×812 | QR on desktop only; manifest, icons and description served | none |
| `/demo` in English 375×812 and 430×932, Romanian 320×568 and 812×375 | reaches a result; badge on every step; network log empty apart from the drawing | none (verified) |
| `/shoot` with the server reporting `voiceConversation: false` | no voice control; same buttons as before | **real** health |
| Voice conversation with a configured agent | not run | **unavailable**: no ElevenLabs agent or credentials |
| Size walk: `/`, `/shoot`, `/demo` (all steps), `/recipes`, `/r/<id>`, `/stats` at 320, 375 and 430 px, and 812×375, in English and Romanian | no sideways overflow; no button under 44×44 after the fixes above | real routes on `localhost` |
| Real routes, 375×812: sample-idea capture → feedback → publish → open link → recreate → list → stats | feedback "saved in temporary demo storage" (200); recipe published (201) with `sample: true`, link and QR; detail page loads; `uses` went to 1 after two starts in one visit; unknown id shows "no recipe at this link" (server 404 `not_found`); list shows the sample label; stats show 1 session, 1 rating, temporary-storage note | **real**, in-memory storage, no database |
| Scene reading during that run | Gemini answered 200 but fell back to sample ideas | **real** (fallback) |

Device coverage: a desktop browser pane at phone sizes, with a drawn picture instead of the camera. **No real phone, no live camera, no deployed HTTPS address.** The QR codes were not scanned with a phone; a unit test checks the drawn squares against the QR library's own output.

## Pending / not verified
- Voice conversation with a real ElevenLabs agent: consent, microphone, spoken actions, interruptions, Romanian. Only the mocked director was tested.
- Anything on a physical phone: camera, audio unlock, the overlay on a live feed, safe areas, the QR scan.
- Romanian wording by a native speaker.
- Sample plans in `src/lib/fixtures.ts` are English only, so the demo's ideas and review stay English in Romanian (fixtures belong to the integrator).
- With a database instead of memory: not checked.

## For the integrator
- Merge the new PR (parts 4–5). It touches only interface files. It was merged with `origin/main` at `7d8e74a` (conflict in `IdeaCard.tsx` resolved by keeping the AI-preview block and adding `max-w-sm`).
- Usage events: in the real-route run, a manual capture on `/shoot` sent no `POST /api/events`. The recipe recreation that was left without a capture did send one. Coach code, not changed here.
- `/api/stats?round=round-1` reported 0 sessions while that round had a rating: events do not carry the round yet (the coach-code change you planned).
- `avgScoreGain: 0` in that run is real: both totals were 0 on the drawn test picture.
- The "before" framing score for scenes without a person is still 0, not `null` (vision code, as planned).

## Steps to reproduce
1. `npm install`, `npm run dev`.
2. Desktop width: open `/` and look for the QR code. Phone width: it is gone.
3. `/demo` → "Start the demo" → "Show the sample ideas" → "Use this shot" → wait about 13 s or tap "Take it now". Every screen shows "Demo: sample data"; the browser's network tab shows no API calls.
4. `/shoot?round=round-1` → "Use a picture instead" → "Read my scene" → an idea → "Take it now" → rate and send. The feedback says it went to temporary demo storage; `GET /api/stats?round=round-1` shows the rating.
5. On the result: "Turn this shot into a recipe" → "Publish recipe" → "Open the recipe" → "Recreate this shot" → "Use a picture instead" → "Start coaching this shot". `GET /api/recipes/<id>` shows `uses: 1`.
6. `/r/does-not-exist` says there is no recipe at that link.
