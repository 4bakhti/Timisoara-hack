# Server status

Updated 14 November 2026 · `codex-2/backend-extras`

## Handoff

The branch contains the Stage 1 correction player and TTS route, plus the Stage 2 ElevenAgents runtime and its four client tools. Both stages are implemented for interface integration. The complete live conversation has not been demonstrated. The main shooting screen still needs the interface adapter, and the provider needs a configured agent and credentials.

GitHub reported HTTP 403 and read-only access for the current identity. No PR is open. The branch can be published by the integrator from the accompanying Git bundle. The first commit publishes the bridge types. The later commits supply the runtime and keep local speech active across connection loss. Integrate these before merging the interface branch.

## Interface imports and wiring

Import `useVoiceDirector`, `VoiceActions`, `VoiceContext`, `VoiceDirector`, `VoiceDirectorState`, `VoiceLine` and `VoiceRejection` from `@/voice`. Import `useCoachSession`, `unlockAudio` and `CoachSpeech` from `@/coach`.

- `useVoiceDirector(actions)` returns `{ director, state, speech }`. Pass its stable `speech` into `useCoachSession({ …, speech })`. Pass the existing voice switch as `voice` to the coach and to `director.setOutputEnabled(voice)` so it governs both kinds of output. The microphone has its own `director.setMicMuted(muted)` control. Avoid a second playback call when rendering the instruction.
- Call `unlockAudio()` and `director.start(lang)` in the explicit start gesture after stating that mic audio goes to ElevenLabs. Use the same gesture and existing `<video>` for camera permission. The hook checks configuration on mount. `state.configured` reports settings availability. Only `state.status` reports the current connection. Show a localized unavailable reason and keep the touch controls usable. The agent language is chosen at start. Restart it explicitly after a language change.
- Call `director.updateContext(snapshot)` as state changes. Refresh `updatedAt: Date.now()` about every two seconds. Identical summaries are deduplicated and the timestamp stays in the browser. Supply the offered ideas' IDs and titles, actual selected ID, real scene facts, real tracking presence, coach phase, current instruction and pause state. Use `scene: null` for sample data. Set `cameraReady` when a live video track has a usable frame. Update the snapshot after touch or voice actions so a later command uses the new state. No images or landmarks go to ElevenLabs.
- `selectIdea(ideaId, signal)` uses the same UI path as the idea card and returns `{ ok: true, outcome: "idea_selected" }` after the change is accepted. `setCoachingPaused(paused, signal)` controls the coach's `paused` option and returns `paused` or `resumed`. Before switching ideas or pausing, call `session.cancelPendingCapture()` synchronously to stop the old countdown and encoding callback. Use it for the touch equivalents too. Recheck the abort signal and phase/idea before deferred actions commit.
- `requestCapture(signal)` should return `session.requestCapture(signal)`. It uses the existing immediate manual shutter after checking camera readiness. Holding or countdown already in progress keeps its automatic capture. Success means `onCapture` delivered a shot. Use `session.captureNow()` for the touch shutter. On result entry call `director.end({ afterCapture: true })` so the tool result can be written before the SDK closes. Call `director.end()` for other departures. The hook also closes the SDK session on unmount or page exit.
- The runtime handles `repeat_instruction()` by supplying the latest correction to the agent for a spoken repeat or clarification. It expires stale context, ignores unsolicited tools without a recent microphone turn, shares results for repeated tool IDs and serializes actions that change UI state. Rejected capture requests never invoke the shutter.

## Audio and server

The coach's own words reach the speaker through prepared clips, ElevenLabs TTS, or device speech. A context update alone is silent. The engine's explicit speech event plays the correction without asking the agent to invent or reword it. During a user turn the director cancels or defers local corrections. During a local countdown it silences agent output while the microphone stays available for a pause command. The coach owns the countdown schedule and final capture. The agent runtime uses the pinned `@elevenlabs/client` SDK.

`POST /api/speak` returns MP3 and caches fixed phrases in a bounded in-memory cache. Generated clips require the workspace's TTS key and voices. `POST /api/voice/session` issues bounded, single-use access and keeps the permanent key server-side. `GET /api/health` adds optional `voiceConversation` separately from TTS availability. See [Setup](../SETUP.md) for config, tools, privacy settings and the demo procedure.

## Verification

- `npm run check` passed on Node 22.22.2, including typecheck, lint, 76 tests and production build.
- `npm run voice:check` validated the checked-in client tool schemas. The clip generator reported missing credentials. A production localhost smoke returned 200 for `/shoot` and `/api/health`, with 501 `not_configured` for both voice POST endpoints.
- Mock tests exercised Romanian TTS parameters, fixed phrase caching, session issuance limits, invalid and repeated requests, unavailable camera, stale actions, cancellation during countdown, capture result delivery, fallback and reconnect. Headless Chromium exercised the official browser SDK with mocked WebSocket events and emulated camera/mic input. Romanian initialization, camera/mic coexistence, tool replay and microphone cleanup passed.
- Still to verify with credentials and after interface integration: Gemini scene-specific results, English and Romanian ElevenLabs audio and pronunciation, generated clips, Agents entitlement, two-way spoken actions, agent interruptions and provider retention configuration. Still to verify on physical phones: audio unlock, speaker echo, venue noise, camera/mic coexistence and reconnect. No live provider or deployment was used for these checks.
