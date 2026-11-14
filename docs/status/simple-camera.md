# Simplified camera — 15 November 2026

The primary routes `/` and `/shoot` now open a camera directly. The user asked to remove the three suggestions, explicit analysis step and explanatory UI. They are replaced with one automatic scene-aware pose, a subtle outline and one movement arrow. Shutter capture is manual, with thumbnail, save/share preview, camera switch, optional grid and optional speech. `/demo` uses the same UI with a clearly labelled sample target.

Research references: [YesPose](https://apps.apple.com/us/app/yespose-ai-pose-cam-coach/id6811747876), [Pip Pose](https://apps.apple.com/us/app/pip-pose/id6780216645). These informed the camera-first interaction pattern; implementation and assets are ours. No claim of an exact replica.

## Validation

- Typecheck and lint pass.
- 296 tests pass; 10 existing tests skipped.
- Webpack production build passes (`npx next build --webpack`), with the existing MediaPipe dynamic-dependency warning.
- The default Turbopack build cannot bind its CSS compiler's local port in this environment, including the elevated retry; no application compilation error was demonstrated by that failure.
- A real POST to `/api/pose` using Google's public MediaPipe test image returned one valid pose in 2.7 seconds.
- Browser checks at 390 × 844 and 844 × 390: outline and arrow on a real test photo, manual shutter, thumbnail, clean photo preview and return to camera. The visual overlay check used the labelled demo's fixed target; the real Gemini endpoint was tested separately.
- Regression tests cover stale AI response cancellation, permission denial, late camera cleanup, switching, direct capture without AI, provider failure, manual-only coaching, and arrow direction.

## Limits

Physical iPhone/Android camera performance, browser native sharing, spoken audio and deployment were not verified in this change. The main camera currently chooses from the existing pose-template catalog; it does not generate arbitrary new poses. The legacy recipe recreation flow, statistics and backend remain available at their existing routes. Direct shutter captures bypass legacy result scoring and do not yet increment its capture-outcome statistics.

Photos are automatically sent for pose selection while the person icon is enabled. No image is retained by the new endpoint. No credentials or personal emails are included in this change.
