import { z } from "zod";
import preset from "./voice/agent-v1.json";
import tools from "./voice/client-tools-v1.json";
import { TOOL_INPUT } from "../src/voice/tools";
import { ELEVENLABS_ORIGIN, speechConfig, synthesizeSpeech } from "../src/server/elevenlabs";
import { createVoiceSession, sessionConfig } from "../src/server/voiceSession";
import type { Lang } from "../src/lib/contracts";

const ProviderTool = z.object({
  name: z.string(),
  type: z.string(),
  expects_response: z.boolean().optional(),
  parameters: z.object({
    properties: z.record(z.string(), z.object({ type: z.string() })).optional(),
    required: z.array(z.string()).optional(),
  }).nullish(),
});

const Agent = z.object({
  conversation_config: z.object({
    tts: z.object({ voice_id: z.string(), model_id: z.string() }),
    agent: z.object({
      language: z.string(),
      first_message: z.string().optional(),
      prompt: z.object({ prompt: z.string(), llm: z.string(), tool_ids: z.array(z.string()).max(16) }),
    }),
    conversation: z.object({ client_events: z.array(z.string()), max_duration_seconds: z.number() }),
    language_presets: z.record(z.string(), z.unknown()),
  }),
  platform_settings: z.object({
    auth: z.object({ enable_auth: z.boolean() }),
    overrides: z.object({
      conversation_config_override: z.object({ agent: z.object({ language: z.boolean() }) }),
    }),
    privacy: z.object({
      record_voice: z.boolean(),
      retention_days: z.number(),
      delete_transcript_and_pii: z.boolean(),
    }),
  }),
});

async function get(path: string, key: string): Promise<unknown> {
  const response = await fetch(new URL(path, ELEVENLABS_ORIGIN), {
    headers: { "xi-api-key": key },
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("Configuration read failed (HTTP " + response.status + "). Check agent/tool read access and the project ID.");
  }
  return response.json();
}

function schemaMatches(tool: z.infer<typeof ProviderTool>) {
  const name = Object.keys(TOOL_INPUT).find((key): key is keyof typeof TOOL_INPUT => key === tool.name);
  if (!name || tool.type !== "client" || !tool.expects_response) return false;
  const schema = z.toJSONSchema(TOOL_INPUT[name]);
  const expected = Object.entries(schema.properties ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const fields = Object.keys(tool.parameters?.properties ?? {});
  const required = tool.parameters?.required ?? [];
  return fields.length === expected.length && required.length === expected.length &&
    expected.every(([field, value]) => required.includes(field) &&
      typeof value === "object" && tool.parameters?.properties?.[field]?.type === value.type);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((arg) => arg !== "--smoke")) throw new Error("Usage: npm run voice:check -- [--smoke]");
  const localTools = ProviderTool.array().parse(tools);
  const localNames = new Set(localTools.map((tool) => tool.name));
  if (localNames.size !== Object.keys(TOOL_INPUT).length ||
      localTools.length !== localNames.size || !localTools.every(schemaMatches)) {
    throw new Error("The versioned tool configuration differs from the runtime schemas.");
  }
  const config = sessionConfig();
  if (!config) {
    console.log("Local tool definitions match. Live checks require ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID.");
    if (args.length) process.exitCode = 1;
    return;
  }

  const raw = await get("/v1/convai/agents/" + encodeURIComponent(config.agentId), config.key);
  const parsed = Agent.safeParse(raw);
  if (!parsed.success) throw new Error("The agent settings are incomplete. See docs/SETUP.md.");
  const { conversation_config: conversation, platform_settings: settings } = parsed.data;
  const expected = preset.conversation_config;
  const failures: string[] = [];
  if (!settings.auth.enable_auth) failures.push("Require signed authentication.");
  if (!settings.overrides.conversation_config_override.agent.language) failures.push("Enable the language override.");
  if (settings.privacy.record_voice || settings.privacy.retention_days !== 0 || !settings.privacy.delete_transcript_and_pii) {
    failures.push("Disable call recordings and set transcript retention to zero days.");
  }
  if (conversation.agent.language !== "en" || !("ro" in conversation.language_presets)) {
    failures.push("Set English as the default and enable Romanian.");
  }
  if (conversation.agent.first_message || conversation.agent.prompt.prompt.trim() !== expected.agent.prompt.prompt.trim()) {
    failures.push("Use the versioned Framewise prompt and leave the first message blank.");
  }
  if (conversation.tts.model_id !== expected.tts.model_id || !conversation.tts.voice_id) {
    failures.push("Use Flash v2.5 with a project voice.");
  }
  if (conversation.conversation.max_duration_seconds > expected.conversation.max_duration_seconds ||
      expected.conversation.client_events.some((event) => !conversation.conversation.client_events.includes(event))) {
    failures.push("Check the maximum duration and client event list.");
  }

  const ids = conversation.agent.prompt.tool_ids;
  const boundTools = await Promise.all(ids.map(async (id) => {
    const data = await get("/v1/convai/tools/" + encodeURIComponent(id), config.key);
    return z.object({ tool_config: ProviderTool }).safeParse(data);
  }));
  const names = new Set(boundTools.flatMap((tool) => tool.success ? [tool.data.tool_config.name] : []));
  if (boundTools.length !== tools.length || names.size !== tools.length ||
      boundTools.some((tool) => !tool.success || !schemaMatches(tool.data.tool_config))) {
    failures.push("Attach exactly the four client tools from client-tools-v1.json and enable Wait for response.");
  }
  if (failures.length) throw new Error(failures.join("\n"));

  console.log("Agent configuration and client tool bindings match.");
  if (args.includes("--smoke")) {
    await createVoiceSession(config);
    console.log("Single-use session access issued successfully. A browser conversation still needs to be tested.");
    const lines: Record<Lang, string> = { en: "Take a small step to your left.", ro: "Fă un pas mic spre stânga ta." };
    for (const lang of ["en", "ro"] as const) {
      const speech = speechConfig(lang);
      if (!speech) throw new Error("Set the configured TTS voice ID before testing speech.");
      await synthesizeSpeech(speech, { text: lines[lang], lang });
      console.log("Received MP3 speech for " + lang + ".");
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Voice setup check failed.");
  process.exitCode = 1;
});
