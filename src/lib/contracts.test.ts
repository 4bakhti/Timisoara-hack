import { describe, expect, it } from "vitest";
import { PHRASES, PHRASE_IDS } from "@/coach/phrases";
import { POSE_TEMPLATES, POSE_TEMPLATE_INFO, getPoseTemplate } from "@/vision/poses/catalog";
import { POSE_POINT_NAMES, PoseTemplate, ReviewResponse, ShotPlan } from "./contracts";
import { SAMPLE_PLAN_OBJECT, SAMPLE_PLAN_PERSON, SAMPLE_PLAN_PERSON_RO, samplePlan, sampleReview } from "./fixtures";

describe("sample data matches the contracts", () => {
  it("person plan is valid", () => {
    expect(() => ShotPlan.parse(SAMPLE_PLAN_PERSON)).not.toThrow();
  });

  it("Romanian person plan is valid, keeps the same poses and framing, and is chosen for ro", () => {
    expect(() => ShotPlan.parse(SAMPLE_PLAN_PERSON_RO)).not.toThrow();
    SAMPLE_PLAN_PERSON_RO.ideas.forEach((idea, i) => {
      expect(idea.subject?.poseTemplateId).toBe(SAMPLE_PLAN_PERSON.ideas[i].subject?.poseTemplateId);
      expect(idea.framing).toEqual(SAMPLE_PLAN_PERSON.ideas[i].framing);
      expect(idea.title).not.toBe(SAMPLE_PLAN_PERSON.ideas[i].title);
    });
    expect(samplePlan("ro")).toBe(SAMPLE_PLAN_PERSON_RO);
    expect(samplePlan("en")).toBe(SAMPLE_PLAN_PERSON);
  });

  it("object plan is valid and asks for no pose", () => {
    const plan = ShotPlan.parse(SAMPLE_PLAN_OBJECT);
    expect(plan.ideas.every((idea) => idea.subject === undefined)).toBe(true);
  });

  it("reviews are valid in both languages", () => {
    expect(() => ReviewResponse.parse(sampleReview("en"))).not.toThrow();
    expect(() => ReviewResponse.parse(sampleReview("ro"))).not.toThrow();
  });

  it("every pose the sample plan asks for exists", () => {
    for (const idea of SAMPLE_PLAN_PERSON.ideas) {
      expect(getPoseTemplate(idea.subject?.poseTemplateId).id).toBe(idea.subject?.poseTemplateId);
    }
  });
});

describe("pose library", () => {
  it("has unique ids and valid templates", () => {
    const ids = POSE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const template of POSE_TEMPLATES) {
      expect(() => PoseTemplate.parse(template)).not.toThrow();
    }
    expect(POSE_TEMPLATE_INFO).toHaveLength(POSE_TEMPLATES.length);
  });

  it("keeps every point inside the unit box, with the head above the hips", () => {
    for (const template of POSE_TEMPLATES) {
      for (const name of POSE_POINT_NAMES) {
        const [x, y] = template.points[name];
        expect(x, `${template.id}.${name}.x`).toBeGreaterThanOrEqual(0);
        expect(x, `${template.id}.${name}.x`).toBeLessThanOrEqual(1);
        expect(y, `${template.id}.${name}.y`).toBeGreaterThanOrEqual(0);
        expect(y, `${template.id}.${name}.y`).toBeLessThanOrEqual(1);
      }
      expect(template.points.nose[1]).toBeLessThan(template.points.lHip[1]);
      // The subject's left side is on the image's right.
      expect(template.points.lShoulder[0]).toBeGreaterThan(template.points.rShoulder[0]);
    }
  });

  it("falls back to the default pose for an unknown id", () => {
    expect(getPoseTemplate("does-not-exist").id).toBe("relaxed-stand");
    expect(getPoseTemplate(undefined).id).toBe("relaxed-stand");
  });
});

describe("coach phrases", () => {
  it("exist in English and Romanian", () => {
    for (const id of PHRASE_IDS) {
      expect(PHRASES[id].en.trim().length, id).toBeGreaterThan(0);
      expect(PHRASES[id].ro.trim().length, id).toBeGreaterThan(0);
    }
  });
});
