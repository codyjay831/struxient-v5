import assert from "node:assert/strict";
import test from "node:test";
import {
  buildQuoteScopeCaptureContext,
  buildQuoteScopeContextSections,
  serializeQuoteScopeContextSectionsForAi,
} from "./quote-scope-capture-context";
import type { CommercialContext } from "./commercial-context";

const baseContext: CommercialContext = {
  organizationId: "org-1",
  quoteId: "quote-1",
  leadId: "lead-1",
  customer: {
    id: "customer-1",
    displayName: "Acme",
    email: "owner@example.com",
    phone: "555-111-2222",
    notes: "Customer prefers morning appointments.",
    provenance: "customer_record",
  },
  contact: {
    name: "Owner",
    companyName: "Acme",
    email: "owner@example.com",
    phone: "555-111-2222",
    provenance: "lead_intake",
  },
  serviceLocation: {
    id: "svc-1",
    line: "123 Main St",
    detailsStatus: "VERIFIED",
    apn: null,
    utilityName: null,
    jurisdictionName: null,
    provenance: "service_location_record",
  },
  leadRequest: {
    requestType: "Electrical",
    scopeSummary: "EV charger install",
    neededByBucket: null,
    neededByDateIso: null,
    rawRequestJson: {},
  },
  leadNotes: {
    customerProvidedLines: ["Request Type: Electrical", "What you need help with: Install charger"],
    customerRawNotes: "Need it done before next month",
    internalSalesNotes: "Potential upsell if panel is undersized.",
    isPublicIntake: true,
  },
  latestVisit: null,
  quote: {
    status: "DRAFT",
    title: "Quote",
    internalNotes: "Customer wants Tesla wall connector",
    lineItems: [],
  },
  businessProfile: null,
};

test("buildQuoteScopeCaptureContext merges capture text and stored sources", () => {
  const context = buildQuoteScopeCaptureContext({
    captureText: "Need 240V charger in garage",
    commercialContext: baseContext,
    selectedSourceTypes: ["LEAD_REQUEST", "CUSTOMER_NOTES", "QUOTE_INTERNAL_NOTES"],
  });

  assert.ok(context);
  assert.match(context!, /Quick Scope typed\/pasted work description/i);
  assert.match(
    context!,
    /Internal quote notes \(staff only\):\nCustomer wants Tesla wall connector/,
  );
  assert.match(context!, /Lead request \/ requested work/i);
  assert.match(context!, /Customer notes \(staff only\):\nCustomer prefers morning appointments/);
  assert.doesNotMatch(context!, /Lead scope summary/i);
});

test("buildQuoteScopeCaptureContext omits empty internal quote notes even when included", () => {
  const context = buildQuoteScopeCaptureContext({
    captureText: "Panel upgrade",
    commercialContext: {
      ...baseContext,
      quote: {
        ...baseContext.quote,
        internalNotes: "   ",
      },
    },
    selectedSourceTypes: ["QUOTE_INTERNAL_NOTES"],
  });

  assert.ok(context);
  assert.doesNotMatch(context!, /Internal quote notes/i);
});

test("buildQuoteScopeCaptureContext respects explicit selected source types", () => {
  const context = buildQuoteScopeCaptureContext({
    captureText: "Panel upgrade",
    commercialContext: {
      ...baseContext,
      quote: {
        ...baseContext.quote,
        internalNotes: "Should not appear",
      },
      leadNotes: {
        customerProvidedLines: ["Should not appear"],
        customerRawNotes: "Should not appear either",
        internalSalesNotes: null,
        isPublicIntake: false,
      },
    },
    selectedSourceTypes: [],
  });

  assert.ok(context);
  assert.match(context!, /Quick Scope typed\/pasted work description/i);
  assert.doesNotMatch(context!, /Internal quote notes/i);
  assert.doesNotMatch(context!, /Company intake notes/i);
});

test("buildQuoteScopeCaptureContext returns undefined when empty", () => {
  const context = buildQuoteScopeCaptureContext({
    captureText: "   ",
    commercialContext: {
      ...baseContext,
      quote: {
        ...baseContext.quote,
        internalNotes: null,
      },
      leadRequest: {
        ...baseContext.leadRequest!,
        requestType: null,
        scopeSummary: null,
      },
      leadNotes: {
        customerProvidedLines: [],
        customerRawNotes: null,
        internalSalesNotes: null,
        isPublicIntake: false,
      },
    },
    selectedSourceTypes: [],
  });
  assert.equal(context, undefined);
});

test("buildQuoteScopeContextSections separates requested work, customer notes, and company notes", () => {
  const sections = buildQuoteScopeContextSections({
    ...baseContext,
    leadNotes: {
      customerProvidedLines: [],
      customerRawNotes: null,
      internalSalesNotes: "Office note: ask about panel clearance.",
      isPublicIntake: false,
    },
  });

  const request = sections.find((section) => section.sourceType === "LEAD_REQUEST");
  const customer = sections.find((section) => section.sourceType === "CUSTOMER_NOTES");
  const company = sections.find((section) => section.sourceType === "COMPANY_INTAKE_NOTES");

  assert.equal(request?.label, "Lead request / requested work");
  assert.match(request?.body ?? "", /Requested work:\nEV charger install/);
  assert.equal(customer?.label, "Customer notes");
  assert.match(customer?.body ?? "", /morning appointments/);
  assert.equal(company?.label, "Company intake notes");
  assert.match(company?.body ?? "", /panel clearance/);
});

test("empty customer notes are disabled metadata and omitted from AI serialization", () => {
  const sections = buildQuoteScopeContextSections({
    ...baseContext,
    customer: {
      ...baseContext.customer,
      notes: null,
    },
  });
  const customer = sections.find((section) => section.sourceType === "CUSTOMER_NOTES");
  assert.ok(customer);
  assert.equal(customer!.isEmpty, true);
  assert.equal(customer!.isIncluded, false);
  assert.equal(customer!.emptyLabel, "No customer notes saved.");

  const serialized = serializeQuoteScopeContextSectionsForAi([customer!]);
  assert.equal(serialized, undefined);
});
