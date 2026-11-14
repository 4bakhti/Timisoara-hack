# Integration: status

Updated: Sat 14 Nov, 12:40

## Merged into `main`

1. `codex-2/backend-extras`: ElevenLabs speech route, optional voice conversation ("voice director"), coach speech hooks. Merge `2cc603a`.
2. Gemini fix found by live testing (`fe57dd2`, `1331a82`, details below).
3. `claude-2/interface-extras` (PR #2): honest feedback form, recipes with QR codes, `/recipes`, `/r/[id]`, `/stats`, home page, shooting-flow fixes. Merge `e8d8d3e`.

`npm run check` passed after each step: types, lint, 125 tests, production build.

## Verified live, with a real Gemini key, on localhost

| Call | Result |
|---|---|
| Read a portrait (English) | Real plan in 4–7 s; ideas name things in the photo (ornate table, book, backdrop) |
| Read a coffee cup (Romanian) | Real plan in 4 s, in Romanian, no pose for an object |
| Review | Real; with two identical photos it now says they look the same |
| Guidance (no person) | Real, 1–2 s |
| Whole `/shoot` flow with a picture | Real ideas, coaching, capture, result, recipe button and feedback form shown |

Gemini fix: the planning model `gemini-4-hydrogen` timed out (19 s even with low thinking). Measured on a 960 px photo: `gemini-3.5-flash-lite` 3–5 s, `gemini-3.6-flash` 16 s, `gemini-3.8-flash` over 40 s. The default is now `gemini-3.5-flash-lite`. It often returns HTTP 503 ("high demand"), so a transient error moves straight to `gemini-3.1-flash-lite` within the same 14 s budget. The reviewer prompt now says the scores are not proof of a better photo.

## Not working yet

- **No server routes for feedback, recipes, stats or usage events.** The interface is ready for them and honestly shows "not saved" / "not available": `POST /api/feedback`, `GET/POST /api/recipes`, `GET /api/recipes/[id]`, `GET /api/stats`, `POST /api/events`. See the requests in `docs/status/interface.md`.
- ElevenLabs: no key, voice id or agent yet, so `/api/speak` and `/api/voice/session` answer 501 and the phone's own voice is used. The voice conversation is not wired into the shooting screen yet.
- Not tested on a real phone or a deployed HTTPS address.
- Sample plans are English only.

## Not merged

- `quality/release-readiness` (test plans and two quality tests). Its commit is signed with a personal e-mail address instead of the GitHub no-reply address, so it was left for the team to decide.
