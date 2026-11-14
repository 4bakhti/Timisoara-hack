import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/preview/route";
import { SAMPLE_PLAN_OBJECT, SAMPLE_PLAN_PERSON } from "@/lib/fixtures";
import { getPoseTemplate } from "@/vision/poses/catalog";
import { health } from "./env";
import { classifyImageError, imageSizeFromDataUrl, nearestAspectRatio, pausePreviews, previewsPaused } from "./preview";
import { previewPrompt } from "./prompts";

/** A minimal JPEG header (SOI, APP0, SOF0 with the given size). */
function jpegDataUrl(width: number, height: number): string {
  const bytes = [
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9,
  ];
  return `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`;
}

function pngDataUrl(width: number, height: number): string {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

describe("imageSizeFromDataUrl", () => {
  it("reads JPEG and PNG sizes from the header", () => {
    expect(imageSizeFromDataUrl(jpegDataUrl(960, 1196))).toEqual({ width: 960, height: 1196 });
    expect(imageSizeFromDataUrl(pngDataUrl(1024, 768))).toEqual({ width: 1024, height: 768 });
  });

  it("returns null for anything else", () => {
    expect(imageSizeFromDataUrl("data:image/jpeg;base64,AAAA")).toBeNull();
    expect(imageSizeFromDataUrl("not a data url")).toBeNull();
  });
});

describe("nearestAspectRatio", () => {
  it("keeps the photo's shape", () => {
    expect(nearestAspectRatio(1080, 1920)).toBe("9:16");
    expect(nearestAspectRatio(960, 1196)).toBe("3:4");
    expect(nearestAspectRatio(1920, 1080)).toBe("16:9");
    expect(nearestAspectRatio(1000, 1000)).toBe("1:1");
  });
});

describe("classifyImageError", () => {
  it("recognises quota, timeouts and everything else", () => {
    expect(classifyImageError(new Error('{"error":{"code":429,"message":"You exceeded your current quota"}}'))).toBe("quota");
    expect(classifyImageError(new Error("This operation was aborted"))).toBe("timeout");
    expect(classifyImageError(new Error("500 internal"))).toBe("failed");
  });
});

describe("previewPrompt", () => {
  const idea = SAMPLE_PLAN_PERSON.ideas[0];
  const pose = getPoseTemplate(idea.subject?.poseTemplateId);

  it("keeps the person and the place, changes only the pose, and forbids body changes", () => {
    const text = previewPrompt(idea, pose);
    expect(text).toContain("same person");
    expect(text).toContain("same place");
    expect(text).toContain(idea.subject?.say ?? "");
    expect(text).toContain(pose.describe);
    expect(text).toContain("no changes to the person's face or body");
  });

  it("asks for the whole body only for full-length poses", () => {
    expect(previewPrompt(idea, { describe: "x", tags: ["standing", "full-body"] })).toContain("whole body");
    expect(previewPrompt(idea, { describe: "x", tags: ["standing", "half-body"] })).not.toContain("whole body");
  });
});

describe("pausing previews", () => {
  it("pauses for the given time", () => {
    pausePreviews(1000, 10_000);
    expect(previewsPaused(10_500)).toBe(true);
    expect(previewsPaused(11_001)).toBe(false);
  });
});

describe("POST /api/preview", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const call = (body: unknown) =>
    POST(new Request("http://localhost/api/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

  it("answers not_configured without a key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const res = await call({ image: jpegDataUrl(960, 1196), idea: SAMPLE_PLAN_PERSON.ideas[0], lang: "en" });
    expect(res.status).toBe(501);
    expect(health().preview).toBe(false);
  });

  it("refuses ideas without a person", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const res = await call({ image: jpegDataUrl(960, 1196), idea: SAMPLE_PLAN_OBJECT.ideas[0], lang: "en" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("no_subject");
  });

  it("rejects a malformed body", async () => {
    const res = await call({ image: "nope" });
    expect(res.status).toBe(400);
  });
});
