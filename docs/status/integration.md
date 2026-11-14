# Integration: status

Updated: Sat 14 Nov, 14:45. `main` at the commit that adds this file.

## Merged into `main`, in order

| Step | What | Commit |
|---|---|---|
| 1 | `codex-2/backend-extras`: ElevenLabs speech route, voice director, coach speech hooks | `2cc603a` |
| 2 | Gemini fix found by live testing (fast model + overload fallback; honest review) | `fe57dd2`, `1331a82` |
| 3 | `claude-2/interface-extras` (PR #2): feedback form, recipes with QR, `/recipes`, `/r/[id]`, `/stats`, home page, shoot fixes | `e8d8d3e` |
| 4 | `codex-2/storage-recipes`: memory or PostgreSQL storage, migrations, `/api/events`, `/api/feedback`, `/api/stats`, recipes (create, list, get, use, hide) | `088f8f8` + `5204a11` |
| 5 | `claude-2/interface-part2`, parts 1–3: judges' QR on desktop, app icon and manifest, `?round=` label, `/demo`, voice conversation in `/shoot` | `3c1a7ae` |
| 6 | Integrator fixes: Romanian sample ideas, "not measured" scores for ideas without a person, round label in the coach's usage numbers | `e13f452`, `8e73aca`, `7b8753b` |
| 7 | Vultr deploy kit (`deploy/vultr/`, `docs/DEPLOY-VULTR.md`), README for judges, Living Lab log template | `4a312bf`, `10cf625`, this commit |

**Do not merge `codex-2/storage-recipes` again.** Its last commit (`8969107`) was signed with a personal e-mail address. Its changes are already in `main`, re-committed unchanged as `5204a11` under the GitHub no-reply address. Merging the branch would add nothing but that address to the history.

## Vision upgrade (Sat 14 Nov afternoon)

| Part | State |
|---|---|
| Shared hookups (`src/vision/types.ts`, wiring in `poseEngine`, `/lab/live` readout) | Merged `bdc5826`, `17f08cd` |
| **A — tracker and drawing** (`vision/a-tracker-outline`) | **Merged `03f5012`** |
| B — AI pose previews (`vision/b-ai-previews`) | In progress |
| C — face and 3D coaching (`vision/c-face-3d`) | In progress |

What A changed, for B and C:
- `createStillTracker({ withMask: true })` now returns `pose.mask` (person outline) and `pose.world` (3D points). B: use it for preview targets.
- Live tracking returns `pose.world` every frame and `pose.mask` every third frame. C: `matchAll` and `bodyAngles3d` now receive real 3D points.
- Masks come from MediaPipe's selfie segmenter on the CPU. Masks read back from the GPU came back empty in testing.
- Phones start on the lite pose model and upgrade to full when detection stays under 18 ms a frame (back to lite above 40 ms). `/lab/live` shows which one runs.
- Drawing: the target is a body shape with a dashed outline (the preview's real outline when `target.silhouette` is set); the live person gets a glowing outline; the corrected limb turns red; everything turns green only while the coach holds or counts down.
- Checked in a desktop browser on a single picture (outline, figure, colours). **Not yet checked on a real phone or live camera.**

## Checks

`npm run check` passes on `main`: types, lint, 179 tests (7 PostgreSQL tests skip without `TEST_DATABASE_URL`), and the default production build.

Verified live on localhost:

| What | Result |
|---|---|
| Gemini (real key) | Scene reading 4–7 s with ideas specific to the photo, in English and Romanian; review honest with identical photos; guidance 1–2 s |
| Storage routes (memory) | Events are idempotent (two submissions, one session); feedback confirmed and malformed input rejected; stats show only measured values (median 1.5 s, gain +22, rating 4, zero votes); recipe created public with a rounded location, loaded by id, listed; one use counted and a repeat refused; unknown id answers 404; hide answers 501 without a configured token |
| Production server | Home page shows the judges' QR on a wide screen; `/shoot` hides the voice toggle while no agent is configured; `/demo` reaches a labelled result with recipes and feedback disabled |

Not verified: a real phone, a deployed HTTPS address, ElevenLabs (no keys), a real PostgreSQL database, and the Vultr scripts on a real server (syntax and generated config checked only).

## Next

- **Claude-2, part 5 is unblocked**: Codex-2's routes are on `main`. Merge `origin/main` into `claude-2/interface-part2`, then wire `recipes.load` / `listResult` / `statsResult`, `recipes.use`, `beforeTotal` / `afterTotal` and the storage label, and rerun the recipe flow against the real routes.
- The team: deploy (Vercel or Vultr), add keys, test on phones, run user-testing rounds.
