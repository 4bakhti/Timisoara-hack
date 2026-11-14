# Server Part 2: storage, feedback, stats and recipes

Updated: 14 November 2026. Branch: `codex-2/storage-recipes`, continuing the original `b0cbd66` and `b3350f7` commits from main `27fbd2c`. This is a backend handoff; the new client helpers are not yet wired into screens. No deployment or merge performed.

## Implemented

- One process-wide store, selected at startup: bounded demo memory when `DATABASE_URL` is absent, PostgreSQL otherwise. Configured database errors return `503 storage_unavailable`; no silent fallback. SQL is parameterized; pool max 3; the connection URL's TLS settings are preserved.
- Plain SQL migrations and `npm run db:migrate`, with transaction/advisory lock and an applied-file ledger. Optional migration 0002 converts events only with an already installed/supported TimescaleDB extension; otherwise the regular table remains intact.
- `POST /api/events`: max 64 KiB / 600 events, validated metadata/samples, one session and sample set per session ID even on retries; threshold imported from `READY_SCORE`.
- `POST /api/feedback`: confirmed writes/upserts, 1–5 rating, cleaned optional comment, optional before/after totals and round. Response includes storage mode.
- `GET /api/stats?round=`: actual stored counts, median threshold time in seconds, measured score gains and ratings, null for missing measurements, zero blind votes, storage mode and no-store responses.
- Guest-public recipes: create/list/detail, validated and cleaned title/place, rounded optional coordinates, sample flag, 16-character cryptographic base62 IDs and at most 50 public results. No photos are stored. GET does not count a use.
- Explicit `POST /api/recipes/[id]/use`: per-address/recipe ten-minute process-local limit. `POST /api/recipes/[id]/hide`: server-only admin token with constant-time hash comparison; hidden/draft recipes are excluded from public reads.
- Additive `api.recipes.use/load/listResult` and `api.statsResult(round?)`, preserving existing client methods and return types. `Health.storage` is optional; `db` continues to mean configuration, not successful connectivity.
- Body limits, route-level rate limits, clean validation errors and generic storage failures. No request bodies or credentials are logged. Addresses stay only in limiter memory.

## Verification

- Typecheck and lint pass. Unit/interaction tests: 152 pass, 7 PostgreSQL cases skip without `TEST_DATABASE_URL`.
- `next build --webpack` passes and includes all new dynamic routes; it emits the existing MediaPipe dynamic-import warning. The required `npm run check` passed typecheck/lint/tests but its default Turbopack build failed on a worker-port permission error on both Node 26 and the documented Node 22.22.2, including the elevated retry. Webpack production output was built and smoke-tested successfully; the integrator must rerun the default build in its environment before merge. No build script was changed to conceal the failure.
- Real production localhost HTTP smoke with synthetic data and **memory storage** passed: event retry leaves one session; confirmed feedback; round stats (one-second median, measured score gain); recipe publish/list/load; GET leaves uses zero; explicit use increments once and repeated use returns 429; invalid admin returns 403; hide returns 200 then detail 404/list excludes it. Existing `/shoot`, `/recipes`, `/r/[id]` and `/stats` HTML requests returned 200. This was HTTP verification, not an interactive browser test.
- Mock tests cover validation, 201 schema, 400/404/429/503, failure across each storage route, token moderation, missing-vs-unavailable client results, memory eviction/copies, idempotency and metric null rules.
- No real database was supplied or accessed. PostgreSQL persistence, migrations and TimescaleDB conversion are **unverified against a live database**. Opt-in tests use only an explicitly supplied `TEST_DATABASE_URL`, in a random schema, never `DATABASE_URL`.
- No Gemini/ElevenLabs calls were made for Part 2. Those provider paths/prompts were preserved.

## Integrator wiring still needed (outside backend ownership)

1. Replace ambiguous recipe reads with `api.recipes.load` / `listResult`; use `api.statsResult(round?)` for empty versus unavailable.
2. Call `api.recipes.use(id)` only when “Start coaching this shot” is accepted. A recipe GET never increments uses.
3. Send optional `beforeTotal` and `afterTotal` in feedback when both are actually measured under comparable conditions. Do not treat a heuristic match score as photo-quality proof.
4. Send the testing `round` in feedback and usage events; expose the round query to the results page as appropriate.
5. Use the optional recipe `sample` flag for publication and labels. The current publisher still refuses sample ideas until the interface changes.
6. Show temporary storage from a successful health/stats/write response. A failed health request must not be mistaken for confirmed temporary storage. Health reports configuration, not a DB probe.
7. Coach events and the feedback form currently generate different session IDs; unify them in the owning coach/UI lane if joins are needed. Backend aggregation does not falsely join unrelated IDs.
8. Rerun the actual publish/link/QR/recreate flow in a browser against these routes, then on physical phones. A 200 HTML response is not evidence that the component flow was exercised.

## Configuration and operations

Set `DATABASE_URL` only for the approved project DB, apply migrations manually, then start/redeploy. Set `RECIPES_ADMIN_TOKEN` on the server only. `TEST_DATABASE_URL` opts into disposable-schema tests. Restart after changing store settings. The memory fallback loses records on restart and is separate per Vercel instance; oldest entries are evicted, and rate limits are likewise local per instance. See `docs/SETUP.md` for smoke commands.

The optional Timescale migration is recorded even when skipped; installing the extension later requires an explicit operator rerun. No extension installation or unrelated database migration is performed automatically.

---

## Historical voice handoff (already merged before Part 2)

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
