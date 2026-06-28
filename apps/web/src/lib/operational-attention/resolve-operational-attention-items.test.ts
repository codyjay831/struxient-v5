import assert from "node:assert/strict";
import test from "node:test";
import {
  attentionResolverContextFixture,
  changeOrderSendAttentionFixture,
  operationalAttentionFixtures,
  quoteActivationAttentionFixture,
  unreadableCommercialAttentionFixture,
} from "./test-fixtures";
import { resolveOperationalAttentionItems } from "./resolve-operational-attention-items";

test("resolveOperationalAttentionItems returns readable input items in deterministic order", () => {
  const result = resolveOperationalAttentionItems(attentionResolverContextFixture, {
    items: [
      quoteActivationAttentionFixture,
      unreadableCommercialAttentionFixture,
      changeOrderSendAttentionFixture,
    ],
  });

  assert.deepEqual(
    result.items.map((item) => item.id),
    [quoteActivationAttentionFixture.id, changeOrderSendAttentionFixture.id],
  );
  assert.deepEqual(result.diagnostics, []);
});

test("resolveOperationalAttentionItems can include unreadable items for diagnostics/tests", () => {
  const result = resolveOperationalAttentionItems(attentionResolverContextFixture, {
    items: [quoteActivationAttentionFixture, unreadableCommercialAttentionFixture],
    includeUnreadable: true,
  });

  assert.deepEqual(
    result.items.map((item) => item.id),
    [quoteActivationAttentionFixture.id, unreadableCommercialAttentionFixture.id],
  );
});

test("resolveOperationalAttentionItems defaults to an empty deterministic shell", () => {
  const result = resolveOperationalAttentionItems(attentionResolverContextFixture);

  assert.deepEqual(result, {
    items: [],
    diagnostics: [],
  });
});

test("resolveOperationalAttentionItems does not mutate input array or items", () => {
  const inputItems = [...operationalAttentionFixtures];
  const originalIds = inputItems.map((item) => item.id);
  const originalDisabledReason = changeOrderSendAttentionFixture.safeNextAction.disabledReason;

  const result = resolveOperationalAttentionItems(attentionResolverContextFixture, {
    items: inputItems,
  });

  assert.notEqual(result.items, inputItems);
  assert.deepEqual(inputItems.map((item) => item.id), originalIds);
  assert.equal(changeOrderSendAttentionFixture.safeNextAction.disabledReason, originalDisabledReason);
});
