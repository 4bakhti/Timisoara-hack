# Credits

Everything in this project that we did not write ourselves. Add a row when you add a dependency, an API, a model or a dataset.

## Libraries

| Name | Used for | Licence |
|---|---|---|
| Next.js, React | Application framework | MIT |
| Tailwind CSS | Styling | MIT |
| TypeScript | Language | Apache-2.0 |
| zod | Validating data between modules and from AI responses | MIT |
| MediaPipe Tasks Vision (`@mediapipe/tasks-vision`) | Body landmark detection on the phone | Apache-2.0 |
| ElevenLabs Agents SDK (`@elevenlabs/client`) | Microphone conversation and client actions | MIT |
| Google Gen AI SDK (`@google/genai`) | Calling the Gemini API | Apache-2.0 |
| node-postgres (`pg`), Drizzle ORM | Database access | MIT, Apache-2.0 |
| Auth0 Next.js SDK | Sign-in | MIT |
| MapLibre GL JS | Recipe map | BSD-3-Clause |
| qrcode | QR codes for recipes | MIT |
| SunCalc | Sun position for light advice | BSD-2-Clause |
| lucide-react | Icons | ISC |
| clsx | Class name helper | MIT |
| Vitest, Testing Library, jsdom | Tests | MIT |

## Services and models

| Name | Used for |
|---|---|
| Google Gemini API | Reading the scene, planning shots, reviewing results |
| ElevenLabs | The coach's voice |
| ElevenLabs Flash v2.5 and ElevenAgents | Bilingual correction speech and conversation |
| MediaPipe Pose Landmarker model | Body landmarks (Apache-2.0 model from Google) |
| Tiger Data (PostgreSQL) | Database |
| Auth0 | Sign-in |
| OpenStreetMap | Map data, © OpenStreetMap contributors (ODbL) |
| Open-Meteo | Weather for light advice (CC BY 4.0) |

## Our own data

The pose library (`src/vision/poses/`) and all coach phrases (`src/coach/phrases.ts`) were written by the team during the event. No third-party pose data or photos are used.
