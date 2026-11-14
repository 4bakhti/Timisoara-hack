# Living Lab: testing with real users

How we test Framewise with people at the venue, and what we changed because of them. The numbers come from the app's own records at `/stats?round=<round>`. Nothing here is estimated.

## How a round works

- Testers open `/shoot?round=<round>` on their phone or ours.
- We say only: "Take a photo of your friend with this," and don't help. We note where they hesitate.
- They rate the coaching in the app (1–5), with an optional comment, and we ask one question: "What was confusing?"
- After a round we fix the top problems, note each change with its commit, and start the next round with a new label.
- We ask permission before keeping or showing anyone's photo. Feedback and usage numbers contain no personal data.

## Rounds

| Round | When | Testers | What we saw | What we changed (commit) |
|---|---|---|---|---|
| Team pilot | Sat 14 Nov, 23:00 | Our team, on a phone at the venue | The target outline stayed at a fixed spot while the person moved, so it was hard to line up with. Framing scored 62–63 although the person fitted the frame, because only the AI's exact box counted. Sitting or upper-body shots were not coached: with the hips out of sight the app saw no person. | The outline now stands on the person (same torso place and size), so only arms and legs differ. Framing counts close enough as right and only asks for clear changes, a cut-off head, or cut-off feet in a full-length idea. With the hips hidden, the torso is estimated from the shoulders. (the commit that adds this row) |
| `round-1` | | | | |
| `round-2` | | | | |

## Results by round

Copy these from `/stats?round=round-1` and `/stats?round=round-2`. "Not measured" stays "not measured".

| Measure | `round-1` | `round-2` |
|---|---|---|
| Coaching sessions | | |
| Sessions that ended with a photo | | |
| Median seconds until the pose matched | | |
| Average score change, before → after | | |
| Average rating (1–5) and number of ratings | | |
