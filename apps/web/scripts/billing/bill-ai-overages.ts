#!/usr/bin/env tsx
/**
 * Bill AI overages for ended billing periods.
 * Usage: npx tsx scripts/billing/bill-ai-overages.ts [--organizationId=org_xxx]
 */

import { billAiOveragesForEndedPeriods } from "../../src/lib/billing/billing-overage";

async function main() {
  const orgArg = process.argv.find((arg) => arg.startsWith("--organizationId="));
  const organizationId = orgArg?.split("=")[1]?.trim() || undefined;

  const result = await billAiOveragesForEndedPeriods({ organizationId });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
