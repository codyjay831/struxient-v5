import assert from "node:assert/strict";
import test from "node:test";
import {
  mapAiStageToStageId,
  normalizeStageLabel,
  type AllowedStage,
} from "./map-ai-stage";

const stages: AllowedStage[] = [
  { id: "s1", name: "Pre-Construction" },
  { id: "s2", name: "Site Prep" },
  { id: "s3", name: "Rough-In" },
  { id: "s4", name: "Permitting" },
];

test("normalizeStageLabel collapses whitespace and case", () => {
  assert.equal(normalizeStageLabel("  Rough-In  "), "rough in");
  assert.equal(normalizeStageLabel("Site   Prep"), "site prep");
});

test("mapAiStageToStageId exact match", () => {
  const result = mapAiStageToStageId({
    stageName: "Rough-In",
    allowedStages: stages,
  });
  assert.equal(result.stageId, "s3");
  assert.equal(result.confidence, "exact");
});

test("mapAiStageToStageId case-insensitive match", () => {
  const result = mapAiStageToStageId({
    stageName: "rough-in",
    allowedStages: stages,
  });
  assert.equal(result.stageId, "s3");
  assert.equal(result.confidence, "exact");
});

test("mapAiStageToStageId whitespace normalized match", () => {
  const result = mapAiStageToStageId({
    stageName: "  site   prep  ",
    allowedStages: stages,
  });
  assert.equal(result.stageId, "s2");
  assert.ok(result.confidence === "exact" || result.confidence === "normalized");
});

test("mapAiStageToStageId alias match for Preparation", () => {
  const result = mapAiStageToStageId({
    stageName: "Preparation",
    allowedStages: stages,
  });
  assert.equal(result.stageId, "s2");
  assert.equal(result.confidence, "alias");
  assert.ok(result.warning?.includes("Site Prep") || result.reason?.includes("Site Prep"));
});

test("mapAiStageToStageId alias match for Prep shorthand", () => {
  const result = mapAiStageToStageId({
    stageName: "Prep",
    allowedStages: stages,
  });
  assert.ok(result.stageId === "s1" || result.stageId === "s2");
  assert.equal(result.confidence, "alias");
});

test("mapAiStageToStageId stageIntent fallback", () => {
  const result = mapAiStageToStageId({
    stageName: "Totally Unknown Label",
    stageIntent: "ROUGH_IN",
    allowedStages: stages,
  });
  assert.equal(result.stageId, "s3");
  assert.equal(result.confidence, "intent");
});

test("mapAiStageToStageId unmapped when no match", () => {
  const result = mapAiStageToStageId({
    stageName: "Quantum Flux Capacitor",
    allowedStages: stages,
  });
  assert.equal(result.stageId, null);
  assert.equal(result.confidence, "unmapped");
});

test("mapAiStageToStageId empty allowed stages", () => {
  const result = mapAiStageToStageId({
    stageName: "Rough-In",
    allowedStages: [],
  });
  assert.equal(result.stageId, null);
  assert.equal(result.confidence, "unmapped");
});

test("mapAiStageToStageId prefers stageKey when provided", () => {
  const result = mapAiStageToStageId({
    stageKey: "Site Prep",
    stageName: "Wrong Name",
    allowedStages: stages,
  });
  assert.equal(result.stageId, "s2");
});
