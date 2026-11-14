# Server: status

Updated: Sat 14 Nov, 02:45

A first version of the core routes was written by the vision workstream so the product works end to end. Whoever picks up the server workstream owns these files from here and continues with the list under "Next".

## Done
- `src/server/env.ts`: all configuration, every value optional. `GET /api/health`.
- `src/server/gemini.ts`: one helper for Gemini calls that asks for JSON matching a zod schema, validates the answer, retries once with the validation errors (the retry describes the schema in words in case the API rejected the schema itself), and returns null on failure.
- `src/server/prompts.ts`: the instructions for planning, review and guidance.
- `POST /api/analyze`: photo in, `ShotPlan` out (`gemini-4-hydrogen`), tidied by `src/server/plan.ts` (boxes kept in frame, unknown poses replaced, unique ids).
- `POST /api/review`: before and after in, improvements and a lesson out.
- `POST /api/guide`: quick framing check (`gemini-3.5-flash-lite`).
- Body size limit, per-address rate limit, clean error codes, no logging of images.
- Without `GEMINI_API_KEY` every route answers with sample data flagged `mock: true`. Checked locally.
- `docs/SETUP.md`: deployment and keys.

## Not checked
- **No real Gemini call has been made**: there is no key yet. The request shape follows the installed SDK's types and README. First thing to do with a key: open `/shoot`, read a scene, and look at the server log for lines starting `[gemini]`.

## Next
1. `POST /api/speak` (ElevenLabs) and the script that pre-generates `public/voice/<lang>/<id>.mp3` from `src/coach/phrases.ts`.
2. `POST /api/events`, `POST /api/feedback`, `POST /api/pairs`, `GET/POST /api/votes`, `GET /api/stats` with an in-memory store, then PostgreSQL (Tiger Data).
3. Recipes routes. Sign-in with Auth0.
4. `POST /api/preview` (AI sketch), light advice, Vultr deployment files.

## Needs from the team
- `GEMINI_API_KEY` in Vercel and in `.env.local` (see `docs/SETUP.md`).
- Later: ElevenLabs key and voice id, a database address, an Auth0 application.

## Requests to other workstreams
- None.

## Notes for other workstreams
- The interface already calls these through `src/lib/api.ts`, which falls back to sample data on any failure.
- `/api/events` and `/api/feedback` do not exist yet; the client ignores the 404.
