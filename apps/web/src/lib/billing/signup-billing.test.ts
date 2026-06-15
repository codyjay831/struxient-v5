import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";

const signupSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(120),
  acceptTerms: z
    .boolean()
    .refine((value) => value === true, "You must accept the terms to create an account."),
});

describe("signup schema", () => {
  it("requires terms acceptance", () => {
    const result = signupSchema.safeParse({
      companyName: "Acme Solar",
      name: "Cody",
      email: "owner@example.com",
      password: "password123",
      acceptTerms: false,
    });
    assert.equal(result.success, false);
  });

  it("accepts valid signup payload", () => {
    const result = signupSchema.safeParse({
      companyName: "Acme Solar",
      name: "Cody",
      email: "owner@example.com",
      password: "password123",
      acceptTerms: true,
    });
    assert.equal(result.success, true);
  });
});
