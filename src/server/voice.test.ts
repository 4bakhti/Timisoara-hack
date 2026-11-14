import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as speak } from "@/app/api/speak/route";
import { POST as session } from "@/app/api/voice/session/route";
import { GET as health } from "@/app/api/health/route";
import { phraseText } from "@/coach/phrases";

function post(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000" + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const makeMp3 = () => new Response(new Uint8Array([0x49, 0x44, 0x33, 0x04]), {
  headers: { "content-type": "audio/mpeg" },
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("voice routes with a mocked ElevenLabs API", () => {
  it("distinguishes missing config from a provider response", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const speech = await speak(post("/api/speak", { text: "Move left.", lang: "en" }));
    expect(speech.status).toBe(501);
    expect(await speech.json()).toEqual({ error: "not_configured" });
    const response = await session(post("/api/voice/session"));
    expect(response.status).toBe(501);
    expect(await health().json()).toMatchObject({ voice: false, voiceConversation: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects oversize, blank and cross-site text before using the provider", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-only");
    vi.stubEnv("ELEVENLABS_VOICE_ID", "test-en");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await speak(post("/api/speak", { lang: "en", text: " ".repeat(3000) }))).status).toBe(413);
    expect((await speak(post("/api/speak", { lang: "en", text: "   " }))).status).toBe(400);
    expect((await speak(post("/api/speak", { lang: "en", text: "Hold." }, { origin: "https://example.test" }))).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("passes Romanian explicitly and shares fixed phrase audio across concurrent requests", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-only");
    vi.stubEnv("ELEVENLABS_VOICE_ID", "test-en");
    vi.stubEnv("ELEVENLABS_VOICE_ID_RO", "test-ro");
    const fetch = vi.fn().mockImplementation(async () => makeMp3());
    vi.stubGlobal("fetch", fetch);

    const body = { lang: "ro", text: phraseText("move_left", "ro") };
    const responses = await Promise.all([speak(post("/api/speak", body)), speak(post("/api/speak", body))]);
    expect(responses.every((response) => response.ok && response.headers.get("content-type") === "audio/mpeg")).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toContain("/text-to-speech/test-ro");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ language_code: "ro", model_id: "eleven_flash_v2_5" });

    const custom = { lang: "ro", text: "Puțin mai aproape de fereastră." };
    await speak(post("/api/speak", custom));
    await speak(post("/api/speak", custom));
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("returns a clean failure when the provider sends non-audio", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-only");
    vi.stubEnv("ELEVENLABS_VOICE_ID", "test-en");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ detail: "private failure" })));

    const response = await speak(post("/api/speak", { lang: "en", text: "Step forward." }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "speech_unavailable" });
  });

  it("mints single-use access for the configured agent and rate-limits issuance", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-only");
    vi.stubEnv("ELEVENLABS_AGENT_ID", "agent_test");
    const signedUrl = "wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_test&conversation_signature=short-lived";
    const fetch = vi.fn(async () => Response.json({ signed_url: signedUrl, extra: "ignored" }));
    vi.stubGlobal("fetch", fetch);

    const request = () => post("/api/voice/session", undefined, { "x-forwarded-for": "198.51.100.1" });
    const response = await session(request());
    expect(await response.json()).toEqual({ signedUrl });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetch).toHaveBeenCalledWith(
      new URL("https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=agent_test&include_conversation_id=true"),
      expect.objectContaining({ headers: expect.objectContaining({ "xi-api-key": "test-only" }) }),
    );
    for (let i = 0; i < 3; i++) expect((await session(request())).status).toBe(200);
    expect((await session(request())).status).toBe(429);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("rejects a connection URL outside ElevenLabs", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-only");
    vi.stubEnv("ELEVENLABS_AGENT_ID", "agent_test");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ signed_url: "wss://example.test/?token=no" })));
    expect((await session(post("/api/voice/session"))).status).toBe(502);
  });
});
