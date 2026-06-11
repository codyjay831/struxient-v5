import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type ReconcileReport = {
  legacyVisitCount: number;
  bridgedVisitCount: number;
  unbridgedVisitCount: number;
  taskLegacyScheduleCount: number;
  taskLegacyWithoutCanonicalLinkCount: number;
  ambiguousVisitRows: string[];
};

async function buildReport(): Promise<ReconcileReport> {
  const [
    legacyVisitCount,
    bridgedVisitCount,
    unbridgedVisits,
    tasksWithLegacySchedule,
    tasksWithLegacyWithoutCanonicalLink,
  ] = await Promise.all([
    prisma.jobVisit.count(),
    prisma.jobScheduleEvent.count({
      where: { legacyVisitId: { not: null } },
    }),
    prisma.jobVisit.findMany({
      where: {
        NOT: {
          id: {
            in: (
              await prisma.jobScheduleEvent.findMany({
                where: { legacyVisitId: { not: null } },
                select: { legacyVisitId: true },
              })
            )
              .map((event) => event.legacyVisitId)
              .filter((value): value is string => Boolean(value)),
          },
        },
      },
      select: { id: true },
    }),
    prisma.jobTask.count({
      where: {
        OR: [{ scheduledStartAt: { not: null } }, { scheduledEndAt: { not: null } }],
      },
    }),
    prisma.jobTask.findMany({
      where: {
        OR: [{ scheduledStartAt: { not: null } }, { scheduledEndAt: { not: null } }],
        scheduleEventLinks: { none: {} },
      },
      select: { id: true },
    }),
  ]);

  const ambiguousVisitRows: string[] = [];
  for (const visit of unbridgedVisits) {
    const duplicateCandidates = await prisma.jobScheduleEvent.count({
      where: { legacyVisitId: visit.id },
    });
    if (duplicateCandidates > 1) {
      ambiguousVisitRows.push(visit.id);
    }
  }

  return {
    legacyVisitCount,
    bridgedVisitCount,
    unbridgedVisitCount: unbridgedVisits.length,
    taskLegacyScheduleCount: tasksWithLegacySchedule,
    taskLegacyWithoutCanonicalLinkCount: tasksWithLegacyWithoutCanonicalLink.length,
    ambiguousVisitRows,
  };
}

async function main() {
  const report = await buildReport();
  console.log(JSON.stringify(report, null, 2));

  if (report.ambiguousVisitRows.length > 0) {
    console.error("Ambiguous schedule rows found. Manual review required.");
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
