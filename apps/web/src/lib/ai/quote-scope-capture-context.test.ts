import assert from "node:assert/strict";
import test from "node:test";
import { buildQuoteScopeCaptureContext } from "./quote-scope-capture-context";
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
    sources: {
      includeIntakeNotes: true,
      includeInternalQuoteNotes: true,
      includeScopeSummary: true,
    },
  });

  assert.ok(context);
  assert.match(context!, /Work description/i);
  assert.match(context!, /Internal quote notes/i);
  assert.match(context!, /Lead scope summary/i);
  assert.match(context!, /Customer-provided intake fields/i);
});

test("buildQuoteScopeCaptureContext respects source opt-out flags", () => {
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
    sources: {
      includeIntakeNotes: false,
      includeInternalQuoteNotes: false,
      includeScopeSummary: false,
    },
  });

  assert.ok(context);
  assert.match(context!, /Work description/i);
  assert.doesNotMatch(context!, /Internal quote notes/i);
  assert.doesNotMatch(context!, /Intake/i);
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
        scopeSummary: null,
      },
      leadNotes: {
        customerProvidedLines: [],
        customerRawNotes: null,
        internalSalesNotes: null,
        isPublicIntake: false,
      },
    },
    sources: {
      includeIntakeNotes: false,
      includeInternalQuoteNotes: false,
      includeScopeSummary: false,
    },
  });
  assert.equal(context, undefined);
});
