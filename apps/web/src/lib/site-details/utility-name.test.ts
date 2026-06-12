import assert from "node:assert/strict";
import test from "node:test";
import {
  buildElectricUtilityNameAliases,
  canonicalizeElectricUtilityName,
} from "@/lib/site-details/utility-name";

test("canonicalizes PG&E utility aliases", () => {
  assert.equal(canonicalizeElectricUtilityName("PGE"), "PG&E");
  assert.equal(canonicalizeElectricUtilityName("Pacific Gas & Electric"), "PG&E");
  assert.equal(canonicalizeElectricUtilityName("Pacific Gas and Electric Company"), "PG&E");
  assert.equal(
    canonicalizeElectricUtilityName("Pacific Gas and Electric Company (PG&E)"),
    "PG&E",
  );
  assert.equal(canonicalizeElectricUtilityName("Pacific Gas and Electric Company / PG&E"), "PG&E");
  assert.equal(canonicalizeElectricUtilityName("Pacific Gas and Electric (PG&E)"), "PG&E");
});

test("builds utility alias set for PG&E", () => {
  const aliases = buildElectricUtilityNameAliases("Pacific Gas and Electric Company (PG&E)");
  assert.ok(aliases.includes("PG&E"));
  assert.ok(aliases.includes("PGE"));
  assert.ok(aliases.includes("Pacific Gas & Electric"));
});
