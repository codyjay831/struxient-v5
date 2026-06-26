/**
 * Headless browser QA for Phase 1 quote clarification Slices 1–3.
 * Run: npx tsx scripts/quote-clarification-browser-qa.ts
 */
import assert from "node:assert/strict";
import { chromium, type Page } from "playwright";
import { QuoteScopeDecisionStatus } from "@prisma/client";
import { buildQuoteSendBlockers } from "@/lib/quote/quote-send-blockers";
import { db } from "@/lib/db";
import {
  cleanupQuoteClarificationQaFixture,
  countOpenSendBlockingGaps,
  createBlockingLineGap,
  createQuoteClarificationQaFixture,
  readGapState,
  type QuoteClarificationQaFixture,
} from "@/lib/quote/quote-clarification-qa-fixture";

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

async function reloadScopeTab(page: Page) {
  await page.reload();
  await page.waitForLoadState("networkidle");
  const scopeTab = page.getByRole("button", { name: "Scope", exact: true });
  if (await scopeTab.isVisible().catch(() => false)) {
    await scopeTab.click();
    await page.waitForTimeout(800);
  }
}

async function openClarifyOnFirstLine(page: Page) {
  const clarifyButton = page.getByRole("button", { name: /Clarify/i }).first();
  await clarifyButton.click();
  await page.getByRole("dialog").getByText("Clarify scope").waitFor({ timeout: 20_000 });
  await ensureClarifyQuestionSetReady(page);
}

async function openClarifyOnLineIndex(page: Page, index: number) {
  const clarifyButton = page.getByRole("button", { name: /Clarify/i }).nth(index);
  await clarifyButton.click();
  await page.getByRole("dialog").getByText("Clarify scope").waitFor({ timeout: 20_000 });
  await ensureClarifyQuestionSetReady(page);
}

async function ensureClarifyQuestionSetReady(page: Page) {
  const dialog = page.getByRole("dialog");
  await dialog
    .getByText(/Finding scope questions/i)
    .waitFor({ state: "hidden", timeout: 20_000 })
    .catch(() => undefined);
  const useRecommendation = dialog.getByRole("button", { name: "Use recommendation" });
  if (await useRecommendation.isVisible().catch(() => false)) {
    await useRecommendation.click();
    await page.waitForTimeout(800);
  }
  if (!(await dialog.getByText("New service size").first().isVisible().catch(() => false))) {
    await chooseElectricalServiceUpgradeFromLibrary(page);
  }
  await dialog.getByText("New service size").first().waitFor({ timeout: 20_000 });
}

async function chooseElectricalServiceUpgradeFromLibrary(page: Page) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Choose from library" }).click();
  await page.waitForTimeout(500);
  await dialog.getByPlaceholder(/Search by set name/i).fill("service upgrade");
  await page.waitForTimeout(800);
  await dialog.getByRole("button", { name: /Electrical service upgrade/i }).first().click();
  await page.waitForTimeout(800);
}

async function answerNewServiceSize(page: Page, optionLabel: "200A" | "Needs field verify") {
  const dialog = page.getByRole("dialog");
  const questionBlock = dialog
    .locator("div.rounded-lg.border")
    .filter({ has: page.locator("p", { hasText: "New service size" }) })
    .first();
  await questionBlock.getByRole("button", { name: optionLabel, exact: true }).click();
}

async function applyClarify(page: Page) {
  await page.getByRole("dialog").getByRole("button", { name: "Apply to line scope" }).click();
  await page.waitForTimeout(1500);
}

async function clickClarifyGapAction(
  page: Page,
  gapTitle: string,
  action: "Not needed" | "Defer to execution",
) {
  const dialog = page.getByRole("dialog");
  const gapRow = dialog
    .locator("div.rounded-md.border")
    .filter({ has: page.locator("p.text-xs.font-medium", { hasText: gapTitle }) })
    .first();
  await gapRow.getByRole("button", { name: action, exact: true }).click();
}

async function closeClarifyIfOpen(page: Page) {
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await page.waitForTimeout(400);
  }
}

async function serverCanSend(quoteId: string): Promise<boolean> {
  const quote = await db.quote.findFirst({
    where: { id: quoteId },
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
  return buildQuoteSendBlockers({
    status: quote.status,
    lineItemCount: quote.lineItems.length,
    serviceLocationId: quote.serviceLocationId,
    paymentScheduleItemCount: quote.paymentSchedule.length,
    scopeDecisions: quote.scopeDecisions,
  }).canSend;
}

async function main() {
  let fixture: QuoteClarificationQaFixture | null = null;

  try {
    fixture = await createQuoteClarificationQaFixture();
    const { quoteId, lineAId, requiredGapId, lineAGapId, quoteWideGapId } = fixture;

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await login(page);
    record("Setup: login", true);

    await openScopeTab(page, quoteId);

    const uiBlocked = await page.getByText("Required before send").first().isVisible();
    const clarifyBadge = await page
      .getByRole("button", { name: /Clarify \(\d+\)/i })
      .first()
      .textContent();
    const serverBlocked = !(await serverCanSend(quoteId));
    record(
      "1. Required gap blocks send",
      uiBlocked && serverBlocked && /Clarify \(\d+\)/.test(clarifyBadge ?? ""),
      `badge=${clarifyBadge ?? "missing"}, serverBlocked=${serverBlocked}`,
    );
    record(
      "1a. Readiness points to Clarify",
      (await page.getByText(/use Clarify on affected lines/i).first().isVisible()) ||
        (await page.getByText(/Required before send/i).first().isVisible()),
    );

    await openClarifyOnFirstLine(page);
    await answerNewServiceSize(page, "Needs field verify");
    await applyClarify(page);
    await page.waitForTimeout(1000);

    const requiredAfterUnknown = await readGapState(requiredGapId);
    const stillBlockedAfterUnknown = !(await serverCanSend(quoteId));
    record(
      "2. Unknown answer does not close gap",
      requiredAfterUnknown?.status === QuoteScopeDecisionStatus.OPEN &&
        !requiredAfterUnknown.resolvedByClarificationId &&
        stillBlockedAfterUnknown,
      `status=${requiredAfterUnknown?.status}, resolvedBy=${requiredAfterUnknown?.resolvedByClarificationId ?? "null"}`,
    );

    await openClarifyOnFirstLine(page);
    await answerNewServiceSize(page, "200A");
    await applyClarify(page);
    await page.waitForTimeout(1200);

    const requiredAfterTruth = await readGapState(requiredGapId);
    const clarification = await db.quoteLineClarification.findFirst({
      where: { quoteLineItemId: lineAId },
      select: { id: true, answersJson: true },
    });
    record(
      "3. Real answer closes matching same-line gap",
      requiredAfterTruth?.status === QuoteScopeDecisionStatus.RESOLVED &&
        Boolean(requiredAfterTruth.resolvedByClarificationId) &&
        Boolean(clarification),
      `status=${requiredAfterTruth?.status}, resolvedBy=${requiredAfterTruth?.resolvedByClarificationId ?? "null"}`,
    );
    record(
      "3a. Send still blocked while other gaps remain",
      !(await serverCanSend(quoteId)),
      `openBlocking=${await countOpenSendBlockingGaps(quoteId)}`,
    );

    const notNeededGapId = await createBlockingLineGap({
      quoteId,
      lineId: lineAId,
      title: "Temporary QA gap for not-needed path",
    });
    await reloadScopeTab(page);
    await openClarifyOnFirstLine(page);
    await clickClarifyGapAction(page, "Temporary QA gap for not-needed path", "Not needed");
    await page.waitForTimeout(1200);
    const notNeededState = await readGapState(notNeededGapId);
    record(
      "4. Explicit Not needed path",
      notNeededState?.status === QuoteScopeDecisionStatus.DISMISSED,
      `status=${notNeededState?.status}`,
    );
    await closeClarifyIfOpen(page);

    const deferGapId = await createBlockingLineGap({
      quoteId,
      lineId: lineAId,
      title: "Temporary QA gap for defer path",
    });
    await reloadScopeTab(page);
    await openClarifyOnFirstLine(page);
    await clickClarifyGapAction(page, "Temporary QA gap for defer path", "Defer to execution");
    await page.waitForTimeout(1200);
    const deferState = await readGapState(deferGapId);
    record(
      "5. Defer to execution path",
      deferState?.status === QuoteScopeDecisionStatus.DEFERRED,
      `status=${deferState?.status}`,
    );
    await closeClarifyIfOpen(page);

    const deprecatedResolveCopyVisible = await page
      .getByText(/\bMark closed\b|Legacy gap handling|Temporary compatibility only/i)
      .isVisible()
      .catch(() => false);
    record(
      "6. No legacy gap handling section or resolve copy on quote tab",
      !deprecatedResolveCopyVisible,
      deprecatedResolveCopyVisible ? "legacy section/copy still visible" : undefined,
    );

    const lineAGapBefore = await readGapState(lineAGapId);
    const quoteWideBefore = await readGapState(quoteWideGapId);
    assert.equal(quoteWideBefore?.status, QuoteScopeDecisionStatus.OPEN, "quote-wide gap must start OPEN");
    await reloadScopeTab(page);
    await openClarifyOnLineIndex(page, 1);
    await answerNewServiceSize(page, "200A");
    await applyClarify(page);
    await page.waitForTimeout(1200);

    const lineAGapAfter = await readGapState(lineAGapId);
    const quoteWideAfter = await readGapState(quoteWideGapId);
    record(
      "7. Conservative matching — line A gap stays open when line B answered",
      lineAGapBefore?.status === QuoteScopeDecisionStatus.OPEN &&
        lineAGapAfter?.status === QuoteScopeDecisionStatus.OPEN,
      `lineA status=${lineAGapAfter?.status}`,
    );
    record(
      "7a. Quote-wide text-only gap stays open from line B answer",
      quoteWideBefore?.status === QuoteScopeDecisionStatus.OPEN &&
        quoteWideAfter?.status === QuoteScopeDecisionStatus.OPEN,
      `quoteWide status=${quoteWideAfter?.status}`,
    );

    const scopeText = await page.locator("body").innerText();
    const deprecatedPrimary =
      /Scope Details Needed/i.test(scopeText) ||
      /Manage handling/i.test(scopeText) ||
      /\bMark closed\b/i.test(scopeText);
    record(
      "8. UI language check (no deprecated primary workflow labels)",
      !deprecatedPrimary,
      deprecatedPrimary ? "deprecated label found in primary scope workflow" : undefined,
    );
    record("8a. No legacy compatibility section renders", !deprecatedResolveCopyVisible);

    const sendTab = page.getByRole("button", { name: /^Send/i }).first();
    if (await sendTab.isVisible().catch(() => false)) {
      await sendTab.click();
    }
    await page.waitForTimeout(600);
    const sendVisibleWhenBlocked = await page
      .getByRole("button", { name: "Send to customer" })
      .isVisible()
      .catch(() => false);
    record(
      "1b. Send tab hidden/disabled while blockers remain",
      !sendVisibleWhenBlocked,
      sendVisibleWhenBlocked ? "Send to customer visible while blocked" : undefined,
    );

    await browser.close();

    const failed = results.filter((row) => !row.pass);
    if (failed.length > 0) {
      console.error(`\n${failed.length} step(s) failed.`);
      for (const row of failed) {
        console.error(`  - ${row.step}${row.note ? `: ${row.note}` : ""}`);
      }
      process.exitCode = 1;
    } else {
      console.log(`\nAll ${results.length} quote clarification browser QA steps passed.`);
    }
  } finally {
    await cleanupQuoteClarificationQaFixture().catch(() => undefined);
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
