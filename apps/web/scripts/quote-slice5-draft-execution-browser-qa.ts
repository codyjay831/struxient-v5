/**
 * Browser QA for Phase 1 Slice 5 — draft execution de-emphasis.
 * Run: npx tsx scripts/quote-slice5-draft-execution-browser-qa.ts
 */
import assert from "node:assert/strict";
import { chromium, type Page } from "playwright";
import {
  createQuoteClarificationQaFixture,
  cleanupQuoteClarificationQaFixture,
  QA_CLARIFY_QUOTE_ID,
} from "@/lib/quote/quote-clarification-qa-fixture";
import {
  QUOTE_DRAFT_EXECUTION_ACTION_LABEL,
  QUOTE_DRAFT_EXECUTION_CONFIRMED_LATER_COPY,
  QUOTE_DRAFT_EXECUTION_INTERNAL_COPY,
  QUOTE_DRAFT_EXECUTION_PANEL_HEADING,
} from "@/lib/quote/quote-draft-execution-ui";

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

async function openScopeTab(page: Page, quoteId: string) {
  await page.goto(`${BASE}/quotes/${quoteId}`);
  await page.waitForLoadState("networkidle");
  const scopeTab = page.getByRole("button", { name: "Scope", exact: true });
  if (await scopeTab.isVisible().catch(() => false)) {
    await scopeTab.click();
    await page.waitForTimeout(800);
  }
}

async function main() {
  await cleanupQuoteClarificationQaFixture();
  await createQuoteClarificationQaFixture();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await login(page);
    record("Slice 5 setup: login", true);

    await openScopeTab(page, QA_CLARIFY_QUOTE_ID);

    const clarifyButtons = page.getByRole("button", { name: /Clarify/i });
    const planWorkButtons = page.getByRole("button", {
      name: /Plan work \(internal\)/i,
    });

    const clarifyCount = await clarifyButtons.count();
    const planWorkCount = await planWorkButtons.count();
    record(
      "Slice 5: Clarify is available on lines",
      clarifyCount > 0,
      `clarify=${clarifyCount}`,
    );
    record(
      "Slice 5: Plan work (internal) action label",
      planWorkCount > 0,
      `buttons=${planWorkCount}`,
    );

    const deprecatedLabels = await page
      .getByRole("button", { name: /Add draft execution|Edit draft execution|AI Execution Plan/i })
      .count();
    record(
      "Slice 5: deprecated execution action labels absent",
      deprecatedLabels === 0,
      `found=${deprecatedLabels}`,
    );

    const panelHeadingVisible = await page
      .getByText(QUOTE_DRAFT_EXECUTION_PANEL_HEADING, { exact: true })
      .isVisible()
      .catch(() => false);
    record(
      "Slice 5: draft execution collapsed by default",
      !panelHeadingVisible,
      panelHeadingVisible ? "panel heading visible while collapsed" : undefined,
    );

    const firstLine = page.locator("ul.divide-y > li").first();
    const clarifyBox = await firstLine
      .getByRole("button", { name: /Clarify/i })
      .boundingBox();
    const planWorkBox = await planWorkButtons.first().boundingBox();
    const clarifyPrimary =
      clarifyBox != null &&
      planWorkBox != null &&
      (clarifyBox.y < planWorkBox.y ||
        (Math.abs(clarifyBox.y - planWorkBox.y) < 8 && clarifyBox.x < planWorkBox.x));
    record(
      "Slice 5: Clarify appears before or above Plan work on line",
      clarifyPrimary,
      clarifyBox && planWorkBox
        ? `clarify y=${clarifyBox.y}, plan y=${planWorkBox.y}`
        : "missing bounding boxes",
    );

    await planWorkButtons.first().click();
    await page.waitForTimeout(500);

    const internalCopyVisible = await page
      .getByText(QUOTE_DRAFT_EXECUTION_INTERNAL_COPY)
      .first()
      .isVisible()
      .catch(() => false);
    const confirmedLaterVisible = await page
      .getByText(QUOTE_DRAFT_EXECUTION_CONFIRMED_LATER_COPY)
      .first()
      .isVisible()
      .catch(() => false);
    record(
      "Slice 5: internal-only copy visible when expanded",
      internalCopyVisible && confirmedLaterVisible,
    );

    const panelHeadingAfterExpand = await page
      .getByText(QUOTE_DRAFT_EXECUTION_PANEL_HEADING, { exact: true })
      .isVisible()
      .catch(() => false);
    record(
      "Slice 5: internal work plan panel accessible when expanded",
      panelHeadingAfterExpand,
    );

    const sendBlockedBadge = await page
      .getByText(/Clarify \(\d+\)/)
      .first()
      .isVisible()
      .catch(() => false);
    record(
      "Slice 5: send readiness unchanged (blocking gaps still show Clarify)",
      sendBlockedBadge,
    );
  } finally {
    await browser.close();
    await cleanupQuoteClarificationQaFixture();
  }

  const failed = results.filter((r) => !r.pass);
  if (failed.length > 0) {
    console.error(`\n${failed.length} Slice 5 browser QA step(s) failed.`);
    process.exit(1);
  }
  console.log(`\nAll ${results.length} Slice 5 draft execution browser QA steps passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
