# Server status

Updated 14 November 2026 · `codex-2/backend-extras`

## Voice bridge for the interface

Import `VoiceActions`, `VoiceContext`, `VoiceDirector`, `VoiceDirectorState` and `VoiceLine` from `@/voice`. This commit publishes the types. The upcoming runtime commit adds `useVoiceDirector(actions)` to the same entry point. It returns `{ director, state, speech }`, where `speech` is a stable adapter to pass as `useCoachSession({ …, speech })`. Leave `voice` tied to the existing output switch. The director owns correction playback, agent output and countdown audio together. Avoid a second speech call when rendering the instruction.

- Use `director.start(lang)` in the explicit start gesture after explaining that the mic sends audio to ElevenLabs. Keep the camera on its existing video element. Use `director.end()` when the user leaves the shooting flow or reaches the result. The runtime cleans up on unmount and document exit as well. A language change takes effect in the next conversation.
- Send `director.updateContext(snapshot)` when the flow, ideas, selected idea, pause state, camera readiness, coach instruction or person tracking changes. Refresh `updatedAt: Date.now()` about every two seconds while the flow is active so spoken actions can reject stale UI state. The runtime excludes timestamps from change detection, so the refresh does not send extra provider events. Pass `scene: null` for sample suggestions, and pass only the offered idea IDs and titles. Set `cameraReady` only when a live video frame is available. No images or tracker points go to the voice agent.
- `selectIdea(ideaId, signal)` applies an offered idea using the same UI path as tapping its card. `setCoachingPaused(paused, signal)` updates actual coach state. Before switching the idea or pausing, call the upcoming `session.cancelPendingCapture()` synchronously so any in-progress countdown stops before React commits the new options. Resume via the existing `paused` option. Return the structured result after accepting the state change. Recheck `signal.aborted` and the current idea and phase before a deferred action commits.
- `requestCapture(signal)` calls the upcoming `session.requestCapture(signal)`. The voice request uses the existing manual shutter, which takes a photo immediately. An automatic countdown already running remains in charge. Return `captured` only after the engine delivers the shot through `onCapture`. Use `session.captureNow()` for the existing touch shutter.
- The runtime implements `repeat_instruction()` directly with the latest correction, checks IDs and phase for all four tools, and waits for callback results. The connection status and configuration are separate. User and agent transcript lines are optional and ephemeral.

Integrate the bridge and server runtime before merging the interface. The runtime and the interface mounting are separate commits/PRs.

## Verification

- The current Gemini analyze, guide and review routes validate provider output and flag sample responses. The default Gemini model IDs are listed in the [Gemini model catalog](https://ai.google.dev/gemini-api/docs/models).
- There is no Gemini or ElevenLabs key and no ElevenLabs agent ID configured in this clone. Live scene analysis, speech generation and conversation still need credentials. The existing sample flow can remain usable while the voice integration is developed.
