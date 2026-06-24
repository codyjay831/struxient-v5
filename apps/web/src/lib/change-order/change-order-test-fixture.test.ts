import assert from "node:assert/strict";
import test from "node:test";
import {
  failIntegrationTestIfMisconfigured,
  getIntegrationTestSkipReason,
} from "./change-order-test-fixture";

test("local env without DATABASE_URL returns skip reason", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalCi = process.env.CI;
  delete process.env.DATABASE_URL;
  delete process.env.CI;
  try {
    const reason = getIntegrationTestSkipReason();
    assert.ok(reason);
    assert.match(reason, /DATABASE_URL/i);
  } finally {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalCi === undefined) delete process.env.CI;
    else process.env.CI = originalCi;
  }
});

test("CI without DATABASE_URL fails loudly", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalCi = process.env.CI;
  delete process.env.DATABASE_URL;
  process.env.CI = "true";
  try {
    assert.throws(
      () => failIntegrationTestIfMisconfigured(getIntegrationTestSkipReason()),
      /CI misconfiguration/i,
    );
  } finally {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalCi === undefined) delete process.env.CI;
    else process.env.CI = originalCi;
  }
});
