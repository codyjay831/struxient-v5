import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeQuickScopeLineTitle } from "./quick-scope-title-guardrails";

test("sanitizeQuickScopeLineTitle strips bracket labels and marketing suffixes", () => {
  const result = sanitizeQuickScopeLineTitle("[Hero] 200A Service Upgrade (Smart System)");
  assert.equal(result, "200A Service Upgrade");
});

test("sanitizeQuickScopeLineTitle removes ungrounded feature terms", () => {
  const result = sanitizeQuickScopeLineTitle("Advanced Smart Electrical Panel Upgrade", {
    groundingText: "Customer wants a 200 amp panel upgrade.",
  });
  assert.equal(result, "Electrical Panel Upgrade");
});

test("sanitizeQuickScopeLineTitle preserves grounded smart wording when requested", () => {
  const result = sanitizeQuickScopeLineTitle("Smart Panel Upgrade With Monitoring", {
    groundingText: "Customer wants a smart electrical panel with monitoring.",
  });
  assert.equal(result, "Smart Panel Upgrade With Monitoring");
});

test("sanitizeQuickScopeLineTitle preserves normal contractor title", () => {
  const result = sanitizeQuickScopeLineTitle("Main Electrical Service Upgrade");
  assert.equal(result, "Main Electrical Service Upgrade");
});

test("sanitizeQuickScopeLineTitle uses safe fallback when title is stripped to empty", () => {
  const result = sanitizeQuickScopeLineTitle("[Hero] (Premium)");
  assert.equal(result, "Scope Item");
});
