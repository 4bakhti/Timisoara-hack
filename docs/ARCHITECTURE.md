# Architecture

Framewise is a camera coach that runs in a phone browser. It reads a scene, suggests three shots, coaches the photographer and the person being photographed until the shot matches, takes the photo, and shows before and after.

The final photo is always a real capture. The app never edits or generates it.

## Flow

```
Camera ──photo──> /api/analyze ──> ShotPlan (scene + 3 ideas)
                                        │ user picks one idea
                                        ▼
Coach screen: live video + overlay canvas
   useCoachSession(idea) ── tracks the body on the phone
                         ── compares pose and framing with the idea
                         ── says ONE correction at a time (voice + on screen)
                         ── captures when everything matches
                                        │
                                        ▼
Result: before / after, scores, /api/review (what improved + one lesson)
        save · share · turn into a recipe others can recreate
```

## Three workstreams

Each one owns its folders. Edit only inside your own; ask through the status board (below) for changes elsewhere.

| Workstream | Owns | Does |
|---|---|---|
| Vision and coach | `src/vision/`, `src/coach/`, `src/app/lab/`, `src/lib/contracts.ts`, `src/lib/fixtures.ts`, root config, `docs/ARCHITECTURE.md` | Body tracking on the phone, pose matching, shot score, correction rules, voice playback, the `useCoachSession` hook |
| Server | `src/server/`, `src/app/api/`, `src/lib/api.ts`, `scripts/`, `db/`, deployment files, `docs/SETUP.md` | Gemini (planning, review, guidance, sketch), ElevenLabs, database, sign-in, recipes, numbers for the dashboard |
| Interface | `src/app/` (except `api/` and `lab/`), `src/components/`, `src/state/`, `src/i18n/`, `public/` | Screens, overlays around the camera, design, languages, sharing, recipes and dashboard pages |

Shared and append-only: `package.json` (dependencies), `.env.example`, `docs/CREDITS.md`.

## The contract

`src/lib/contracts.ts` holds every type that crosses a workstream boundary, as zod schemas: the shot plan, scores, and the request and response of every API route.

- Additive changes only: add optional fields, never rename or remove.
- Coordinates are normalised 0–1, origin top-left.
- "Left" and "right" on a person mean the person's own left and right.

`src/lib/fixtures.ts` has sample data that satisfies the contracts. `src/lib/api.ts` is the only place screens call the server from; it validates responses and falls back to sample data (flagged `mock: true`) when a route is missing or fails.

## Using the coach from a screen

```tsx
"use client";
import { useCoachSession, unlockAudio } from "@/coach";

const session = useCoachSession({
  video,            // the playing <video> element (state, not a ref)
  overlay,          // a <canvas> covering the video; guides are drawn here
  idea,             // the ShotIdea the user picked
  mode,             // "friend" | "solo"
  lang,             // "en" | "ro"
  mirrored,         // true for the front camera
  onCapture: (shot) => { /* shot.blob, shot.dataUrl, shot.score */ },
});

session.phase;        // loading | searching | coaching | holding | countdown | captured | error
session.score;        // 0–100
session.instruction;  // { id, text, to } or null — the one thing to fix now
session.countdown;    // 3, 2, 1 or null
session.captureNow(); // shutter button
session.restart();    // coach the same idea again
```

- Call `unlockAudio()` inside a tap handler before the first session; phones block sound otherwise.
- The video is expected to use `object-fit: cover`. If it is mirrored with CSS, mirror the canvas the same way. No text is drawn on the canvas.
- In friend mode, show instructions with `to: "photographer"` on screen; lines for the subject are spoken.
- `session.simulated` is true while the scripted tracker is running instead of the real one.

Other helpers: `grabFrame(video, { maxSide })` for stills, `POSE_TEMPLATES` / `getPoseTemplate(id)` for the pose library, `drawGuides` for custom overlays. All from `@/vision`.

## API routes

All bodies and responses are defined in `src/lib/contracts.ts`.

| Route | Purpose |
|---|---|
| `GET /api/health` | Which optional services are configured |
| `POST /api/analyze` | Photo in, `ShotPlan` out |
| `POST /api/guide` | One correction for a scene without a trackable person |
| `POST /api/review` | Before and after in, improvements and a lesson out |
| `POST /api/preview` | AI sketch of the proposed shot (optional) |
| `POST /api/speak` | Text in, speech audio out |
| `POST /api/events`, `POST /api/feedback`, `GET/POST /api/votes`, `GET /api/stats` | Numbers for user testing |
| `GET/POST /api/recipes`, `GET /api/recipes/[id]` | Shareable shot recipes |

Every route must work without its external service: when a key is missing it answers with sample data flagged `mock: true`, or with a `501` and `{ "error": "not_configured" }` where no sample makes sense.

## Conventions

- TypeScript strict. No `any`.
- `npm run check` (types, lint, tests, production build) must pass before every push to `main`.
- Small commits. Never rewrite pushed history.
- No secrets in the repository. Keys go in `.env.local`; names are listed in `.env.example`.
- Only original assets. No stock photos or third-party pose data.
- Every library, API and model used is listed in `docs/CREDITS.md`.
- The product name is read from `src/lib/brand.ts`, never hard-coded.
- The coach comments on pose, light and framing. Never on bodies or looks.
- Nothing leaves the phone until the user asks for a scene to be read. Nothing is stored unless the user saves or publishes it.

## Status board

`docs/status/vision.md`, `server.md` and `interface.md`. Each workstream keeps its own file current: what is done, what is in progress, what it needs from the team (keys, accounts, decisions), requests to other workstreams, and notes about new or changed exports. Read the other two files whenever you pull.

## Running it

```bash
npm install
npm run dev      # http://localhost:3000
npm run check    # types, lint, tests, build
```

Camera access needs HTTPS or `localhost`.
