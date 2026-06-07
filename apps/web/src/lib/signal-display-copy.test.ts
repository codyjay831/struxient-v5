import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMissingProviderGapCopy,
  buildProviderTaskTitle,
  getReadableSignalCopy,
  signalLooksSchedulingOrAccessRelated,
} from "./signal-display-copy";

test("getReadableSignalCopy uses known dictionary mappings", () => {
  assert.equal(getReadableSignalCopy("weather.ok_to_proceed"), "weather is okay to proceed");
  assert.equal(getReadableSignalCopy("permit.submitted"), "permit application has been submitted");
  assert.equal(getReadableSignalCopy("inspection.final_passed"), "final inspection has passed");
});

test("getReadableSignalCopy falls back to normalized human text", () => {
  assert.equal(getReadableSignalCopy("custom.signal_name"), "custom signal name");
});

test("buildMissingProviderGapCopy produces contractor-first copy", () => {
  const copy = buildMissingProviderGapCopy(
    "weather.ok_to_proceed",
    "Remove Existing Roof and Install New Roofing System",
  );
  assert.equal(copy.title, "Roof installation is waiting on weather clearance");
  assert.equal(
    copy.explanation,
    "No task currently confirms the weather is safe before roof installation.",
  );
});

test("buildProviderTaskTitle derives weather-specific suggestion", () => {
  assert.equal(
    buildProviderTaskTitle("weather.ok_to_proceed", "Install new roof system"),
    "Confirm weather clearance before roof installation",
  );
});

test("signalLooksSchedulingOrAccessRelated identifies scheduling-like keys", () => {
  assert.equal(signalLooksSchedulingOrAccessRelated("weather.ok_to_proceed"), true);
  assert.equal(signalLooksSchedulingOrAccessRelated("site.access.confirmed"), true);
  assert.equal(signalLooksSchedulingOrAccessRelated("install.completed"), false);
});
