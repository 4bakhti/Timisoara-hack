# Phone acceptance and demo rehearsal

Run against the actual integrated deployment, not an old preview. Record commit, URL, device, OS/browser, language, camera and network. Use at least one physical iPhone/Safari and one physical Android/Chrome if available. Desktop emulation does not count as either. All checks below start **NOT RUN**; this document is a protocol, not a test report.

## Release gate

| ID | Exercise | Pass condition |
| --- | --- | --- |
| P01 | Fresh visit; deny camera, then use photo upload | Clear recovery and upload works; no endless spinner |
| P02 | Allow camera; deny microphone | Camera and touch coaching remain usable; voice state is truthful |
| P03 | Start camera and conversation from the user gesture | Both work together; voice is audible; microphone is not started before consent |
| P04 | Read a person scene and a non-person scene using the real key | Ideas refer to actual visible details; any fallback is labelled; no invented success |
| P05 | Select an offered idea by voice | Card, selected idea, guide and spoken acknowledgement agree |
| P06 | Ask “Which left?” and “Repeat that” | Explanation is grounded; no invented landmarks; one correction at a time |
| P07 | Interrupt during speech; mute during a delayed response | Old speech stops and cannot restart afterward; mic/speaker mute meanings are distinct |
| P08 | Pause during countdown; change idea during capture encoding | No old countdown or photo arrives in the new session |
| P09 | Request capture twice rapidly | Exactly one intended capture; actual outcome matches acknowledgement |
| P10 | Complete review A slowly, then capture/review B | A cannot overwrite B; before/after match the correct session |
| P11 | Front camera, off-centre pose, then rear camera | Overlay aligns; left/right and framing advice are consistent; saved image matches intended composition |
| P12 | Slow/disconnect network; reconnect; try unavailable provider | Usable fallback, clear state, no endless request loop or surprise resumed speech |
| P13 | Leave `/shoot`, return, background app and return | Ended mic sessions stop; no duplicate audio/tracker/streams; active lifecycle is clear |
| P14 | Complete the core path in Romanian | UI and spoken instructions agree; have a Romanian speaker check meaning/pronunciation |
| P15 | Portrait/landscape, narrow screen, keyboard open | Important controls remain visible, legible and reachable |
| P16 | Try save/share and failed feedback submission | Photo saves correctly; feedback cannot claim success on failure |

Repeat P03/P06/P07/P09 in realistic venue noise using the phone speaker. Verify the agent does not respond to its own spoken instructions. If tested only with headphones, disclose that limitation.

Log each failure with: ID, commit, device/browser, precise actions, expected result, actual result, repeatability (e.g. 2/3), owner and fix verification. Keep participant information and recordings out of the public repository. A screen recording is useful only with permission; redact private content before sharing.

## Two-minute demonstration, after checks pass

- 0:00–0:15: State a problem your team actually experienced: taking a photo while one person poses and another struggles to direct them, or taking a self-portrait without repeatedly checking the phone.
- 0:15–0:35: Start the real camera/voice session. Read a real scene; identify the visible details used in the suggestions.
- 0:35–1:10: Choose an offered shot by voice. Move in response to a live correction. Ask for clarification and interrupt once.
- 1:10–1:30: Pause/resume or change to another currently offered idea. Request capture and let the actual capture flow finish.
- 1:30–1:45: Show the real photo and one defensible explanation of the composition. Do not call a pose-match number proof of better aesthetics.
- 1:45–2:00: Explain division of work: Gemini plans from the scene, local tracking measures movement, ElevenLabs enables conversation and app actions. Show one actual user-test finding and the change it caused, if available.

Rehearse on the deployed commit and venue network. Have a clearly labelled recorded demonstration of the real flow as backup, made with participant permission. If using sample data or scripted tracking, say so; do not present it as live provider behavior.
