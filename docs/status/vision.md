# Vision and coach: status

Updated: Fri 13 Nov, 22:20

## Done
- Project base: Next.js app, shared contracts, sample data, typed API client, `npm run check`.
- Pose library: 14 templates built from angles (`src/vision/poses/`), visible at `/lab`.
- Coach phrases in English and Romanian (`src/coach/phrases.ts`).
- **Real body tracking on the device** (MediaPipe Pose Landmarker), smoothed between frames.
- **Pose matching**: compares joint angles, so distance and position do not matter; accepts the mirror image of one-sided poses; returns the most useful correction.
- **Framing check**: where the person is and how large, against the idea's target box; tells the photographer (friend mode) or the person (solo mode) what to change.
- **Decision rules**: framing before pose, one correction at a time, no flicker, spoken lines paced and not repeated, then hold, 3-2-1, capture; a clear drop cancels the countdown.
- **Shot score** with parts (pose, framing, crop, light, level); `scoreStill()` scores the "before" picture with the same function.
- Phone level from the motion sensor; level line drawn in friend mode.
- Guided framing for scenes without a person, through `/api/guide`.
- Voice player: pre-generated clips first, the phone's own voice as fallback.
- Usage numbers sent to `/api/events` at the end of each session (no images, no personal data).
- Test pages: `/lab/live` (live camera), `/lab/try` (single picture).
- 43 unit tests on geometry, matching, decision rules and scoring.

Checked in a desktop browser on a public-domain portrait: the person was found, "Relaxed stand" scored 99, "Arms up" scored 47, the coach asked the person to come closer, manual capture and `scoreStill` returned the same score.

## Now
- Waiting for a deployed HTTPS address to test on real phones.

## Next
- Tune tolerances and timing from phone tests.
- Head direction ("look at the camera") if time allows.

## Needs from the team
- **Deploy to an HTTPS address** (for example import the repository into Vercel). The camera does not work without HTTPS, so nothing can be tested on a phone until then. Then open `/lab/live` on an iPhone and an Android phone and note the frame rate shown at the top right, whether the voice speaks, and whether the outline lines up.
- A Romanian speaker to read through the coach phrases in `src/coach/phrases.ts`.
- Optional, for venue Wi-Fi: put the tracking model in `public/mediapipe/pose_landmarker_lite.task` so the app serves it itself. Until then the browser fetches it from Google's storage on first use. The address is in `src/vision/tracker.ts`.

## Requests to other workstreams
- Server: the voice script should read `PHRASES` from `src/coach/phrases.ts` and write `public/voice/<lang>/<id>.mp3`. Four phrases were added (`hand_in_left`, `hand_in_right`, `hand_out_left`, `hand_out_right`) and `cam_level` replaced the two directional level lines.
- Interface: see "Notes" below.

## Notes for other workstreams
- `useCoachSession` now runs the **real tracker by default**. Its interface did not change. Read the updated "Using the coach from a screen" section in `docs/ARCHITECTURE.md`.
- New option `still`: a picture to coach on when there is no camera. New: `engine: "sim"` is now the only way to get the scripted session.
- `instruction.id` can be `"custom"` (free text from the server for scenes without a person). Always render `instruction.text`.
- `ShotScore.framing` can now be `null` (contracts). Show unmeasured parts as "not measured".
- Call `requestMotionPermission()` from `@/vision` in the same tap as `unlockAudio()`.
- Pass `paused: true` once a shot is captured, or the session keeps the camera busy.
- The tracking runtime is copied into `public/mediapipe/wasm` on `npm install` (git-ignored). Do not delete that folder.
