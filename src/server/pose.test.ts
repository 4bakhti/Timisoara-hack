import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/pose/route";
import { SAMPLE_PLAN_PERSON } from "@/lib/fixtures";
import { generateJson } from "./gemini";
vi.mock("./gemini", () => ({ generateJson: vi.fn() }));
let requestId = 0;
const request = (body: unknown = { image: "data:image/jpeg;base64,AAAA", lang: "en" }, headers = {}) => new Request("https://framewise.test/api/pose", {
  method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-real-ip": `pose-test-${++requestId}`, ...headers },
});
beforeEach(() => { vi.stubEnv("GEMINI_API_KEY", "test-only"); vi.mocked(generateJson).mockReset(); });
afterEach(() => vi.unstubAllEnvs());
describe("automatic pose route", () => {
  it("returns one validated scene-specific pose and keeps its box inside the frame", async () => {
    const idea = structuredClone(SAMPLE_PLAN_PERSON.ideas[0]);
    idea.framing.subjectBox = { x: .9, y: .8, w: .5, h: .7 };
    vi.mocked(generateJson).mockResolvedValue({ idea });
    const res = await POST(request());
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.idea.subject.poseTemplateId).toBe(idea.subject!.poseTemplateId);
    expect(result.ideas).toBeUndefined();
    expect(result.idea.framing.subjectBox.x + result.idea.framing.subjectBox.w).toBeLessThanOrEqual(1);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("returns no target when there is no person", async () => {
    vi.mocked(generateJson).mockResolvedValue({ idea: null });
    expect(await (await POST(request())).json()).toEqual({ idea: null });
  });
  it("never returns a canned pose when unconfigured or the provider fails", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    expect((await POST(request())).status).toBe(503);
    expect(generateJson).not.toHaveBeenCalled();
    vi.stubEnv("GEMINI_API_KEY", "test-only");
    vi.mocked(generateJson).mockResolvedValue(null);
    expect((await POST(request())).status).toBe(503);
  });
  it("rejects an unknown pose instead of drawing a different one", async () => {
    const idea = structuredClone(SAMPLE_PLAN_PERSON.ideas[0]);
    idea.subject!.poseTemplateId = "invented";
    vi.mocked(generateJson).mockResolvedValue({ idea });
    expect((await POST(request())).status).toBe(503);
  });
  it("rejects cross-site and malformed requests before calling the provider", async () => {
    expect((await POST(request(undefined, { origin: "https://another.test" }))).status).toBe(403);
    expect((await POST(request({ image: "https://another.test/photo" }))).status).toBe(400);
    expect(generateJson).not.toHaveBeenCalled();
  });
});
