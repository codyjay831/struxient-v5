import assert from "node:assert/strict";
import test from "node:test";
import { LeadChannel, NeededByBucket } from "@prisma/client";
import {
  buildLeadReviewViewModel,
  summarizeLeadEvent,
} from "./lead-review-view-model";

const baseInput = {
  leadId: "lead_1",
  channel: LeadChannel.WEB_FORM,
  notes: null,
  requestType: "Roof repair",
  scopeSummary: "Leak in master bedroom",
  neededByBucket: NeededByBucket.ASAP,
  neededByDate: null,
  requestJson: {
    type: "Roof repair",
    neededByBucket: NeededByBucket.ASAP,
    neededByDate: null,
    scope: "Leak in master bedroom",
  },
  signalsJson: { urgencyHint: "HIGH" as const, sourceDetail: "Public Intake Form" },
  contactName: "Jane Doe",
  companyName: null,
  email: "jane@example.com",
  phone: "5551234567",
  jobsiteAddressLine: "123 Main St, Austin TX",
  isAddressVerified: true,
  attachments: [],
  events: [],
  visitRequests: [],
};

test("buildLeadReviewViewModel prefers structured request fields", () => {
  const vm = buildLeadReviewViewModel(baseInput);
  assert.ok(vm.requestFields.some((f) => f.label === "Request type" && f.value === "Roof repair"));
  assert.ok(vm.requestFields.some((f) => f.label === "What they need"));
  assert.equal(vm.scopeText, "Leak in master bedroom");
  assert.equal(vm.allRequirementsMet, true);
  assert.equal(vm.requirements.every((r) => r.satisfied), true);
});

test("buildLeadReviewViewModel marks missing requirements", () => {
  const vm = buildLeadReviewViewModel({
    ...baseInput,
    email: "",
    readiness: {
      hasIdentity: true,
      hasEmail: false,
      hasPhone: true,
      hasAddress: true,
      isReady: false,
    },
  });
  const email = vm.requirements.find((r) => r.key === "email");
  assert.equal(email?.satisfied, false);
  assert.equal(email?.fixHref, "/leads/lead_1/edit");
  assert.equal(vm.allRequirementsMet, false);
});

test("buildLeadReviewViewModel merges legacy parsed notes only for gaps", () => {
  const notes = `[Public Intake Form]
Service / project location: 9 Oak Ave
Preferred timing: This week
Request type: HVAC
What you need help with: No cooling`;

  const vm = buildLeadReviewViewModel({
    ...baseInput,
    requestType: null,
    scopeSummary: null,
    requestJson: { type: null, neededByBucket: null, neededByDate: null, scope: null },
    notes,
  });

  assert.ok(
    vm.requestFields.some(
      (f) => f.label.toLowerCase().includes("request type") && f.value === "HVAC",
    ),
  );
  assert.ok(vm.showLegacyNotes);
});

test("summarizeLeadEvent does not expose raw payload", () => {
  const s = summarizeLeadEvent("CREATED", { input: { contact: { email: "secret@test.com" } } });
  assert.equal(s.label, "Request received");
  assert.equal(String(s.detail ?? "").includes("secret@test.com"), false);
});

test("summarizeLeadEvent handles known types", () => {
  assert.equal(summarizeLeadEvent("QUOTE_CREATED", {}).label, "Quote started");
  assert.equal(summarizeLeadEvent("CONVERTED_TO_CUSTOMER", {}).label, "Customer created or linked");
});
