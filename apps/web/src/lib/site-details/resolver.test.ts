import assert from "node:assert/strict";
import test from "node:test";
import { SiteDetailsStatus } from "@prisma/client";
import {
  pickHigherPriorityStatus,
  materialAddressChanged,
} from "@/lib/site-details/resolver";

test("pickHigherPriorityStatus prefers user corrected over database", () => {
  const result = pickHigherPriorityStatus(
    SiteDetailsStatus.DATABASE_MATCH,
    SiteDetailsStatus.USER_CORRECTED,
  );
  assert.equal(result, SiteDetailsStatus.USER_CORRECTED);
});

test("materialAddressChanged detects postal code change", () => {
  const changed = materialAddressChanged(
    {
      formattedAddress: "123 Main St",
      addressLine1: "123 Main St",
      city: "SF",
      state: "CA",
      postalCode: "94107",
      country: "US",
    },
    {
      postalCode: "94108",
    },
  );
  assert.equal(changed, true);
});

test("materialAddressChanged ignores identical values", () => {
  const changed = materialAddressChanged(
    {
      formattedAddress: "123 Main St",
      addressLine1: "123 Main St",
      city: "SF",
      state: "CA",
      postalCode: "94107",
      country: "US",
    },
    {
      city: "SF",
    },
  );
  assert.equal(changed, false);
});
