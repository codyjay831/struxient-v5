import assert from "node:assert/strict";
import test from "node:test";
import {
  customerMatchHintsForLead,
  findCustomerMatchHints,
  hasBlockingCustomerMatch,
} from "./lead-customer-match-hints";
import {
  evaluateCustomerMatchGate,
  shouldBlockQuotePromotionForCustomerMatch,
} from "./lead-customer-match-gate";

const customers = [
  {
    id: "cust-1",
    displayName: "Acme Solar",
    companyName: "Acme Solar LLC",
    email: "pat@example.com",
    phone: "55501001234",
  },
  {
    id: "cust-2",
    displayName: "Beta Electric",
    companyName: null,
    email: "other@example.com",
    phone: "5559999999",
  },
];

test("exact email match blocks promotion for unlinked lead", () => {
  const hints = evaluateCustomerMatchGate({
    customerId: null,
    email: "Pat@Example.com",
    phone: null,
    orgCustomers: customers,
  });
  assert.equal(hasBlockingCustomerMatch(hints), true);
  assert.equal(
    shouldBlockQuotePromotionForCustomerMatch({ customerId: null, hints }),
    true,
  );
  if (hints.kind === "checked") {
    assert.equal(hints.matches.length, 1);
    assert.equal(hints.matches[0]?.matchOn, "email");
  }
});

test("exact phone match blocks promotion for unlinked lead", () => {
  const hints = evaluateCustomerMatchGate({
    customerId: null,
    email: null,
    phone: "(555) 010-01234",
    orgCustomers: customers,
  });
  assert.equal(hasBlockingCustomerMatch(hints), true);
  if (hints.kind === "checked") {
    assert.equal(hints.matches[0]?.matchOn, "phone");
  }
});

test("no contact info skips match scan", () => {
  const hints = evaluateCustomerMatchGate({
    customerId: null,
    email: null,
    phone: null,
    orgCustomers: customers,
  });
  assert.equal(hints.kind, "skipped-no-contact");
  assert.equal(hasBlockingCustomerMatch(hints), false);
});

test("linked lead skips match gate", () => {
  const hints = evaluateCustomerMatchGate({
    customerId: "cust-1",
    email: "pat@example.com",
    phone: "55501001234",
    orgCustomers: customers,
  });
  assert.equal(hints.kind, "skipped-no-contact");
});

test("company name alone does not produce a match", () => {
  const hints = findCustomerMatchHints(
    customers,
    null,
    null,
    500,
  );
  assert.equal(hints.kind, "skipped-no-contact");

  const nameOnly = customerMatchHintsForLead(customers, null, null);
  assert.equal(hasBlockingCustomerMatch(nameOnly), false);
});

test("both email and phone match reports both", () => {
  const hints = customerMatchHintsForLead(customers, "pat@example.com", "55501001234");
  if (hints.kind === "checked") {
    assert.equal(hints.matches[0]?.matchOn, "both");
  } else {
    assert.fail("expected checked hints");
  }
});
