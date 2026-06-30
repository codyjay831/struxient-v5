import assert from "node:assert/strict";
import test from "node:test";
import type { QuoteScopeContextSection } from "@/lib/ai/quote-scope-capture-context";
import {
  isClarifyScopeCustomerProposalRoute,
  reviewClarifyScopeQuestionSet,
  type ClarifyScopeQuestionReview,
} from "./clarification-context-review";
import type { ClarificationQuestionSet } from "./clarification-types";

const evContextSections: QuoteScopeContextSection[] = [
  {
    sourceType: "LEAD_REQUEST",
    label: "Lead request / requested work",
    body: "Requested work:\nHomeowner wants a permitted EV charger installation in attached garage.",
    sourceId: "lead-1",
    sourceModel: "Lead.request",
    visibility: "CUSTOMER_STATED",
    isEmpty: false,
    isIncluded: true,
    requiresSave: false,
  },
  {
    sourceType: "COMPANY_INTAKE_NOTES",
    label: "Company intake notes",
    body:
      "Main panel appears to be 200A. Charger location inside attached garage. Approximate run 35-45 ft. Garage is finished drywall and customer wants clean-looking install. Load calculation is needed. Outlet troubleshooting mentioned as optional add-on.",
    sourceId: "lead-1",
    sourceModel: "Lead.signals.notes",
    visibility: "STAFF_ONLY",
    isEmpty: false,
    isIncluded: true,
    requiresSave: false,
  },
  {
    sourceType: "QUOTE_INTERNAL_NOTES",
    label: "Internal quote notes",
    body: "No charger supplied-by/model confirmed yet.",
    sourceId: "quote-1",
    sourceModel: "Quote.internalNotes",
    visibility: "STAFF_ONLY",
    isEmpty: false,
    isIncluded: true,
    requiresSave: true,
  },
];

const evSet: ClarificationQuestionSet = {
  key: "electrical.ev_charger",
  version: 1,
  label: "EV charger clarifications",
  status: "active",
  aliases: [],
  questions: [
    {
      key: "ev.permit_required",
      label: "Do you require a permitted installation?",
      inputType: "yes_no_unknown",
      customerFacing: true,
    },
    {
      key: "ev.panel_amperage",
      label: "What is the amperage rating of your main electrical panel?",
      inputType: "single_choice",
      customerFacing: true,
      options: [
        { key: "100a", label: "100A" },
        { key: "200a", label: "200A" },
      ],
    },
    {
      key: "ev.breaker_spaces",
      label: "Does your main electrical panel have available breaker spaces?",
      inputType: "yes_no_unknown",
      customerFacing: true,
    },
    {
      key: "ev.load_calculation",
      label: "Do you require a load calculation?",
      inputType: "yes_no_unknown",
      customerFacing: true,
    },
    {
      key: "ev.charger_location",
      label: "Where should the charger be installed?",
      inputType: "short_text",
      customerFacing: true,
    },
    {
      key: "ev.run_length",
      label: "Approximate wire run distance",
      inputType: "number",
      unit: "ft",
      customerFacing: false,
    },
    {
      key: "ev.finish_choice",
      label: "Concealed wiring or surface conduit for the finished drywall garage?",
      inputType: "single_choice",
      customerFacing: true,
      options: [
        { key: "concealed", label: "Concealed wiring" },
        { key: "conduit", label: "Surface conduit" },
      ],
    },
    {
      key: "ev.outlet_troubleshooting",
      label: "Include outlet troubleshooting?",
      inputType: "yes_no_unknown",
      customerFacing: true,
    },
    {
      key: "ev.charger_model",
      label: "Charger model and supplied-by",
      inputType: "short_text",
      customerFacing: true,
    },
    {
      key: "ev.wifi",
      label: "Is Wi-Fi available at the charger location?",
      inputType: "yes_no_unknown",
      customerFacing: true,
    },
  ],
};

function reviewFor(key: string): ClarifyScopeQuestionReview {
  const review = reviewClarifyScopeQuestionSet(evSet, evContextSections);
  const item = review.questionReviews.find((candidate) => candidate.questionKey === key);
  assert.ok(item, `Expected review for ${key}`);
  return item;
}

test("EV permitted installation is answered from saved context, not active customer ask", () => {
  const item = reviewFor("ev.permit_required");
  assert.equal(item.route, "ANSWERED");
  assert.deepEqual(item.prefill, { kind: "choice", optionKeys: ["yes"] });
});

test("EV panel amperage is prefilled and routed to site verification", () => {
  const item = reviewFor("ev.panel_amperage");
  assert.equal(item.route, "VERIFY_ONSITE");
  assert.deepEqual(item.prefill, { kind: "choice", optionKeys: ["200a"] });
  assert.equal(item.prefillLabel, "Appears to be 200A");
});

test("EV breaker spaces default to staff/site verification when unknown", () => {
  const item = reviewFor("ev.breaker_spaces");
  assert.equal(item.route, "VERIFY_ONSITE");
});

test("EV load calculation is staff/code verification, not customer preference", () => {
  const item = reviewFor("ev.load_calculation");
  assert.equal(item.route, "VERIFY_ONSITE");
  assert.deepEqual(item.prefill, { kind: "choice", optionKeys: ["yes"] });
  assert.equal(isClarifyScopeCustomerProposalRoute(item.route), false);
});

test("EV charger location and run are answered from saved context", () => {
  assert.equal(reviewFor("ev.charger_location").route, "ANSWERED");
  assert.deepEqual(reviewFor("ev.charger_location").prefill, {
    kind: "text",
    text: "attached garage",
  });
  assert.equal(reviewFor("ev.run_length").route, "ANSWERED");
  assert.deepEqual(reviewFor("ev.run_length").prefill, {
    kind: "number",
    value: 40,
    unit: "ft",
  });
});

test("EV finish and outlet troubleshooting become quote options", () => {
  assert.equal(reviewFor("ev.finish_choice").route, "QUOTE_OPTION");
  assert.equal(reviewFor("ev.outlet_troubleshooting").route, "QUOTE_OPTION");
});

test("EV charger supplied-by/model remains active when unknown", () => {
  const item = reviewFor("ev.charger_model");
  assert.equal(item.route, "ASK_CUSTOMER");
  assert.equal(item.prefill, undefined);
});

test("EV Wi-Fi is suppressed unless smart charger setup is included", () => {
  assert.equal(reviewFor("ev.wifi").route, "REMOVE");

  const review = reviewClarifyScopeQuestionSet(evSet, [
    ...evContextSections,
    {
      ...evContextSections[1],
      body: "Smart charger app setup is included.",
    },
  ]);
  assert.equal(
    review.questionReviews.find((item) => item.questionKey === "ev.wifi")?.route,
    "ASK_CUSTOMER",
  );
});
