# Setup

Use Node 22.22.2 or later in the Node 22 line, or Node 24.15 or later in the Node 24 line. Run `npm ci`, then `npm run dev`. Localhost works on the development machine. Phone camera and microphone access require HTTPS. Use the team's existing deployment when testing phones.

## Environment

Copy `.env.example` to `.env.local`. Configure the same variable names in the deployment environment before starting it. Keep keys and IDs server-side.

| Variable | What it enables |
|---|---|
| `GEMINI_API_KEY` | Scene analysis, shot suggestions, result review and framing advice |
| `GEMINI_MODEL`, `GEMINI_FAST_MODEL` | Optional overrides for `gemini-4-hydrogen` and `gemini-3.5-flash-lite` |
| `ELEVENLABS_API_KEY` | Access to the project workspace's Text to Speech and/or ElevenAgents APIs |
| `ELEVENLABS_VOICE_ID` | Project voice used for correction speech in English and, by default, Romanian |
| `ELEVENLABS_VOICE_ID_RO` | Optional Romanian voice for correction speech |
| `ELEVENLABS_AGENT_ID` | Dedicated private Framewise agent for microphone conversation |

`DATABASE_URL` enables PostgreSQL persistence. `TEST_DATABASE_URL` is an explicit disposable database for opt-in store tests. `RECIPES_ADMIN_TOKEN` protects team moderation. `AUTH0_*` remains reserved for future sign-in.

`GET /api/health` reports which settings are present. A true `voice` or `voiceConversation` field reports configuration. Use the checks below to verify API access. Without Gemini, `/shoot` shows ideas labelled as samples. Without ElevenLabs, the coach uses prepared clips when present and the browser's voice otherwise. Choose a device with a Romanian speech voice for Romanian fallback.

## Prepare correction and countdown clips

`POST /api/speak` uses ElevenLabs Flash v2.5 with explicit `en` and `ro` language selection. Choose a multilingual voice available in the workspace and check its pronunciation for both languages. For a more natural accent, use a Romanian voice from that workspace and set `ELEVENLABS_VOICE_ID_RO`. The Agents dashboard has its own English voice and Romanian language preset. Use the same selections there if you want a consistent voice. [ElevenLabs models and languages](https://elevenlabs.io/docs/overview/models/) · [Agent language settings](https://elevenlabs.io/docs/eleven-agents/customization/voice/customization/language)

Run `npm run voice:clips -- --countdown` to prepare `hold`, `three`, `two`, `one` and `got_it` first. Run `npm run voice:clips` to prepare the rest from `src/coach/phrases.ts`. Use `--en` or `--ro` to limit the run and `--force` after changing voices. Existing clips are skipped by default. The script writes audio to `public/voice/<lang>/<id>.mp3`. Serve those files with the app for the demo. Countdown playback uses local clips or device speech, so it can run during a network outage. Review short clips for pronunciation and make sure the three numbers fit the engine's 800 ms steps.

The server caches only the fixed phrase catalog in memory. Free-text corrections are request-only. Browser requests have a short deadline and fall back to device speech. ElevenLabs handles TTS text under the workspace's provider retention settings.

## Configure the dedicated conversation agent

Use a dedicated agent in the project workspace. Check the workspace's **ElevenAgents** minutes, LLM usage and key permissions separately from the Text to Speech balance. Production uses an API key with TTS and conversation issuance permissions as appropriate. The setup check also needs Agents and Tools read permissions. [ElevenAgents billing](https://elevenlabs.io/docs/help-center/product/eleven-agents/how-much-does-eleven-agents-cost)

1. Use `scripts/voice/agent-v1.json` as the versioned settings reference. Paste its prompt, leave the first message blank and select English with Romanian as an additional language. Use Flash v2.5 and the project voice. Allow the language override and require signed authentication. Add the demo hostname to the agent allowlist if your setup uses one.
2. Attach the four Client tools from `scripts/voice/client-tools-v1.json`. Match the function names and parameter types exactly. Use immediate execution, enable Wait for response and turn off pre-tool speech and tool sound. Keep interruptions enabled. Include the JSON preset's client events, especially `client_tool_call`, `user_transcript`, `vad_score` and `interruption`.
3. Set the maximum call duration to 300 seconds and use the call limits in the preset. Under Privacy, disable recording and set transcript retention to zero days for new calls. The app keeps the most recent transcript line in memory during the call and clears it on disconnect. [Audio saving](https://elevenlabs.io/docs/eleven-agents/customization/privacy/audio-saving) · [Retention](https://elevenlabs.io/docs/eleven-agents/customization/privacy/retention)
4. Set `ELEVENLABS_AGENT_ID` and run `npm run voice:check`. It compares the checked-in tool definitions to the runtime and reads the configured agent's settings and tool schemas. For a small paid smoke check, run `npm run voice:check -- --smoke`. It requests a single-use URL and renders one short phrase per language. A successful check still leaves browser playback and two-way calling to verify.

`POST /api/voice/session` issues single-use signed WebSocket access for the configured agent. The URL expires after 15 minutes if unused. The app requests it only after the user starts the conversation. Guest requests are same-origin and are limited to four session starts per address and 25 total starts per minute per server instance. Use the provider's account and agent limits to cap usage across instances. [ElevenLabs signed URL API](https://elevenlabs.io/docs/api-reference/conversations/get-signed-url)

## Two-minute demo after the interface PR is integrated

1. On an HTTPS phone, choose a language and use the start control after reading the mic disclosure. Confirm that the app keeps the camera preview on screen and that the conversation reaches Listening.
2. Read a scene using a photo you have permission to use. If Gemini is configured, confirm that the plan describes the actual scene and is not labelled as sample data. Step into frame and listen for the tracker's correction. Ask which side or who should move. Ask for a seated pose when none is offered, then ask for a different offered idea by name.
3. Say “Pause” during a countdown, then “Resume.” Request a photo while the coach is active. That request uses the manual shutter and captures immediately. Let an automatic countdown finish on a second run. Confirm one capture per run and compare the photo with what the screen reports.
4. Try the other language. Test speaker echo with the phone on speaker, a second person talking nearby, interruptions, microphone denial, mute, reconnect, and leaving the screen. With the key absent or the network down, verify browser speech remains available and the touch shutter still works.

Use `/lab/live` to check tracking and one-way coaching on a phone. `/lab/try` can use a picture to verify the existing manual flow. The browser downloads the tracking model on first use, or you can serve the team-approved copy at `public/mediapipe/pose_landmarker_lite.task`.


## Storage, feedback, statistics and public recipes

With `DATABASE_URL` absent, the process uses bounded temporary demo memory: 2,000 session summaries, 5,000 feedback entries and 500 recipes, evicting the oldest. Each server instance has its own memory; restarts lose it and Vercel instances do not share it. This mode is suitable for a local demo only. `/api/health` reports `db: false` and `storage: "memory"`; stats and confirmed feedback writes also report storage mode.

For durable storage, set `DATABASE_URL` to a PostgreSQL connection string supplied for this project. Keep its `sslmode` query setting (Tiger Data requires TLS); the installed `pg` driver parses it. The pool uses at most three connections per process. Select the store once at startup and restart after changing configuration. When a configured database fails, routes answer `503 { "error": "storage_unavailable" }`; they never pretend the write succeeded or silently fall back to memory. `/api/health` reports configuration, not a successful connectivity check.

On the explicitly approved project database, run:

```sh
npm run db:migrate
```

The command loads `.env.local`, refuses to run without `DATABASE_URL`, prints only the hostname and applied filenames, and records applied files in `schema_migrations` under a transaction/advisory lock. Run it manually before deploying the routes; startup does not run migrations. Do not point it at an unrelated database. Migration 0001 creates the regular tables. Migration 0002 converts event storage to a time-partitioned hypertable only if TimescaleDB is already installed and conversion is supported; otherwise it preserves the regular PostgreSQL table. It does not install an extension. If TimescaleDB is installed after migration 0002 was recorded, a database operator must explicitly rerun that optional conversion. This path is not proof of a verified Tiger Data integration. [TimescaleDB conversion reference](https://www.tigerdata.com/docs/reference/timescaledb/hypertables/create_hypertable_old)

Set `TEST_DATABASE_URL` only to a disposable database explicitly provided for tests. `npm run test` then creates a randomly named schema there, runs migrations and store checks, and deletes that schema afterward. With no variable, seven PostgreSQL tests skip; durable persistence and optional hypertable conversion remain unverified. Tests never borrow `DATABASE_URL` for database access.

Recipes use an explicit guest-public publishing flow and store the shot idea, optional pose and optional rounded location, never the source photo. IDs use 16 cryptographically random base62 characters. Lists include at most 50 public recipes. Detail reads do not count as uses; the interface must call the use endpoint only when a person starts coaching that recipe. Repeated use requests from one address/recipe are limited to once per ten minutes per process. Rate-limit addresses stay in process memory and are not written to the database. Limits are local per instance, not globally unique people or durable analytics guarantees.

Generate a random `RECIPES_ADMIN_TOKEN` locally and put it in server-only environment configuration. Moderation requires `Authorization: Bearer <token>`; never put it in a public page, a QR code, a query parameter or a client-prefixed variable. No token means `501 not_configured`. Hide returns 403 for incorrect credentials, and removes the recipe from public list/detail access without deleting its record.

### Route smoke checks

Use a local/test deployment and synthetic data. The examples set a base address and ID variables only; do not commit participant data. `tools` scripts are unnecessary. These writes change the chosen test store.

```sh
FW_BASE=http://localhost:3000
curl -i "$FW_BASE/api/health"
curl -i -X POST "$FW_BASE/api/events" -H 'Content-Type: application/json' --data '{"sessionId":"smoke-session","appVersion":"smoke-v1","round":"smoke","outcome":"captured","events":[{"t":1000,"score":90}]}'
curl -i -X POST "$FW_BASE/api/feedback" -H 'Content-Type: application/json' --data '{"sessionId":"smoke-session","appVersion":"smoke-v1","round":"smoke","rating":4,"beforeTotal":40,"afterTotal":60}'
curl -i "$FW_BASE/api/stats?round=smoke"
```

Repeat the events request: sessions must remain 1. Repeat feedback: ratings must remain 1. Measured median is 1 second and score gain is 20. Smoke data is synthetic; do not submit it as real-user evidence. An empty measurement remains null and votes stay zero.

To generate a valid synthetic recipe body without writing photos or keys, run this from the repository root:

```sh
node --import tsx -e 'const { SAMPLE_PLAN_PERSON } = require("./src/lib/fixtures.ts"); process.stdout.write(JSON.stringify({ title: "Smoke recipe", idea: SAMPLE_PLAN_PERSON.ideas[0], sample: true }));' > /tmp/framewise-recipe-smoke.json
curl -i -X POST "$FW_BASE/api/recipes" -H 'Content-Type: application/json' --data-binary @/tmp/framewise-recipe-smoke.json
curl -i "$FW_BASE/api/recipes"
curl -i "$FW_BASE/api/recipes?lat=45.75&lng=21.23"
FW_RECIPE_ID=replace_with_the_returned_id
curl -i "$FW_BASE/api/recipes/$FW_RECIPE_ID"
curl -i -X POST "$FW_BASE/api/recipes/$FW_RECIPE_ID/use"
```

Expected: create 201/public; list and detail 200; detail alone leaves uses at zero; explicit use 200 then repeated use 429 within ten minutes. For hide, use a local script/client that reads `RECIPES_ADMIN_TOKEN` from server-only environment and sends it as a Bearer header; avoid copying the token into terminal history. The following loads `.env.local` directly and never prints the credential:

```sh
FW_BASE="$FW_BASE" FW_RECIPE_ID="$FW_RECIPE_ID" node --env-file-if-exists=.env.local --input-type=module -e 'const token = process.env.RECIPES_ADMIN_TOKEN; if (!token) throw new Error("Set RECIPES_ADMIN_TOKEN locally first"); const response = await fetch(`${process.env.FW_BASE}/api/recipes/${encodeURIComponent(process.env.FW_RECIPE_ID)}/hide`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }); console.log(response.status, await response.text());'
curl -i "$FW_BASE/api/recipes/$FW_RECIPE_ID"
```

Hide should answer 200; the final detail read should answer 404/not_found and the public list should exclude the recipe. The unused `/api/pairs` and `/api/votes` remain out of scope.

### Additive client methods for the integrator

Existing methods/return types remain intact. New methods distinguish missing content from service outages:

- `api.recipes.load(id)`: `ok` with recipe, `not_found` only for an explicit recipe 404/not_found, otherwise `unavailable`.
- `api.recipes.listResult()`: `ok` with a possibly empty array, or `unavailable`.
- `api.statsResult(round?)`: `ok` with stats, or `unavailable`.
- `api.recipes.use(id)`: boolean confirming the explicit start-coaching use write.

Wire these into the interface in the integrator's change. Also wire optional feedback `beforeTotal`/`afterTotal`, optional event/feedback `round`, sample recipe labels, and storage messaging. The coach and feedback form currently generate different session codes; unifying them requires a separately owned coach/UI change. Match-score gain is a heuristic, not evidence of aesthetic improvement. Comments are optional free text: do not ask for names or contact details, and do not expose comment contents in public stats.

## AI pose previews

After the scene is read, each idea card asks `/api/preview` for an AI preview: the same person in the same place, in that idea's pose. Choosing a card with a preview coaches toward the preview's pose and outline.

- It uses `GEMINI_API_KEY` with the image model `gemini-3.1-flash-lite-image` (Nano Banana 2 Lite) by default. Set `GEMINI_IMAGE_MODEL=gemini-nano-banana-2.1` for higher quality.
- **Image generation needs image quota on the key's Google account.** Free keys answer "429 quota exceeded". Then the server pauses previews for ten minutes, and the cards keep their drawings.
- Previews are labelled "AI preview, not your photo". The final photo is always a real capture.
- Check: `/api/health` shows `"preview": true` while previews are available.
