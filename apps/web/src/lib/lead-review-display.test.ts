import assert from "node:assert/strict";
import test from "node:test";
import { LeadChannel, NeededByBucket } from "@prisma/client";
import {
  buildLeadReviewDisplay,
  buildLeadReviewContextLine,
  resolveCustomerPrimaryJobsiteLine,
  resolveLeadPrimaryName,
  resolveLeadScopeLabel,
} from "./lead-review-display";
import { buildLeadReviewViewModel } from "./lead-review-view-model";

const baseLead = {
  title: "Estimate / quote — Jane Doe",
  contactName: "Jane Doe",
  companyName: "",
  email: "jane@example.com",
  phone: "5551234567",
  channel: LeadChannel.MANUAL,
  jobsiteAddressLine: "123 Main St, Austin TX",
  scopeSummary: "Replace front door",
  requestType: "Estimate / quote",
  serviceLocationId: null as string | null,
  isAddressVerified: true,
  isAddressQuoteReady: true,
};

function reviewVm() {
  return buildLeadReviewViewModel({
    leadId: "lead_1",
    channel: LeadChannel.MANUAL,
    notes: null,
    requestType: "Estimate / quote",
    scopeSummary: "Replace front door",
    neededByBucket: NeededByBucket.ASAP,
    neededByDate: null,
    requestJson: {
      type: "Estimate / quote",
      neededByBucket: NeededByBucket.ASAP,
      neededByDate: null,
      scope: "Replace front door",
    },
    signalsJson: {},
    contactName: "Jane Doe",
    companyName: null,
    email: "jane@example.com",
    phone: "5551234567",
    jobsiteAddressLine: "123 Main St, Austin TX",
    isAddressVerified: true,
    attachments: [],
    events: [],
    visitRequests: [],
  });
}

function baseInput(overrides: Partial<Parameters<typeof buildLeadReviewDisplay>[0]> = {}) {
  return {
    entryPoint: "record" as const,
    lead: baseLead,
    customer: null,
    reviewViewModel: reviewVm(),
    serviceAddressContext: { customer: null },
    ...overrides,
  };
}

test("resolveLeadPrimaryName prefers linked customer", () => {
  const name = resolveLeadPrimaryName({
    ...baseInput(),
    customer: { displayName: "James Customer LLC" },
  });
  assert.equal(name, "James Customer LLC");
});

test("resolveLeadScopeLabel returns scope not fused title", () => {
  const scope = resolveLeadScopeLabel(baseInput());
  assert.equal(scope, "Replace front door");
});

test("buildLeadReviewContextLine dedupes work context without contact name", () => {
  const line = buildLeadReviewContextLine(baseInput());
  assert.ok(line?.includes("Replace front door"));
  assert.ok(line?.includes("123 Main St"));
  assert.equal(line?.includes("Jane Doe"), false);
});

test("record context suppresses header-promoted request fields", () => {
  const display = buildLeadReviewDisplay(baseInput());

  assert.equal(display.showSurfaceHeader, false);
  assert.equal(display.compactHeader, null);
  assert.equal(display.primaryName, "Jane Doe");
  assert.equal(
    display.requestDetailFields.some((f) => f.label === "What they need"),
    false,
  );
  assert.equal(
    display.requestDetailFields.some((f) => f.label === "Timing"),
    false,
  );
  assert.ok(display.requestDetailFields.some((f) => f.label === "Request type"));
  assert.ok(display.requestDetailFields.some((f) => f.label === "Source"));
  assert.equal(display.siteDetails.showAddressLine, false);
});

test("sales_modal context keeps compact header and suppresses source in details", () => {
  const display = buildLeadReviewDisplay({
    ...baseInput(),
    entryPoint: "sales_modal",
  });

  assert.equal(display.showSurfaceHeader, true);
  assert.equal(display.compactHeader?.title, "Replace front door");
  assert.ok(display.compactHeader?.subtitle?.includes("123 Main St"));
  assert.equal(display.compactHeader?.metaLine, "Manual");
  assert.equal(
    display.requestDetailFields.some((f) => f.label === "Source"),
    false,
  );
});

test("unlinked lead shows contact section", () => {
  const display = buildLeadReviewDisplay(baseInput());
  assert.equal(display.contactSection.show, true);
  assert.equal(display.contactSection.name, "Jane Doe");
  assert.equal(display.customerReachabilityLine, null);
});

test("linked customer hides contact section and exposes reachability line", () => {
  const display = buildLeadReviewDisplay({
    ...baseInput(),
    customer: { displayName: "Jane Doe" },
  });
  assert.equal(display.contactSection.show, false);
  assert.equal(display.customerReachabilityLine, "jane@example.com · 5551234567");
});

test("jobsite differs from customer primary", () => {
  const display = buildLeadReviewDisplay({
    ...baseInput(),
    customer: { displayName: "Jane Doe" },
    serviceAddressContext: {
      customer: {
        serviceLocations: [
          {
            formattedAddress: "9 Oak Ave, Austin TX",
            addressLine1: "9 Oak Ave",
            isPrimary: true,
          },
        ],
      },
    },
  });
  assert.equal(display.jobsiteSection.differsFromCustomerPrimary, true);
  assert.equal(display.jobsiteSection.primaryJobsiteLine, "9 Oak Ave, Austin TX");
});

test("address resolve shows when unlinked and not quote-ready", () => {
  const display = buildLeadReviewDisplay({
    ...baseInput(),
    lead: {
      ...baseLead,
      isAddressQuoteReady: false,
      isAddressVerified: false,
    },
  });
  assert.equal(display.addressResolve.show, true);
  assert.equal(display.addressResolve.placement, "prominent");
});

test("address resolve hidden when customer linked", () => {
  const display = buildLeadReviewDisplay({
    ...baseInput(),
    customer: { displayName: "Jane Doe" },
    lead: { ...baseLead, isAddressQuoteReady: false, isAddressVerified: false },
    serviceAddressContext: {
      customer: {
        serviceLocations: [
          {
            formattedAddress: "123 Main St, Austin TX",
            addressLine1: "123 Main St",
            isPrimary: true,
          },
        ],
      },
    },
  });
  assert.equal(display.addressResolve.show, false);
});

test("site details placeholder when jobsite exists without service location", () => {
  const display = buildLeadReviewDisplay(baseInput());
  assert.equal(display.siteDetails.showRow, false);
  assert.equal(display.siteDetails.showPlaceholder, true);
});

test("site details row when service location linked", () => {
  const display = buildLeadReviewDisplay({
    ...baseInput(),
    lead: { ...baseLead, serviceLocationId: "loc_1" },
  });
  assert.equal(display.siteDetails.showRow, true);
  assert.equal(display.siteDetails.showPlaceholder, false);
});

test("resolveCustomerPrimaryJobsiteLine prefers primary flag", () => {
  const line = resolveCustomerPrimaryJobsiteLine({
    customer: {
      serviceLocations: [
        { formattedAddress: "Secondary", addressLine1: "Secondary", isPrimary: false },
        { formattedAddress: "Primary St", addressLine1: "Primary St", isPrimary: true },
      ],
    },
  });
  assert.equal(line, "Primary St");
});
