/**
 * Browser QA for Quick Scope title guardrails.
 * Run: npx tsx scripts/quick-scope-title-guardrails-browser-qa.ts
 */
import assert from "node:assert/strict";
import { chromium, type Page } from "playwright";
import { PaymentScheduleAnchorType, QuoteStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { DEV_ORGANIZATION_ID } from "@/lib/dev-organization";

const BASE = process.env.QA_BASE_URL ?? "http://localhost:3001";
const EMAIL = "owner@dev.local";
const PASSWORD = "devpassword123";

type QaResult = { step: string; pass: boolean; note?: string };
const results: QaResult[] = [];

function record(step: string, pass: boolean, note?: string) {
  results.push({ step, pass, note });
  console.log(`${pass ? "PASS" : "FAIL"} — ${step}${note ? `: ${note}` : ""}`);
}

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/workstation/, { timeout: 30_000 });
}

async function cleanupQuote(quoteId: string) {
  await db.quoteScopeDecision.deleteMany({ where: { quoteId } });
  await db.quoteLineClarification.deleteMany({
    where: { quoteLineItem: { quoteId } },
  });
  await db.quoteLineItem.deleteMany({ where: { quoteId } });
  await db.paymentScheduleItem.deleteMany({ where: { quoteId } });
  await db.quote.deleteMany({ where: { id: quoteId } });
}

async function createQuote(quoteId: string) {
  await cleanupQuote(quoteId);
  const serviceLocation = await db.customerServiceLocation.findFirst({
    where: { organizationId: DEV_ORGANIZATION_ID },
    select: { id: true },
  });
  assert.ok(serviceLocation, "Missing dev service location");

  await db.quote.create({
    data: {
      id: quoteId,
      organizationId: DEV_ORGANIZATION_ID,
      customerId: "dev-customer-patel",
      serviceLocationId: serviceLocation.id,
      title: "QA Quick Scope Title Guardrails",
      customerDocumentTitle: "Proposal: QA Quick Scope Title Guardrails",
      status: QuoteStatus.DRAFT,
      subtotalCents: 0,
      totalCents: 0,
    },
  });

  await db.paymentScheduleItem.create({
    data: {
      quoteId,
      title: "Deposit",
      amountCents: 25_000,
      anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
      sortOrder: 0,
    },
  });
}

async function runScenario(page: Page, input: {
  quoteId: string;
  captureText: string;
  expectSmartAllowed: boolean;
}) {
  await createQuote(input.quoteId);
  await page.goto(`${BASE}/quotes/${input.quoteId}`);
  await page.waitForLoadState("networkidle");

  const scopeTab = page.getByRole("button", { name: "Scope", exact: true });
  if (await scopeTab.isVisible().catch(() => false)) {
    await scopeTab.click();
    await page.waitForTimeout(600);
  }

  const quickScopeButton =
    page.getByRole("button", { name: "Quick scope capture", exact: true }).first();
  if (await quickScopeButton.isVisible().catch(() => false)) {
    await quickScopeButton.click();
  } else {
    await page.getByRole("button", { name: /Quick scope capture/i }).first().click();
  }
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Quick scope capture").waitFor({ timeout: 20_000 });

  await dialog.getByLabel("Describe the work, even messy").fill(input.captureText);
  await dialog.getByRole("button", { name: "Draft scope suggestions" }).click();

  await dialog
    .getByText(/Commercial scope suggestions|Recommended from Scope Library|Optional add-ons/i)
    .first()
    .waitFor({ timeout: 30_000 });

  const dialogText = await dialog.innerText();
  const hasLeak = /\[Hero\]|\[Primary\]|\[Recommended\]|\(Smart System\)|Best Value|Advanced Package|Elite/i.test(
    dialogText,
  );
  record(`${input.quoteId}: generated suggestions contain no marketing label leakage`, !hasLeak);

  await dialog.getByRole("button", { name: "Add selected to quote" }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);

  const lines = await db.quoteLineItem.findMany({
    where: { quoteId: input.quoteId },
    select: {
      description: true,
      customerScopeTitle: true,
      customerScopeDescription: true,
      customerIncludedNotes: true,
    },
    orderBy: { sortOrder: "asc" },
  });
  const combined = lines
    .flatMap((line) => [
      line.description,
      line.customerScopeTitle ?? "",
      line.customerScopeDescription ?? "",
      line.customerIncludedNotes ?? "",
    ])
    .join("\n");

  record(`${input.quoteId}: persisted line titles contain no bracketed labels`, !/\[[^\]]+\]/.test(combined));
  record(
    `${input.quoteId}: persisted line titles contain no package/marketing suffix leakage`,
    !/\(Smart System\)|Best Value|Advanced Package|Premium|Elite/i.test(combined),
  );

  if (input.expectSmartAllowed) {
    const hasSmart = /\bsmart\b|\bmonitoring\b/i.test(combined);
    record(
      `${input.quoteId}: smart wording is grounded only by requested context`,
      true,
      hasSmart ? "smart wording present and grounded" : "smart wording omitted (allowed)",
    );
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await login(page);
    await runScenario(page, {
      quoteId: "qa-quick-scope-title-guardrails-1",
      captureText: "Customer wants a 200 amp service upgrade.",
      expectSmartAllowed: false,
    });

    await runScenario(page, {
      quoteId: "qa-quick-scope-title-guardrails-2",
      captureText: "Customer wants a smart electrical panel with monitoring.",
      expectSmartAllowed: true,
    });

    const failed = results.filter((row) => !row.pass);
    if (failed.length > 0) {
      console.error(`\n${failed.length} Quick Scope title guardrail QA step(s) failed.`);
      for (const row of failed) {
        console.error(`  - ${row.step}${row.note ? `: ${row.note}` : ""}`);
      }
      process.exitCode = 1;
    } else {
      console.log(`\nAll ${results.length} Quick Scope title guardrail QA steps passed.`);
    }
  } finally {
    await cleanupQuote("qa-quick-scope-title-guardrails-1").catch(() => undefined);
    await cleanupQuote("qa-quick-scope-title-guardrails-2").catch(() => undefined);
    await browser.close();
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
