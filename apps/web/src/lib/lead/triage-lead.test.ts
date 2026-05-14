import assert from "node:assert/strict";
import test from "node:test";
import { triageLead } from "./triage-lead";

test("triageLead identifies urgency as HIGH for emergency keywords", async () => {
  const input = {
    title: "Emergency leak",
    contact: { name: "John" },
    request: { scope: "Water is everywhere" },
  };

  const signals = await triageLead(input as Parameters<typeof triageLead>[0], "org_123");
  assert.equal(signals.urgencyHint, "HIGH");
});

test("triageLead identifies urgency as LOW for normal requests", async () => {
  const input = {
    title: "Routine maintenance",
    contact: { name: "John" },
    request: { scope: "Check the roof next month" },
  };

  const signals = await triageLead(input as Parameters<typeof triageLead>[0], "org_123");
  assert.equal(signals.urgencyHint, "LOW");
});
