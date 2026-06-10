import { db } from "@/lib/db";
import {
  runServiceLocationBackfill,
  type BackfillDb,
} from "@/lib/site-details/service-location-backfill";

async function main() {
  const ack = process.env.SITE_DETAILS_PHASE1B_BACKFILL;
  if (ack !== "1") {
    throw new Error(
      "Refusing to run Phase 1B backfill without SITE_DETAILS_PHASE1B_BACKFILL=1 acknowledgement.",
    );
  }

  const report = await runServiceLocationBackfill(db as unknown as BackfillDb);
  process.stdout.write(
    `${JSON.stringify(
      {
        phase: "1B",
        report,
      },
      null,
      2,
    )}\n`,
  );

  if (report.leads.ambiguous > 0 || report.quotes.ambiguous > 0 || report.jobs.ambiguous > 0) {
    throw new Error(
      `Ambiguous backfill detected (leads=${report.leads.ambiguous}, quotes=${report.quotes.ambiguous}, jobs=${report.jobs.ambiguous}). No silent assignment allowed.`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
