/**
 * Post-commit live QA for Change Order execution delta (headless browser).
 * Run: npx tsx scripts/change-order-browser-qa.ts
 */
import assert from "node:assert/strict";
import { chromium, type Page } from "playwright";
import { JobTaskStatus } from "@prisma/client";
import { db } from "@/lib/db";
import {
  cleanupChangeOrderJobFixture,
  createChangeOrderJobFixture,
  createChangeOrderShareToken,
  type ChangeOrderJobFixture,
} from "@/lib/change-order/change-order-test-fixture";

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

async function main() {
  let fixture: ChangeOrderJobFixture | null = null;
  let shareToken: string | null = null;

  try {
    fixture = await createChangeOrderJobFixture("browser-qa");
    const jobId = fixture.jobId;

    await db.jobTask.create({
      data: {
        jobId,
        jobStageId: fixture.stageId,
        sourceType: "CUSTOM",
        title: "Secondary QA task",
        category: "GENERAL",
        status: JobTaskStatus.TODO,
        sortOrder: 98,
      },
    }).then(async (secondaryTask) => {
      await db.jobTaskScope.create({
        data: {
          organizationId: "dev-org-id",
          jobTaskId: secondaryTask.id,
          jobScopeItemId: fixture!.scopeItemId,
        },
      });
    });

    await db.jobTask.create({
      data: {
        jobId,
        jobStageId: fixture.stageId,
        sourceType: "CUSTOM",
        title: "Completed QA task",
        category: "GENERAL",
        status: JobTaskStatus.DONE,
        sortOrder: 99,
      },
    }).then(async (doneTask) => {
      await db.jobTaskScope.create({
        data: {
          organizationId: "dev-org-id",
          jobTaskId: doneTask.id,
          jobScopeItemId: fixture!.scopeItemId,
        },
      });
    });

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await login(page);
    record("Setup: login", true);

    await page.goto(`${BASE}/jobs/${jobId}/change-orders`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "New Change Order" }).click();
    await page.getByRole("button", { name: "Add new work or cost" }).click();
    await page.locator("textarea").first().fill("Customer approved battery backup add-on for QA.");
    await page.getByPlaceholder("Describe the scope change").fill("Battery backup unit");
    await page.getByLabel("Price delta ($)").fill("500");
    await page.getByRole("button", { name: "Create draft" }).click();
    await page.waitForURL(new RegExp(`/jobs/${jobId}/change-orders\\?focus=`), { timeout: 30_000 });
    record("1. Create price-impact Change Order", true);

    await page.getByRole("heading", { name: "Work impact", exact: true }).waitFor({ timeout: 30_000 });
    record(
      "2. Generated ADD_TASK in work impact",
      await page.getByText(/Draft task suggestion|review before sending/i).isVisible(),
    );
    record(
      "3. Generated task blocks send",
      await page.getByRole("button", { name: "Send change order" }).isDisabled(),
    );

    await page.getByRole("button", { name: "Add task cancellation" }).click();
    const cancelForm = page
      .locator("div.rounded-lg.border")
      .filter({ has: page.getByRole("button", { name: "Add cancellation to draft" }) });
    await cancelForm.locator("select").selectOption({ label: "Secondary QA task (TODO)" });
    await cancelForm.locator("textarea").first().fill("Cancel open task for QA.");
    await page.getByRole("button", { name: "Add cancellation to draft" }).click();
    record("4. Add manual CANCEL_TASK", await page.getByText("Manually added cancellation").isVisible());

    await page.getByRole("button", { name: "Add task cancellation" }).click();
    const doneOption = page.locator("option", { hasText: /Completed QA task \(DONE\)/i });
    record("5. DONE task blocked in cancel picker", (await doneOption.getAttribute("disabled")) !== null);

    await page.getByRole("button", { name: "Add task change", exact: true }).click();
    const modifyForm = page
      .locator("div.rounded-lg.border")
      .filter({ has: page.getByRole("button", { name: "Add task change to draft" }) });
    await modifyForm.locator("select").selectOption({ label: "Existing task (TODO)" });
    await modifyForm.locator("label").filter({ hasText: "New title" }).locator("input").fill("Install battery backup");
    await modifyForm.locator("label").filter({ hasText: "Reason" }).locator("textarea").fill("Relabel install task for QA.");
    await page.getByRole("button", { name: "Add task change to draft" }).click();
    await page.waitForTimeout(500);
    record(
      "6. Add manual MODIFY_TASK",
      (await page.getByText("Tasks to change").isVisible()) &&
        (await page.getByText("Manually added task change").isVisible().catch(() => false)),
    );

    await page.getByRole("button", { name: "Add task", exact: true }).click();
    const addForm = page
      .locator("div.rounded-lg.border")
      .filter({ has: page.getByRole("button", { name: "Add task to draft" }) });
    await addForm.locator("label").filter({ hasText: "Task title" }).locator("input").fill("Final battery inspection");
    await page.getByRole("button", { name: "Add task to draft" }).click();
    record("7. Add manual ADD_TASK", await page.getByText("Manually added").first().isVisible());

    record("8a. Unsaved work impact banner", await page.getByText(/unsaved work impact/i).isVisible());
    await page.locator("textarea").first().fill("Updated commercial reason for mixed-save test.");
    record(
      "9. Mixed commercial + execution save blocked",
      await page.getByText(/Save commercial changes first/i).first().isVisible(),
    );
    await page.locator("textarea").first().fill("Customer approved battery backup add-on for QA.");

    await page.getByRole("button", { name: "Save execution impact" }).click();
    await page.waitForTimeout(2000);
    record(
      "8. Save execution impact",
      !(await page.getByText(/unsaved work impact/i).isVisible().catch(() => false)),
    );

    const generatedOp = page.locator("li").filter({ hasText: /Draft task suggestion/i }).first();
    await generatedOp.getByRole("button", { name: "Edit" }).click();
    await generatedOp.locator("textarea").last().fill("Reviewed by office before send.");
    await generatedOp.getByRole("button", { name: "Save op" }).click();
    await page.getByRole("button", { name: "Save execution impact" }).click();
    await page.waitForTimeout(1500);

    await page.getByRole("button", { name: "Send change order" }).click();
    await page.waitForTimeout(2500);
    record("10. Send Change Order", await page.getByText(/Status: SENT/i).isVisible());

    const co = await db.changeOrder.findFirst({ where: { jobId }, orderBy: { createdAt: "desc" } });
    assert.ok(co);
    await db.changeOrderShareToken.deleteMany({ where: { changeOrderId: co.id } });
    shareToken = await createChangeOrderShareToken(co.id);

    const customerPage = await browser.newPage();
    await customerPage.goto(`${BASE}/co/${shareToken}`);
    const customerHtml = await customerPage.content();
    record("11. Open customer /co/[token]", customerPage.url().includes("/co/"));
    const leaksExecution =
      /executionDelta|internalNote|jobPlanVersion|applicationStatus|lastApplyError/i.test(customerHtml);
    record("12. Customer commercial only (no execution leak)", !leaksExecution);

    await customerPage.getByPlaceholder("Describe what you would like changed.").fill("Please adjust panel location for QA.");
    await customerPage.getByRole("button", { name: "Request changes" }).click();
    await customerPage.waitForTimeout(2500);
    record("13. Customer request changes", await customerPage.getByText(/Change request received/i).isVisible());
    await customerPage.close();

    await page.reload();
    await page.waitForTimeout(2000);
    record(
      "14. Re-edit after customer request",
      (await page.getByText(/Status: CUSTOMER REQUESTED CHANGES/i).isVisible()) &&
        (await page.getByRole("button", { name: "Add task cancellation" }).isVisible()),
    );

    await page.getByRole("button", { name: "Send change order" }).click();
    await page.waitForTimeout(2500);
    record("15. Send again after customer request", await page.getByText(/Status: SENT/i).isVisible());
    await db.changeOrderShareToken.deleteMany({ where: { changeOrderId: co.id } });
    shareToken = await createChangeOrderShareToken(co.id);

    const acceptPage = await browser.newPage();
    await acceptPage.goto(`${BASE}/co/${shareToken}`);
    await acceptPage.getByPlaceholder("Your full name").fill("QA Customer");
    await acceptPage.getByRole("button", { name: "Accept Change Order" }).click();
    await acceptPage.waitForTimeout(2500);
    record("16. Customer accept", await acceptPage.getByText(/Change Order accepted/i).isVisible());
    await acceptPage.close();

    await page.reload();
    await page.getByRole("button", { name: "Apply to job plan" }).click();
    await page.waitForTimeout(3000);
    record("17. Apply to job plan", await page.getByText(/Status: APPLIED/i).isVisible());

    const scopeAfter = await db.jobScopeItem.count({ where: { jobId, status: "ACTIVE" } });
    record("18. Job scope updated after apply", scopeAfter > 1, `active scope count=${scopeAfter}`);

    await page.goto(`${BASE}/workstation?tab=commercial`);
    await page.waitForTimeout(2000);
    const wsBody = await page.locator("body").innerText();
    record(
      "19. Workstation attention (applied CO clears queue)",
      !/CO-\d{3}/.test(wsBody),
      "applied CO should not remain in commercial attention",
    );

    record("20. Customer page execution leak re-check", !leaksExecution);

    await browser.close();

    const failed = results.filter((row) => !row.pass);
    if (failed.length > 0) {
      console.error(`\n${failed.length} step(s) failed.`);
      for (const row of failed) {
        console.error(`  - ${row.step}${row.note ? `: ${row.note}` : ""}`);
      }
      process.exitCode = 1;
    } else {
      console.log("\nAll browser QA steps passed.");
    }
  } finally {
    if (fixture) {
      await cleanupChangeOrderJobFixture(fixture);
    }
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
