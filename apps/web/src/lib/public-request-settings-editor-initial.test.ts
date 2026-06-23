import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PUBLIC_REQUEST_FORM_TITLE,
  DEFAULT_PUBLIC_REQUEST_INTRO_MESSAGE,
  DEFAULT_PUBLIC_REQUEST_SUBMIT_BUTTON_TEXT,
} from "@/lib/public-request-settings-defaults";
import { resolvePublicRequestSettingsEditorInitial } from "@/lib/public-request-settings-effective";

const updatedAt = new Date("2026-06-23T12:00:00.000Z");

test("resolvePublicRequestSettingsEditorInitial — no row pre-fills default intro", () => {
  const initial = resolvePublicRequestSettingsEditorInitial(null);
  assert.equal(initial.formTitle, DEFAULT_PUBLIC_REQUEST_FORM_TITLE);
  assert.equal(initial.introMessage, DEFAULT_PUBLIC_REQUEST_INTRO_MESSAGE);
  assert.equal(initial.submitButtonText, DEFAULT_PUBLIC_REQUEST_SUBMIT_BUTTON_TEXT);
  assert.equal(initial.formKey, "new");
});

test("resolvePublicRequestSettingsEditorInitial — row with null intro yields empty editor field", () => {
  const initial = resolvePublicRequestSettingsEditorInitial({
    enabled: true,
    formTitle: "Request A Quote",
    introMessage: null,
    emergencyWarningText: null,
    submitButtonText: DEFAULT_PUBLIC_REQUEST_SUBMIT_BUTTON_TEXT,
    instantQuoteEnabled: true,
    showInstantQuoteDetails: true,
    offerings: [],
    updatedAt,
  });
  assert.equal(initial.introMessage, "");
  assert.equal(initial.formTitle, "Request A Quote");
  assert.equal(initial.formKey, updatedAt.toISOString());
});

test("resolvePublicRequestSettingsEditorInitial — row with stored intro matches stored value", () => {
  const storedIntro = "Custom intro for customers.";
  const initial = resolvePublicRequestSettingsEditorInitial({
    enabled: true,
    formTitle: "Custom title",
    introMessage: storedIntro,
    emergencyWarningText: "Emergency text",
    submitButtonText: "Go",
    instantQuoteEnabled: false,
    showInstantQuoteDetails: false,
    offerings: ["repair"],
    updatedAt,
  });
  assert.equal(initial.introMessage, storedIntro);
  assert.equal(initial.emergencyWarningText, "Emergency text");
  assert.equal(initial.submitButtonText, "Go");
  assert.deepEqual(initial.offerings, ["repair"]);
});
