# Interface: status

Updated: Sat 14 Nov, 11:00

Branch: `claude-2/interface-extras`, from `main` at `0439c62`. Pull request: into `main`, not merged (see the PR for the link). Not deployed.

## Routes

| Route | What it is | Backend it needs |
|---|---|---|
| `/` | Home, now in both languages, with links to the other screens | none |
| `/shoot` | The shooting flow (fixes only, same architecture and tracker) | `/api/analyze`, `/api/review`, `/api/guide` (exist); `/api/feedback`, `/api/recipes` (missing) |
| `/recipes` | Public recipe list | `GET /api/recipes` (missing) |
| `/r/[id]` | One recipe: details, link, QR code, "Recreate this shot" | `GET /api/recipes/[id]` (missing) |
| `/stats` | Results by app version | `GET /api/stats` (missing) |

## Done

**`/shoot` (milestone 1).** Found by walking the flow, fixed without touching `src/vision` or `src/coach`:
- A failed camera switch left a black screen with no message. It now releases the camera and returns to the first screen with the reason.
- Two quick taps on "Read my scene" started two readings. Now one.
- A picture that cannot be read failed silently. It now says so.
- No way back from the camera step. "Back" now releases the camera.
- The rating showed "Thank you!" whatever the server answered (quality review Q4). Replaced, see below.
- A late review for an earlier shot could replace the current one (quality review Q3). Answers are now tied to the shot they belong to, for the score and the review.
- A photo delivered after the user left coaching is ignored by the screen. The engines can still fire after `stop()` (quality review Q1); that part belongs to the coach code.
- An unscored "before" picture showed a total of 0. Unmeasured values now show "–" with "not measured" for screen readers, and a line says what the score does and does not mean.
- "Scoring…" stayed up while the review was loading. It now says "Comparing your two photos…".
- Sample ideas carry a sentence saying the scene was not read. Sample review text is labelled "Sample text, not about your photos".
- Wide (landscape) ideas squeezed the card text into a thin column. The drawing is now sized by its width.
- Kept: the single mounted `<video>`, front-camera mirroring, the camera/audio/motion gesture, coaching stopped after capture, native voice fallback.

**Feedback (milestone 2).** `src/components/FeedbackForm.tsx`: 1–5 rating (native radio group), optional comment (500 characters), sending state, one request per tap, retry that keeps the rating and comment and reuses the same session code. "Saved" appears only when `api.feedback` returns `true`. Anything else says "Your feedback was not saved". When it is saved and `health.db` is false, the message says it went to temporary demo storage.

**Recipes and QR (milestone 3).**
- `RecipePublisher` on the result screen: preview of title, the shot, optional place, optional position (asked only on a tap, rounded to four decimals), a plain statement of what becomes public, then an explicit "Publish recipe". No photo is sent; a test checks the request body.
- Link and QR appear only after `api.recipes.create` returned a recipe with status `public`. A draft or hidden answer says so and shows no link. Failures say "Not published" with the reason (sign-in, missing route, not configured, rate limit, rejected, unreachable, unconfirmed) and keep the form for a retry.
- The QR code is drawn from the actual share address. A test compares it square by square with the QR library's own renderer.
- `/recipes`: list without any position. "Sort by distance from me" is optional and sorts on the phone; the position is not sent.
- `/r/[id]`: loading, could-not-load (with retry) and loaded states. "Recreate this shot" opens `ShootFlow` with the recipe; the camera is still requested from "Open the camera", then "Start coaching this shot" takes the recipe's idea into the coach. The scene is not read. The two photos are compared only when the user presses "Compare my two photos".
- Sample ideas cannot be published (see requests below).

**Results (milestone 4).** `/stats` shows only what `api.stats` returned: sessions, sessions that ended with a photo, median time, average score change, ratings, blind votes. Unmeasured values read "Not measured" and missing ratings read "No ratings yet", never 0. Unavailable, empty and temporary-storage are three different states. The page states that the match score is not a measure of photo quality, and warns when there are fewer than 30 sessions.

**Languages and mobile (milestone 5).** One language choice shared by all screens (`src/state/lang.ts`, stored on the device, follows the browser until changed). Every new string exists in English and Romanian; a test checks both exist with the same placeholders. Touch targets are at least 44 px, focus is outlined, safe-area padding on all sides, 16 px inputs.

## Checks actually run

| Check | Result | Backend |
|---|---|---|
| `npm run check` on untouched `main` | passed, 53 tests | not involved |
| `npm run check` on this branch | passed: types, lint, tests, build | not involved |
| Unit and interaction tests | 100 passed (53 existing, 47 new) | **mocked** (`vi.mock`) |
| Save-honesty check: forced the two components to claim success, reran tests | 5 tests failed as they should, then restored | mocked |
| `/shoot` with a picture, English, 375×812: camera refusal, upload, ideas, coaching, capture, result | reached a result | analyze, review, guide **real**; events missing |
| Same in Romanian at 320×568 | reached a result, no sideways overflow, no control under 44 px | analyze fell back to sample; review **real** |
| Feedback and publish against this branch as it is | "not saved" and "Not published", one request each on a double tap, no link shown | **unavailable** (404) |
| `/stats`, `/recipes`, `/r/<unknown>` as they are | unavailable / could-not-load states | **unavailable** (404) |
| Feedback saved, recipe published with link and QR, open `/r/<id>`, recreate, coach, capture, compare on request; list and results with data | worked | feedback, recipes, stats **mocked in the browser** (a temporary `fetch` stand-in, not in the repository); guide **real** |
| Landscape 812×375 and desktop 1280×800 | usable; keyboard focus outline visible | as above |

Device coverage: a desktop browser pane at phone sizes, using a drawn picture instead of the camera. **No real phone, no live camera, no deployed HTTPS address, no voice or outline-alignment check.** The pane blocks the camera, which is how the refusal path was exercised. The QR code was not scanned with a phone.

## Not verified
- Anything against real feedback, recipes or stats routes. They do not exist on `main` or on this branch.
- A person in front of a live camera, front-camera mirroring on a device, speech on iOS and Android.
- Romanian wording by a native speaker.
- The quality branch's phone protocol (`docs/quality/PHONE-TEST.md`).

## Findings for the server workstream
Observed with a real `GEMINI_API_KEY` on `localhost`:
- Default model `gemini-4-hydrogen`: `POST /api/analyze` was aborted at its 14 s limit in 2 of 2 tries and answered with sample data. `POST /api/review` answered for real in about 12 s.
- With `GEMINI_MODEL=gemini-3.5-flash-lite` in a local, uncommitted `.env.local`: analyze gave 2 confirmed real answers (3–4 s) and 2 fallbacks to sample data after the provider returned 503 "high demand"; a fifth try was not recorded.
- One real review described improvements between two identical pictures whose scores were both 0. It was not sample text, so it carried no label.
- A scene without a person scored `framing: 0` for the "before" picture, where the contract says `null` when framing could not be measured.
- The sample plan and sample ideas are English only, so they stay English in the Romanian interface.
- `npm install` adds `"hasInstallScript": true` to `package-lock.json`. Not committed here.

## Requests to the server workstream (additive, backward compatible)
1. `api.feedback`, `api.recipes.list`, `api.recipes.get` and `api.stats` return `false`, `[]` or `null` for every kind of failure. Add a way to tell "route missing or failed" from "empty" and "not found". Until then `/recipes` and `/r/[id]` say they cannot tell which it is.
2. Say whether storage is temporary in the feedback, recipe and stats answers. The interface currently infers it from `health.db === false`, which is wrong if the health route itself fails.
3. `Recipe` has no field marking sample data, so sample ideas are refused. An optional `sample` flag on `Recipe` and `RecipeCreateRequest` would let them be published with a label.
4. Routes: `POST /api/feedback`, `GET/POST /api/recipes`, `GET /api/recipes/[id]`, `GET /api/stats`, `POST /api/events`. The interface expects `POST /api/recipes` to answer with the stored `Recipe` (status `public` when it is listed) and `GET /api/recipes/[id]` to answer 404 for unknown ids.
5. `Recipe.uses` is shown as "Uses: n" when above 0; say what increments it.
6. Feedback uses its own random session code; the coach's event session id is not exposed, so the two cannot be joined.

## Integration
- Depends on: nothing new in `package.json`. Uses `qrcode` (already a dependency) and `jsdom` with `@testing-library/react` (already dev dependencies) through `// @vitest-environment jsdom` in each component test. No config change.
- Touches no file owned by another workstream. No overlap with `quality/release-readiness`.
- After the server routes land: rerun the "mocked in the browser" row against the real routes before calling recipes, feedback or results integrated.
- `APP_VERSION` is unchanged (`src/lib/brand.ts` is not an interface file). Bump it if results from before and after this change should be told apart.

## Steps to reproduce
1. `npm install`, `npm run dev`, open `/shoot`.
2. "Use a picture instead", choose any picture, "Read my scene". Without a key, or when the provider fails, ideas are labelled "Sample suggestions".
3. Pick an idea, "Take it now". On the result: choose a rating, "Send feedback" → "Your feedback was not saved" until the route exists.
4. With a real reading: "Turn this shot into a recipe" → "Publish recipe" → "Not published. The recipe service is not available on this server yet." until the route exists.
5. `/recipes`, `/r/anything`, `/stats` show their unavailable states until the routes exist.

## Known limits
- Landscape phones get the same centred 512 px column; the camera view is not widened.
- A recipe's `targetPose` is stored but the coach looks the pose up by `poseTemplateId`; an id unknown to the local library falls back to the default pose.
- Maps, sign-in, blind-vote pages, app icon and manifest are not built.
