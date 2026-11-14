# Integration: status

Updated: Sat 14 Nov, 23:50. `main` at the commit that adds this file.

## Merged into `main`, in order

| Step | What | Commit |
|---|---|---|
| 1 | `codex-2/backend-extras`: ElevenLabs speech route, voice director, coach speech hooks | `2cc603a` |
| 2 | Gemini fix found by live testing (fast model + overload fallback; honest review) | `fe57dd2`, `1331a82` |
| 3 | `claude-2/interface-extras` (PR #2): feedback form, recipes with QR, `/recipes`, `/r/[id]`, `/stats`, home page, shoot fixes | `e8d8d3e` |
| 4 | `codex-2/storage-recipes`: memory or PostgreSQL storage, migrations, `/api/events`, `/api/feedback`, `/api/stats`, recipes (create, list, get, use, hide) | `088f8f8` + `5204a11` |
| 5 | `claude-2/interface-part2`, parts 1–3: judges' QR on desktop, app icon and manifest, `?round=` label, `/demo`, voice conversation in `/shoot` | `3c1a7ae` |
| 6 | Integrator fixes: Romanian sample ideas, "not measured" scores for ideas without a person, round label in the coach's usage numbers | `e13f452`, `8e73aca`, `7b8753b` |
| 7 | Vultr deploy kit (`deploy/vultr/`, `docs/DEPLOY-VULTR.md`), README for judges, Living Lab log template | `4a312bf`, `10cf625` |
| 8 | Vision A, B and C (see below) | `03f5012`, `a75eac9`, `53f00d3` |
| 9 | `claude-2/interface-part2`, final part: storage routes wired (no recipe at this link vs service not answering), a recipe use counted when someone starts recreating it, before/after totals sent with feedback, the storage label from the server, recipes from sample ideas published with a label, camera filling wide and landscape screens | `429baf7` |
| 10 | Integrator fixes after testing the merged app: 3D forward lean measured but not judged yet; device voice straight away for two minutes after the server voice fails | `754ce9b` |
| 11 | `quality/release-readiness` (the corrected no-reply tip): quality review Q1–Q5, phone acceptance protocol, user pilot protocol, lifecycle regression checks | `e41711c` |
| 12 | Quality follow-up: before and after totals over the same measured parts (Q5); the lifecycle checks run in `npm run test`; re-check of Q1–Q5 in `docs/status/quality.md` | `f5060a4`, `98a1d99` |
| 13 | Tiger Data connected: `sslmode=require` gets its libpq meaning (Tiger's certificates come from Timescale's own CA, so every connection had failed); credential downloads ignored by git; honest empty-recipes wording | `00a829b`, `fcbde5a` |
| 14 | TimescaleDB continuous aggregate `coach_activity_hourly` (migration 0003, real-time, refreshed every 15 minutes) behind a new hour-by-hour chart on `/stats`; memory storage computes the same series | `5d07810` |
| 15 | From the team's phone test: the target outline follows the person (anchored on the torso); framing scores 100 when the person fits the frame and only asks for clear changes; upper-body and sitting shots are coached with the torso estimated from the shoulders. Logged in `docs/LIVING_LAB.md` | `7e4384d` |

**Do not merge `codex-2/storage-recipes` again.** Its last commit (`8969107`) was signed with a personal e-mail address. Its changes are already in `main`, re-committed unchanged as `5204a11` under the GitHub no-reply address. Merging the branch would add nothing but that address to the history.

## Vision upgrade (Sat 14 Nov afternoon)

| Part | State |
|---|---|
| Shared hookups (`src/vision/types.ts`, wiring in `poseEngine`, `/lab/live` readout) | Merged `bdc5826`, `17f08cd` |
| **A — tracker and drawing** (`vision/a-tracker-outline`) | **Merged `03f5012`** |
| **B — AI pose previews** (`vision/b-ai-previews`) | **Merged `a75eac9`** |
| **C — face and 3D coaching** (`vision/c-face-3d`) | **Merged `53f00d3`** |

What A changed:
- `createStillTracker({ withMask: true })` returns `pose.mask` (person outline) and `pose.world` (3D points). Live tracking returns `pose.world` every frame and `pose.mask` every third frame.
- Masks come from MediaPipe's selfie segmenter on the CPU. Masks read back from the GPU came back empty in testing.
- Phones start on the lite pose model and upgrade to full when detection stays under 18 ms a frame (back to lite above 40 ms). `/lab/live` shows which one runs.
- Drawing: the target is a body shape with a dashed outline (the preview's real outline when `target.silhouette` is set); the live person gets a glowing outline; the corrected limb turns red; everything turns green only while the coach holds or counts down.

What B added:
- `POST /api/preview`: the scene photo and an idea in, an AI preview of the same person in that pose out (default model `gemini-3.1-flash-lite-image`; `GEMINI_IMAGE_MODEL` overrides). It keeps the photo's aspect ratio and pauses previews for ten minutes when the account has no image quota.
- Idea cards show the three previews ("AI preview, not your photo") after a real reading; choosing one coaches toward that preview's pose, box and outline. The "before" picture is scored against the same target.
- **Not verified: a real generated preview.** The current key answered "429 quota exceeded" for both image models (text models work). Image generation needs billing or image quota on the key's Google account.

What C added:
- Face tracking on the device (MediaPipe Face Landmarker, GPU with CPU fallback; the coach carries on without it if it cannot load): eyes open, smile, head turn and head tilt. It runs every other frame, only near a match.
- Face rules in the coach: the hold and countdown pause while the eyes are closed ("Open your eyes when you're ready") and carry on when they open; portrait and dramatic ideas ask to look at the camera or to lift or lower the chin; playful and candid ideas offer one "A little smile, if you like".
- 3D body turn replaces the flat shoulder-width estimate for catalog poses (the three-quarter pose wants 45°, either side).
- 3D forward lean is measured and shown on `/lab/live`, but **not judged yet** (integrator change, step 10): people standing upright read 8–17° toward the camera, and the reading moves with the phone's tilt, so the coach would have told them to straighten up. `JUDGE_FORWARD_LEAN` in `src/vision/match.ts` turns it on after calibration on phones.

## Checks

`npm run check` passes on `main`: types, lint, 276 tests including the quality lifecycle checks (268 pass; 8 skip: 7 PostgreSQL tests without `TEST_DATABASE_URL`, and the forward-lean test, which runs when that check is turned on), and the production build.

Verified on localhost after the merges (desktop browser; test photos fed to `/lab/live` as the camera):

| What | Result |
|---|---|
| Tracking and coaching | 17–20 fps on lite and full; a woman with a hand on her hip is told "Straighten your left arm a little." (score 88) |
| Face readings (half-body photo) | Eyes 0.81–0.90, smile 0, head turn −28°, and +31° on the mirrored photo (the sign flips as it should), head tilt −9° to −12° on both |
| 3D body turn | 7° for a person facing the camera; −14° to −21° and +31° to +35° for the half-body photo and its mirror |
| Face size limit | The face is found in half-body framing; in a full-length photo it is too small, so no face cues appear (nothing breaks) |
| Server voice | At 17:30 ElevenLabs refused with a payment problem; the device voice took over, and after step 10 the app asked the server once, then not again for two minutes. At 20:00, after the account was fixed, `/api/speak` answered with real audio in English (1.3 s) and Romanian (0.2 s) |
| Tiger Data (21:00) | Service in AWS Frankfurt (0.5 CPU, TimescaleDB 2.32). Both migrations applied; `coach_events` is a hypertable on `recorded_at` (7-day chunks). The 7 PostgreSQL store tests pass against it in a throwaway schema, which was removed afterwards. `/api/recipes` and `/api/stats` answer 200 (about 0.05 s warm), an unknown recipe answers 404, and the pages show the real empty states. One connection attempt timed out once and the retry worked |
| Continuous aggregate (22:30) | Migration 0003 applied on Tiger Data: `coach_activity_hourly` exists with real-time aggregation and refresh job 1005 (every 15 minutes). In a throwaway schema, rows inserted a moment earlier were already in the aggregate. `/api/stats` answers `activity.source: "continuous_aggregate"` (0.07–0.13 s warm). The chart was checked in the browser at desktop and phone width with stand-in numbers given to the page only (the real database is still empty): readout, column selection and table view work |
| First start on this network | The pose model downloads from Google in 28 s (lite) or 41 s (full); later starts use the browser cache |

Earlier checks: Gemini with the real key (scene reading 4–7 s in English and Romanian, honest review, guidance 1–2 s); storage routes in memory (idempotent events, feedback, measured-only stats, recipes with uses); the production server (judges' QR, `/shoot`, `/demo`).

Not verified: a real phone or live camera, a deployed HTTPS address, a real AI preview, and the Vultr scripts on a real server.

## Next

- The team: put the same `DATABASE_URL` on the deploy server (the tables already exist); add image quota to the Gemini key for previews.
- Before judging, open the app once on each demo phone so the tracking models are cached (the first download is slow on a busy network), or serve the model files from `public/mediapipe/` on the server.
- Phone tests: run `docs/quality/PHONE-TEST.md` on the deployed build, plus on `/lab/live` the face cues near a match, the closed-eyes pause, the three-quarter turn, and a forward-lean calibration (stand straight, lean in, note the readings).
- Still open from the quality review: Q5's mirrored front-camera coordinates for off-centre framing (needs a phone).
