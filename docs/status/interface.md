# Interface: status

Updated: Sat 14 Nov, 02:45

A first version of the main flow was written by the vision workstream so the product works end to end. Whoever picks up the interface workstream owns these files from here and continues with the list under "Next".

## Done
- `/` home page explaining the four steps, with a Start button.
- `/shoot` (`src/components/ShootFlow.tsx`): the whole flow on one screen with a single `<video>` kept alive:
  intro → camera → reading the scene → three idea cards → live coaching → result.
  - Camera start in one tap (also unlocks sound and the tilt sensor, keeps the screen awake); front/rear switch with mirrored preview.
  - Without a camera: "Use a picture instead" runs the same flow on a picture.
  - Idea cards with a framing diagram (target box and pose figure), "Sample suggestions" label when the data is sample data.
  - Coaching screen: score ring, one large instruction (`aria-live`), countdown, friend/solo switch, voice switch, shutter.
  - Result: before and after with totals and parts, what improved, a lesson, save or share, try another idea, new scene, 1–5 rating.
- English and Romanian for every string (`src/i18n/strings.ts`), language switch.
- Dark theme, safe-area padding, reduced-motion support.

Checked in a desktop browser at phone size, using a picture instead of the camera: all six steps work on sample data with the real tracker.

## Not checked
- A real phone camera. Needs a deployed HTTPS address.

## Next
1. App icon and web manifest (original artwork).
2. Recipes: make one from a result, list and map, QR code, `/r/[id]` deep link.
3. Blind vote page and results page (need the server's feedback and stats routes).
4. Sign-in screens once the server has sign-in.
5. Onboarding cards, privacy page, about page with credits.
6. Demo mode with the scripted tracker (`engine: "sim"`).
7. Accessibility and performance pass on real phones; Romanian text check by a native speaker.

## Needs from the team
- Try `/shoot` on an iPhone and an Android phone and write down anything that looks wrong or confusing.

## Requests to other workstreams
- Server: feedback, events, pairs, votes and stats routes.

## Notes for other workstreams
- Screens reach the server only through `src/lib/api.ts`.
