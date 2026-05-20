import assert from "node:assert/strict";
import test from "node:test";
import { LeadChannel } from "@prisma/client";
import { mapIntakeFormDataToLeadInput } from "./map-intake-form-data-to-lead-input";

test("mapIntakeFormDataToLeadInput maps public intake and request type labels", () => {
  const formData = new FormData();
  formData.set("contactName", "Pat");
  formData.set("email", "pat@example.com");
  formData.set("requestType", "repair");
  formData.set("requestDetails", "Leak in ceiling");
  formData.set("serviceAddress", "123 Main St");
  formData.set("neededByBucket", "ASAP");
  formData.set("requestedVisitWindow", "MORNING");
  formData.set("attachmentIds", "a1,a2");

  const mapped = mapIntakeFormDataToLeadInput({
    formData,
    surfaceMode: "public",
    fallbackChannel: LeadChannel.WEB_FORM,
    requestTypeOptions: [{ value: "repair", label: "Repair" }],
    requireRequestTypeMatch: true,
    publicClientKey: "a10f95f4-c253-47fd-a546-ce9e8ce927f6",
  });

  assert.equal(mapped.ok, true);
  if (!mapped.ok) {
    return;
  }
  assert.equal(mapped.input.channel, "WEB_FORM");
  assert.equal(mapped.input.request.type, "Repair");
  assert.equal(mapped.input.request.neededByBucket, "ASAP");
  assert.equal(mapped.input.attachmentIds?.length, 2);
  assert.equal(mapped.input.publicClientKey, "a10f95f4-c253-47fd-a546-ce9e8ce927f6");
  assert.equal(mapped.requestTypeValue, "repair");
});

test("mapIntakeFormDataToLeadInput maps staff intake internal details", () => {
  const formData = new FormData();
  formData.set("contactName", "Office lead");
  formData.set("requestType", "inspection");
  formData.set("requestDetails", "Need full inspection");
  formData.set("source", "PHONE");
  formData.set("sourceDetail", "Front desk call");
  formData.set("internalNote", "VIP referral");
  formData.set("suggestedTemplateIds", "t1,t2");
  formData.set("serviceAddress", "45 Jobsite Ave");

  const mapped = mapIntakeFormDataToLeadInput({
    formData,
    surfaceMode: "staff",
    fallbackChannel: LeadChannel.MANUAL,
    requestTypeOptions: [{ value: "inspection", label: "Inspection" }],
  });

  assert.equal(mapped.ok, true);
  if (!mapped.ok) {
    return;
  }
  assert.equal(mapped.input.channel, "PHONE");
  assert.equal(mapped.input.request.type, "Inspection");
  assert.equal(mapped.input.request.suggestedTemplateIds?.length, 2);
  assert.equal(mapped.input.notes, "VIP referral");
  assert.equal(mapped.input.sourceDetail, "Front desk call");
});

test("mapIntakeFormDataToLeadInput rejects empty public request type", () => {
  const formData = new FormData();
  formData.set("contactName", "Pat");
  formData.set("email", "pat@example.com");
  formData.set("requestDetails", "Need help");
  formData.set("serviceAddress", "123 Main St");
  formData.set("requestType", "");

  const mapped = mapIntakeFormDataToLeadInput({
    formData,
    surfaceMode: "public",
    fallbackChannel: LeadChannel.WEB_FORM,
    requestTypeOptions: [{ value: "repair", label: "Repair" }],
    requireRequestTypeMatch: true,
  });

  assert.equal(mapped.ok, false);
  if (mapped.ok) return;
  assert.equal(mapped.error, "Please select what you need help with.");
});
