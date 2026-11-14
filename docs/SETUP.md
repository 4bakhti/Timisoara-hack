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

The reserved `DATABASE_URL` and `AUTH0_*` settings are for future persistence and sign-in.

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
