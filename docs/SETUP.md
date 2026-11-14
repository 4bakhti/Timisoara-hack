# Setup

The app runs without any keys: it then shows sample suggestions and labels them as such. Each key below switches one part from sample data to the real thing.

## 1. Put it on an HTTPS address (needed for phones)

Phone browsers only open the camera on HTTPS. The quickest way:

1. Sign in at vercel.com with the GitHub account that can see this repository.
2. "Add New… → Project", choose this repository, keep the defaults (Next.js is detected), deploy.
3. Open the address it gives you on a phone. Every later push to `main` redeploys.

## 2. Keys

Add them in Vercel under Project → Settings → Environment Variables (then redeploy), and in a local `.env.local` file for `npm run dev`. Never commit them.

| Variable | Where to get it | What it switches on |
|---|---|---|
| `GEMINI_API_KEY` | aistudio.google.com → "Get API key" | Real reading of the scene, real shot ideas, the review after a shot, guidance for scenes without people |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | elevenlabs.io → profile → API keys; a voice id from the voice library | The coach's studio voice (not wired yet; the phone's own voice is used until then) |
| `DATABASE_URL` | A Tiger Data (PostgreSQL) service's connection string | Recipes, feedback, usage numbers (not wired yet) |
| `AUTH0_*` | An Auth0 application | Sign-in (not wired yet) |

Optional: `GEMINI_MODEL` (default `gemini-4-hydrogen`) and `GEMINI_FAST_MODEL` (default `gemini-3.5-flash-lite`).

## 3. Check it

- `https://<your-address>/api/health` shows which services the server can see, for example `"gemini": true`.
- `/shoot` is the app. Without a Gemini key the ideas carry a "Sample suggestions" label; with one, the label disappears and the ideas describe your actual scene.
- `/lab/live` runs the coach on the live camera with a pose you pick: use it to check tracking speed and voice on each phone.
- `/lab/try` runs the coach on a single picture.

## 4. Optional: serve the tracking model yourself

On first use the browser fetches the body-tracking model (about 6 MB) from Google's storage. On unreliable Wi-Fi, download `pose_landmarker_lite.task` once (the address is in `src/vision/tracker.ts`) and place it at `public/mediapipe/pose_landmarker_lite.task`. The app uses the local copy when it is there.
