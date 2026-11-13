# Vision and coach: status

Updated: Fri 13 Nov, 21:45

## Done
- Project base: Next.js app, shared contracts, sample data, typed API client, `npm run check`.
- Pose library: 14 templates built from angles (`src/vision/poses/`), visible at `/lab`.
- Coach phrases in English and Romanian (`src/coach/phrases.ts`).
- Guide drawing (target box, pose ghost, live skeleton), still-frame grabbing.
- Voice player: pre-generated clips first, the phone's own voice as fallback.
- `useCoachSession` hook with its final interface, running a scripted (simulated) tracker.

## Now
- Real tracker: body landmarks on the phone, pose matching, framing and level checks, correction rules, shot score.

## Next
- Slow guidance loop for scenes without a person (`/api/guide`).
- Lab tools: test a photo against a template, replay a session.
- Event logging to `/api/events`.

## Needs from the team
- A Romanian speaker to read through the coach phrases.
- Testing on real phones (iPhone and Android) once deployed over HTTPS.

## Requests to other workstreams
- Server: the voice script should read `PHRASES` from `src/coach/phrases.ts` and write `public/voice/<lang>/<id>.mp3`.
- Interface: use `useCoachSession` as described in `docs/ARCHITECTURE.md`; call `unlockAudio()` from the first tap.

## Notes for other workstreams
- The hook's interface is final. Only the tracker behind it will change.
- `session.simulated` tells you when the scripted tracker is running.
