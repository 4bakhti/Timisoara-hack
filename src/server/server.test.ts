import { describe, expect, it } from "vitest";
import { GuideResponse, ReviewResponse, ShotPlan } from "@/lib/contracts";
import { SAMPLE_PLAN_PERSON } from "@/lib/fixtures";
import { isTransient, jsonSchemaFor, modelForAttempt, splitDataUrl } from "./gemini";
import { RateLimiter } from "./http";
import { tidyBox, tidyPlan } from "./plan";
import { analyzeSystem, analyzeUser, guideSystem, reviewSystem } from "./prompts";

describe("splitDataUrl", () => {
  it("separates the type from the data", () => {
    expect(splitDataUrl("data:image/jpeg;base64,AAAA")).toEqual({ mimeType: "image/jpeg", data: "AAAA" });
  });

  it("rejects anything that is not a base64 image", () => {
    expect(splitDataUrl("https://example.com/a.jpg")).toBeNull();
    expect(splitDataUrl("data:text/html;base64,AAAA")).toBeNull();
    expect(splitDataUrl("data:image/jpeg;base64,<script>")).toBeNull();
  });
});

describe("jsonSchemaFor", () => {
  it("describes the plan as three ideas, without a $schema marker", () => {
    const schema = jsonSchemaFor(ShotPlan) as { $schema?: string; properties: { ideas: { minItems: number; maxItems: number } } };
    expect(schema.$schema).toBeUndefined();
    expect(schema.properties.ideas.minItems).toBe(3);
    expect(schema.properties.ideas.maxItems).toBe(3);
  });

  it("works for the other answers too", () => {
    expect(() => jsonSchemaFor(ReviewResponse)).not.toThrow();
    expect(() => jsonSchemaFor(GuideResponse)).not.toThrow();
  });
});

describe("tidyPlan", () => {
  it("keeps a box inside the frame", () => {
    const box = tidyBox({ x: 0.8, y: 0.9, w: 0.5, h: 0.6 });
    expect(box.x + box.w).toBeLessThanOrEqual(1);
    expect(box.y + box.h).toBeLessThanOrEqual(1);
    expect(tidyBox({ x: 0.2, y: 0.2, w: 0.01, h: 0.01 }).w).toBeGreaterThanOrEqual(0.15);
  });

  it("replaces unknown poses and repeated ids, and stays valid", () => {
    const messy: ShotPlan = {
      scene: SAMPLE_PLAN_PERSON.scene,
      ideas: SAMPLE_PLAN_PERSON.ideas.map((idea) => ({
        ...idea,
        id: "same",
        subject: { say: "x", poseTemplateId: "backflip" },
      })),
    };
    const tidy = tidyPlan(messy);
    expect(new Set(tidy.ideas.map((i) => i.id)).size).toBe(3);
    expect(tidy.ideas.every((i) => i.subject?.poseTemplateId === "relaxed-stand")).toBe(true);
    expect(() => ShotPlan.parse(tidy)).not.toThrow();
  });

  it("leaves a good plan as it is", () => {
    expect(tidyPlan(SAMPLE_PLAN_PERSON)).toEqual(SAMPLE_PLAN_PERSON);
  });
});

describe("RateLimiter", () => {
  it("allows the limit, then refuses until the window passes", () => {
    const limiter = new RateLimiter(2, 1000);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 10)).toBe(true);
    expect(limiter.allow("a", 20)).toBe(false);
    expect(limiter.allow("b", 20)).toBe(true);
    expect(limiter.allow("a", 1100)).toBe(true);
  });
});

describe("prompts", () => {
  it("ask for the right language and forbid remarks about bodies", () => {
    for (const prompt of [analyzeSystem("ro"), reviewSystem("ro"), guideSystem("ro")]) {
      expect(prompt).toContain("Romanian");
    }
    expect(analyzeSystem("en")).toContain("Never comment on anyone's body");
    expect(reviewSystem("en")).toContain("Never comment on anyone's body");
  });

  it("lists every available pose for the planner", () => {
    const text = analyzeUser("friend");
    expect(text).toContain("relaxed-stand");
    expect(text).toContain("arms-crossed");
    expect(analyzeUser("solo")).toContain("propped up");
  });
});

describe("retry policy", () => {
  it("treats overload, rate limits and timeouts as transient, and bad requests as not", () => {
    expect(isTransient(new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}'))).toBe(true);
    expect(isTransient(new Error("This operation was aborted"))).toBe(true);
    expect(isTransient(new Error("429 RESOURCE_EXHAUSTED"))).toBe(true);
    expect(isTransient(new Error('{"error":{"code":400,"status":"INVALID_ARGUMENT"}}'))).toBe(false);
    expect(isTransient(new Error("models/x is not found (404)"))).toBe(false);
  });

  it("moves to the fallback model straight after a transient error, and for the last attempt", () => {
    expect(modelForAttempt(0, false, "main", "backup")).toBe("main");
    expect(modelForAttempt(1, false, "main", "backup")).toBe("main");
    expect(modelForAttempt(1, true, "main", "backup")).toBe("backup");
    expect(modelForAttempt(2, false, "main", "backup")).toBe("backup");
    expect(modelForAttempt(2, true, "main")).toBe("main");
  });
});
