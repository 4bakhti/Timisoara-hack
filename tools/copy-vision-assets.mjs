// Copies the body-tracking runtime (WebAssembly files) from the installed package
// into public/mediapipe/wasm, so the app serves it itself instead of relying on a
// CDN. Runs automatically after `npm install`. The copied files are git-ignored.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const to = join(root, "public", "mediapipe", "wasm");

if (!existsSync(from)) {
  console.warn("[vision assets] @mediapipe/tasks-vision is not installed yet; skipping.");
} else {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log("[vision assets] copied tracking runtime to public/mediapipe/wasm");
}
