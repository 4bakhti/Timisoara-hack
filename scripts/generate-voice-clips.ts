import { constants } from "node:fs";
import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { PHRASE_IDS, phraseText, type PhraseId } from "../src/coach/phrases";
import type { Lang } from "../src/lib/contracts";
import { speechConfig, synthesizeSpeech } from "../src/server/elevenlabs";

const COUNTDOWN: readonly PhraseId[] = ["hold", "three", "two", "one", "got_it"];

async function main() {
  const args = process.argv.slice(2);
  const languages = args.includes("--en") ? ["en"] as const : args.includes("--ro") ? ["ro"] as const : ["en", "ro"] as const;
  if (args.some((arg) => !["--en", "--ro", "--countdown", "--force"].includes(arg)) ||
      (args.includes("--en") && args.includes("--ro"))) {
    throw new Error("Usage: npm run voice:clips -- [--en | --ro] [--countdown] [--force]");
  }
  const ids = args.includes("--countdown") ? COUNTDOWN : PHRASE_IDS;
  const force = args.includes("--force");
  let written = 0;
  let skipped = 0;
  for (const lang of languages) {
    const config = speechConfig(lang);
    if (!config) throw new Error("Set ELEVENLABS_API_KEY and the voice ID in .env.local.");
    const folder = resolve("public", "voice", lang);
    await mkdir(folder, { recursive: true });
    for (const id of ids) {
      const path = resolve(folder, id + ".mp3");
      if (!force && await exists(path)) {
        skipped++;
        continue;
      }
      await generateClip(path, lang, id);
      written++;
    }
  }
  console.log("Generated " + written + " clip(s), skipped " + skipped + " existing clip(s).");
}

async function exists(path: string) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return false;
  }
}

async function generateClip(path: string, lang: Lang, id: PhraseId) {
  const config = speechConfig(lang);
  if (!config) throw new Error("Voice configuration is missing for " + lang + ".");
  const temporary = path + "." + randomUUID() + ".tmp";
  try {
    const audio = await synthesizeSpeech(config, { lang, text: phraseText(id, lang) });
    await writeFile(temporary, audio, { flag: "wx" });
    await rename(temporary, path);
  } catch {
    throw new Error("Could not generate " + lang + "/" + id + ". Check voice access, TTS credits and connectivity.");
  } finally {
    await rm(temporary, { force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Clip generation failed.");
  process.exitCode = 1;
});
