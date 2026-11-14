# Interface: status

Updated: Sat 14 Nov, 05:45 — work in progress, handoff not finished (see "Not done").

Branch: `claude-2/interface-extras` (local commit only; **not pushed, no PR yet**).

## Done on this branch
- `/shoot`: fixes only, same architecture and tracker. A failed camera switch returns to the first screen with the reason; double taps on "Read my scene" start one reading; unreadable pictures show a message; Back from the camera step releases the camera; the picture's object URL is released; unmeasured values show as "–" with "not measured" for screen readers, never 0; sample ideas and sample review text are labelled more plainly.
- Feedback (`FeedbackForm`): rating, optional comment, sending state, one request per tap, retry with the same session code. "Saved" appears only when `api.feedback` returns true; otherwise "not saved".
- Recipes: `RecipePublisher` (preview, explicit publish, optional place and position, no photo sent), `/recipes` list, `/r/[id]` detail with link + QR, recreate through `ShootFlow` with a `recipe` prop (camera still starts from its own button; photos are compared only on request).
- `/stats` (`StatsView`): separate unavailable, empty and temporary-storage states; unmeasured values shown as "Not measured".
- Shared language choice (`src/state/lang.ts`), bilingual home page, 44 px touch targets, visible focus outline.

## Checks actually run
- Baseline on untouched `main`: `npm run check` passed (53 tests).
- This branch: `npx vitest run` → 96 passed (53 old + 43 new). `typecheck` and `lint` passed before the test files were added. **A full `npm run check` was started but its result was not read before this file was written.**
- Browser (desktop pane at 375×812, picture upload, not a phone): camera refusal message; upload → ideas → coach → result; feedback against the missing route says "not saved" (one request on a double tap); publish against the missing route says "Not published" with no link (one request); `/stats`, `/recipes`, `/r/<unknown>` show their unavailable states. Backend for feedback, recipes and stats: **unavailable (404)**.

## Not done
- Browser walk of the success paths (published link, QR, recreate), Romanian pass, landscape/desktop pass.
- No real phone, no deployed address, no live camera, voice or outline check.
- Push and PR.

## Findings for the server workstream
- With a real `GEMINI_API_KEY`, `POST /api/analyze` on the default `gemini-4-hydrogen` was aborted at its 14 s limit in 2 of 2 tries and fell back to sample data. `POST /api/review` answered for real in about 12 s. With `GEMINI_MODEL=gemini-3.5-flash-lite` set locally, analyze answered for real in about 4 s. Raise the limit or change the default model.
- `npm install` adds `"hasInstallScript": true` to `package-lock.json`; not committed here.

## Requests to the server workstream (additive)
- `api.feedback`, `api.recipes.list`, `api.recipes.get` and `api.stats` hide why they failed. Let callers tell "missing or failed" from "empty" or "not found".
- Say whether storage is temporary in the feedback, recipe and stats answers. Until then the interface infers it from `health.db === false`.
- `Recipe` has no field for sample data, so the interface refuses to publish sample ideas.
- Routes still needed: `/api/feedback`, `/api/recipes`, `/api/recipes/[id]`, `/api/stats`, `/api/events`.

## Notes
- `APP_VERSION` was not changed (`src/lib/brand.ts` is not an interface file); bump it if results should be compared across this change.
- Component tests use `// @vitest-environment jsdom` per file; no config or dependency change.
