/**
 * Browser QA for Quick Scope internal-observation behavior.
 * Run: npx tsx scripts/quote-slice4-quick-scope-browser-qa.ts
 */
import assert from "node:assert/strict";
import { chromium, type Page } from "playwright";
import { PaymentScheduleAnchorType, QuoteStatus } from "@prisma/client";
import { buildQuoteSendBlockers } from "@/lib/quote/quote-send-blockers";
import { db } from "@/lib/db";
import { DEV_ORGANIZATION_ID } from "@/lib/dev-organization";
import { mapCommercialSuggestionToLineFields } from "@/lib/ai/quote-scope-suggestion-persist";
import { computeLineTotalCents } from "@/lib/quote-money";
import { Prisma } from "@prisma/client";

const BASE = process.env.QA_BASE_URL ?? "http://localhost:3001";
const EMAIL = "owner@dev.local";
const PASSWORD = "devpassword123";
const QA_QUOTE_ID = "qa-slice4-quick-scope-quote";

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

async function cleanup() {
  await db.quoteScopeDecision.deleteMany({ where: { quoteId: QA_QUOTE_ID } });
  await db.quoteLineItem.deleteMany({ where: { quoteId: QA_QUOTE_ID } });
  await db.paymentScheduleItem.deleteMany({ where: { quoteId: QA_QUOTE_ID } });
  await db.quote.deleteMany({ where: { id: QA_QUOTE_ID } });
}

async function seedQuoteWithQuickScopeApply() {
  await cleanup();

  const serviceLocation = await db.customerServiceLocation.findFirst({
    where: { organizationId: DEV_ORGANIZATION_ID },
    select: { id: true },
  });
  assert.ok(serviceLocation);

  await db.quote.create({
    data: {
      id: QA_QUOTE_ID,
      organizationId: DEV_ORGANIZATION_ID,
      customerId: "dev-customer-patel",
      serviceLocationId: serviceLocation.id,
      title: "QA Slice 4 Quick Scope apply",
      customerDocumentTitle: "Proposal: QA Slice 4",
      status: QuoteStatus.DRAFT,
      subtotalCents: 0,
      totalCents: 0,
    },
  });

  await db.paymentScheduleItem.create({
    data: {
      quoteId: QA_QUOTE_ID,
      title: "Deposit",
      amountCents: 25_000,
      anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
      sortOrder: 0,
    },
  });

  await db.$transaction(async (tx) => {
    const item = {
      tempId: "qa-c1",
      description: "Electrical service upgrade (QA)",
      lineItemDetails: [
        {
          tempId: "d1",
          content: "Existing panel appears outdated",
          audience: "internal" as const,
        },
      ],
      executionPlanningNotes: ["Coordinate utility disconnect window"],
      missingInfo: ["Confirm existing service size", "Preferred project timeline"],
    };
    const fields = mapCommercialSuggestionToLineFields(item);
    const quantity = new Prisma.Decimal(1);
    const lineTotal = computeLineTotalCents(quantity, 0);
    assert.equal(lineTotal.ok, true);

    const line = await tx.quoteLineItem.create({
      data: {
        quoteId: QA_QUOTE_ID,
        sortOrder: 0,
        description: fields.description,
        customerScopeTitle: fields.customerScopeTitle,
        customerScopeDescription: fields.customerScopeDescription,
        customerIncludedNotes: fields.customerIncludedNotes,
        quantity,
        unitAmountCents: 0,
        lineTotalCents: lineTotal.ok ? lineTotal.lineTotalCents : 0,
        internalNotes: fields.internalNotes,
      },
      select: { id: true },
    });

  });
}

async function main() {
  try {
    await seedQuoteWithQuickScopeApply();

    const line = await db.quoteLineItem.findFirst({
      where: { quoteId: QA_QUOTE_ID },
      select: { id: true, internalNotes: true, description: true },
    });
    assert.ok(line);

    const gaps = await db.quoteScopeDecision.findMany({
      where: { quoteId: QA_QUOTE_ID },
      select: {
        id: true,
        title: true,
        status: true,
        quoteImpact: true,
        sourceRefType: true,
        sourceRefId: true,
      },
    });

    record(
      "Slice 4 setup: Quick Scope apply created line",
      Boolean(line.description),
      line.description,
    );
    record(
      "Slice 4: legacy missing-info header absent from internal notes",
      !/Missing info \(this line\):/i.test(line.internalNotes ?? ""),
      line.internalNotes ?? "(empty)",
    );
    record(
      "Slice 4: hidden observations persisted to internal notes",
      (line.internalNotes ?? "").includes("Quick scope observations (internal):") &&
        (line.internalNotes ?? "").includes("Confirm existing service size"),
      line.internalNotes ?? "(empty)",
    );
    record(
      "Slice 4: execution planning notes preserved",
      (line.internalNotes ?? "").includes("Coordinate utility disconnect"),
    );
    record("Slice 4: no Quick Scope gap records created", gaps.length === 0, `count=${gaps.length}`);

    const quote = await db.quote.findFirst({
      where: { id: QA_QUOTE_ID },
      select: {
        status: true,
        serviceLocationId: true,
        lineItems: { select: { id: true } },
        paymentSchedule: { select: { id: true } },
        scopeDecisions: {
          select: {
            id: true,
            quoteLineItemId: true,
            status: true,
            quoteImpact: true,
            resolutionTiming: true,
            title: true,
          },
        },
      },
    });
    assert.ok(quote);
    const send = buildQuoteSendBlockers({
      status: quote.status,
      lineItemCount: quote.lineItems.length,
      serviceLocationId: quote.serviceLocationId,
      paymentScheduleItemCount: quote.paymentSchedule.length,
      scopeDecisions: quote.scopeDecisions,
    });
    record(
      "Slice 4: Quick Scope observations do not block send",
      send.canSend,
      `canSend=${send.canSend}, blockers=${send.blockers.length}`,
    );

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await login(page);
    await page.goto(`${BASE}/quotes/${QA_QUOTE_ID}`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Scope", exact: true }).click();
    await page.waitForTimeout(800);

    record(
      "Slice 4 browser: line visible on scope tab",
      await page.getByText("Electrical service upgrade (QA)").isVisible(),
    );
    record(
      "Slice 4 browser: Clarify action available",
      await page.getByRole("button", { name: /Clarify/i }).first().isVisible(),
    );
    record(
      "Slice 4 browser: scope page lacks Missing info note dump",
      !(await page.getByText(/Missing info \(this line\):/i).isVisible().catch(() => false)),
    );

    record(
      "Slice 4 browser: no Clarify badge count from Quick Scope",
      !/Clarify \(\d+\)/.test(await page.locator("body").innerText()),
    );

    await page.getByRole("button", { name: /Clarify/i }).first().click();
    await page.getByRole("dialog").getByText("Clarify scope").waitFor({ timeout: 20_000 });
    const dialog = page.getByRole("dialog");
    await dialog
      .getByText(/Finding scope questions/i)
      .waitFor({ state: "hidden", timeout: 20_000 })
      .catch(() => undefined);
    const useRecommendation = dialog.getByRole("button", { name: "Use recommendation" });
    if (await useRecommendation.isVisible().catch(() => false)) {
      await useRecommendation.click();
      await page.waitForTimeout(800);
    } else {
      await dialog.getByRole("button", { name: "Choose from library" }).click();
      await page.waitForTimeout(500);
      await dialog.getByPlaceholder(/Search by set name/i).fill("service upgrade");
      await page.waitForTimeout(800);
      await dialog.getByRole("button", { name: /Electrical service upgrade/i }).first().click();
      await page.waitForTimeout(800);
    }
    const dialogText = await dialog.innerText();
    record(
      "Slice 4 browser: Clarify does not show Quick Scope gap section",
      !/Clear open gap records/i.test(dialogText) &&
        !/Confirm existing service size/i.test(dialogText),
      /Clear open gap records/i.test(dialogText) ? "gap section visible" : "gap section missing",
    );
    await browser.close();

    const failed = results.filter((row) => !row.pass);
    if (failed.length > 0) {
      console.error(`\n${failed.length} Slice 4 step(s) failed.`);
      for (const row of failed) {
        console.error(`  - ${row.step}${row.note ? `: ${row.note}` : ""}`);
      }
      process.exitCode = 1;
    } else {
      console.log(`\nAll ${results.length} Slice 4 Quick Scope browser QA steps passed.`);
    }
  } finally {
    await cleanup().catch(() => undefined);
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
