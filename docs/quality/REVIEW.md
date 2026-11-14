# Integration quality review — 14 November 2026

Baseline inspected: `0439c6204d205f6ac2f2e721cb8deead331c69b9`. This review is of the local baseline, not the other workers' unmerged PRs. Recheck each finding after integration. No real API calls or physical-phone tests were performed in this review.

## Results actually observed

- `npm run test`: 53 tests passed in 5 files.
- `./node_modules/.bin/vitest run --config tools/quality/vitest.config.mts`: 3 regression tests failed, reproducing two lifecycle defects below. Tests express the desired behavior; they should turn green when fixed. They run separately from the baseline suite and are not skipped or marked expected-to-fail.
- No production files were changed during this audit. Existing workers retain implementation ownership.

## Q1 — cancelled sessions still deliver a photo (high priority)

Owner: Codex-2, with Claude-2 verifying the UI lifecycle.

Evidence: `src/coach/poseEngine.ts:90` and `src/coach/guideEngine.ts:73` check `stopped` before encoding, but await two frame encodes and then emit/call `onCapture` without checking cancellation again. Both executable regression cases reproduce a callback after `engine.stop()`.

User scenario: capture starts, then the user leaves coaching, pauses or chooses another idea while encoding is pending. The old session can deliver a result into the new flow. The hook forwards capture through its latest callback, increasing the risk of pairing an old shot with new UI context.

Required fix: invalidate pending work on stop/session replacement; revalidate after async boundaries before emitting, speaking, recording success or calling back. Do not emit errors from a cancelled generation either. Preserve successful capture and retry semantics. Add positive capture tests when implementing the fix.

Verification: both cases in `tools/quality/capture-lifecycle.test.ts` pass, plus successful active captures still deliver exactly once. Reproduce Back/pause during capture on the integrated app.

## Q2 — mute does not invalidate pending speech (high priority)

Owner: Codex-2.

Evidence: `src/coach/voice.ts`, `sayText()` awaits a server request then falls back to device speech without rechecking `muted` or an operation generation. `stopSpeaking()` cancels current playback, not future completion of pending work. The executable regression resolves a pending request with 503 after `setMuted(true)` and observes a new speech-synthesis call.

User scenario: delayed correction arrives after mute, pause or changing ideas; the coach speaks an obsolete instruction. This undermines the planned interruption demo.

Required fix: one audio owner with generation invalidation, cancellation of pending requests where possible, and validity checks after every await/before playback. Cover fixed clips and fallback as well as server audio. Settling/cancelling one playback must not detach the handlers of a newer playback.

Verification: `tools/quality/voice-cancellation.test.ts` passes, plus active unmuted speech still works; separately test end, new idea, interruption, delayed success and a missing clip.

## Q3 — previous review can overwrite the current result (static finding)

Owner: Claude-2.

Evidence: `src/components/ShootFlow.tsx:60` updates `beforeScore` and `review` after awaits without a result/session token. `choose()` resets them, but does not invalidate the previous promise.

Reproduction to run: delay review A, select another idea and capture B, complete review B, then release A. B must retain its own review and score. Capture the request/result IDs in a test adapter; do not log photos. Fix with result-scoped identity/abort handling and guard both score and review completion. This race was identified by inspection, not exercised in a browser in this review.

## Q4 — rating acknowledgement ignores save failure (static finding)

Owner: Claude-2; coordinate with Codex-2 for persistence.

Evidence: `src/components/ShootFlow.tsx:202` sets `rated` before sending feedback and discards `api.feedback()`'s boolean result. The result screen shows its thank-you message even on a 404/offline failure. The baseline has no feedback route.

Required fix: separate selection, submitting, saved and failed states. Show saved acknowledgement only after confirmation. If feedback stays deferred, disable submission with an honest unavailable message. Do not count UI clicks as persisted user validation.

## Q5 — result score comparison uses different evidence (static finding)

Owner: Claude-1/integrator; coordinate scoring changes with the vision owner.

Evidence: `scoreStill()` in `src/vision/score.ts` omits level (`null`); the captured photo score may include sensor level. Available weights are renormalized, so identical imagery can receive different totals solely because one side has an additional measurement. On the front camera, `readScene()` passes mirrored pixels into planning/before scoring while live tracking measures unmirrored source coordinates; test asymmetric framing before claiming comparable improvement.

Required validation: compare the same image and framing in a consistent coordinate system using the same measured components. Report unavailable measurements honestly. Do not present this heuristic as objective photographic quality or proof that AI improved a shot. The coordinate concern needs an asymmetric fixture and device verification; it is not claimed as a reproduced phone defect here.

## Integration order

1. Codex-2 resolves Q1/Q2 in its owned coach/runtime work; Claude-2 resolves Q3/Q4 in its existing UI work. Integrator evaluates Q5.
2. Integrator brings runtime/shared contracts in before the interface PR, resolves actual API differences, then runs both test commands and the repository's `npm run check`.
3. Execute `PHONE-TEST.md` against the exact deployed commit. Baseline unit success alone is not a release signal.
4. Log unresolved issues with severity and demo impact. Avoid replacing genuine failures with silent sample data during judging.

These test fixtures contain synthetic bytes only, no participant photos, credentials or private configuration. No keys or live provider access are required to run them.
