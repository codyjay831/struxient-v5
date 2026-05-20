import assert from "node:assert/strict";
import test from "node:test";
import { getLeadCommercialProgress } from "./lead-commercial-progress";

test("NEW + incomplete readiness offers Complete missing details as primary", () => {
  const progress = getLeadCommercialProgress({
    lead: {
      status: "NEW",
      customerId: null,
      contactName: null,
      companyName: null,
      email: null,
      phone: null,
      jobsiteAddressLine: null,
    },
    quotes: [],
  });

  assert.equal(progress.state, "ADD_CONTACT_INFO");
  assert.equal(progress.primaryAction?.kind, "EDIT_CONTACT_INFO");
  assert.equal(progress.primaryAction?.label, "Complete missing details");
  assert.equal(progress.secondaryAction, null);
});

test("NEW + ready offers Start quote as primary", () => {
  const progress = getLeadCommercialProgress({
    lead: {
      status: "NEW",
      customerId: null,
      contactName: "Pat",
      companyName: null,
      email: "pat@example.com",
      phone: "55501001234",
      jobsiteAddressLine: "123 Main St",
      isAddressVerified: true,
    },
    quotes: [],
  });

  assert.equal(progress.state, "READY_FOR_QUOTE");
  assert.equal(progress.primaryAction?.kind, "START_QUOTE");
  assert.equal(progress.primaryAction?.label, "Start quote");
});

test("ADD_CONTACT_INFO favors fix missing info without Start quote anyway", () => {
  const progress = getLeadCommercialProgress({
    lead: {
      status: "QUALIFIED",
      customerId: null,
      contactName: null,
      companyName: null,
      email: null,
      phone: null,
      jobsiteAddressLine: null,
    },
    quotes: [],
  });

  assert.equal(progress.state, "ADD_CONTACT_INFO");
  assert.equal(progress.primaryAction?.kind, "EDIT_CONTACT_INFO");
  assert.equal(progress.primaryAction?.label, "Fix missing info");
  assert.equal(progress.secondaryAction, null);
});

test("CONFLICT_WITH_EXISTING_CUSTOMER does not offer Start quote anyway", () => {
  const progress = getLeadCommercialProgress({
    lead: {
      status: "QUALIFIED",
      customerId: null,
      contactName: "Pat",
      companyName: null,
      email: "pat@example.com",
      phone: "55501001234",
      jobsiteAddressLine: "123 Main St",
      isAddressVerified: true,
    },
    quotes: [],
    hasExistingCustomerMatch: true,
  });

  assert.equal(progress.state, "CONFLICT_WITH_EXISTING_CUSTOMER");
  assert.equal(progress.primaryAction?.kind, "RESOLVE_CUSTOMER_CONFLICT");
  assert.equal(progress.secondaryAction, null);
});

test("READY_FOR_QUOTE offers Start quote as primary", () => {
  const progress = getLeadCommercialProgress({
    lead: {
      status: "QUALIFIED",
      customerId: null,
      contactName: "Pat",
      companyName: null,
      email: "pat@example.com",
      phone: "55501001234",
      jobsiteAddressLine: "123 Main St",
      isAddressVerified: true,
    },
    quotes: [],
  });

  assert.equal(progress.state, "READY_FOR_QUOTE");
  assert.equal(progress.primaryAction?.kind, "START_QUOTE");
});
