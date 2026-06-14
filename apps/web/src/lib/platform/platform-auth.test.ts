import assert from "node:assert/strict";
import test from "node:test";
import { isRevokedAccess } from "./platform-auth";

test("isRevokedAccess returns true when access is null", () => {
  assert.equal(isRevokedAccess(null), true);
});

test("isRevokedAccess returns true when revokedAt is set", () => {
  assert.equal(isRevokedAccess({ revokedAt: new Date() }), true);
});

test("isRevokedAccess returns false for active access", () => {
  assert.equal(isRevokedAccess({ revokedAt: null }), false);
});
