# Independent quality review

Updated: 14 November 2026. Baseline: `0439c62`. Branch: `quality/release-readiness`.

## Done

- Existing suite executed: 53/53 tests pass. `npm run typecheck` passes in the isolated quality checkout after generating Next.js route types.
- Added isolated lifecycle checks in `tools/quality/`: 3/3 currently fail, reproducing capture delivery after stop in both engines and speech resuming after mute.
- Added `docs/quality/REVIEW.md` with owner-specific findings and acceptance criteria.
- Added physical-phone acceptance/demo protocol and a five-person exploratory user-test protocol. Neither has been executed; no participant results are claimed.

## Requests to workstreams

- Codex-2: resolve Q1 capture cancellation and Q2 speech cancellation in your owned runtime/coach work. Run the separate regression suite.
- Claude-2: inspect Q3 stale review and Q4 false feedback acknowledgement while modifying the UI.
- Claude-1/integrator: evaluate Q5 consistent before/after score evidence; integrate the quality branch separately; require both test suites and phone checks after merging runtime/interface.

## Re-check after integration (14 November, evening)

Checked by the integrator on `main` after merging this branch, against the code as it is now (not the baseline).

| Finding | State | Evidence |
|---|---|---|
| Q1 — a stopped session still delivers a photo | Fixed | Both engines check again after encoding and drop the photo if the session stopped. Both lifecycle tests pass. |
| Q2 — mute does not stop pending speech | Fixed | Muting cancels the pending request and no device speech follows. The voice test passes. |
| Q3 — an old review overwrites the current result | Fixed | Each result carries a run number; answers for an earlier shot are dropped (`ShootFlow`). |
| Q4 — "thank you" even when feedback was not saved | Fixed | The feedback form has sending, saved and failed states and says "saved" only after the server confirms. |
| Q5 — before and after scored on different evidence | Partly fixed | Both totals now count only the parts both pictures measured (`comparableScores`), so the phone's tilt, known only for the captured shot, no longer lifts the "after" total. This applies to the result screen, the review request and the totals sent with feedback. Still open: mirrored front-camera coordinates for off-centre framing, which needs a phone. |

The two test files needed small mock updates for code written after the baseline: the engines read the page address for the `?round=` label, and the voice player clears its timeout. The behaviour they check is unchanged. The three tests now run in `npm run test`.

Not run yet: `PHONE-TEST.md` (no deployed build on a phone yet) and `USER-PILOT.md` (no participants yet).

## Boundaries

This lane changes only new quality tests and quality documentation. No production files, other workstream status files, secrets or local Gemini smoke scripts were edited. No deployment or live API tests were performed. Files describe genuine failures, not a claim that the project is ready.
