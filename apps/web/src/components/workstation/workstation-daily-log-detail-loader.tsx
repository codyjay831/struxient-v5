import { getRequestContextOrThrow } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { DailyJobLogManager } from "@/components/jobs/daily-job-log-manager";

type WorkstationDailyLogDetailLoaderProps = {
  logId: string;
  jobId: string;
};

export async function WorkstationDailyLogDetailLoader({
  logId,
  jobId,
}: WorkstationDailyLogDetailLoaderProps) {
  const ctx = await getRequestContextOrThrow();

  const log = await db.dailyJobLog.findFirst({
    where: {
      id: logId,
      jobId,
      organizationId: ctx.organizationId,
    },
    select: { id: true },
  });

  if (!log) return null;

  const logs = await db.dailyJobLog.findMany({
    where: { jobId, organizationId: ctx.organizationId },
    orderBy: { logDate: "desc" },
    select: {
      id: true,
      logDate: true,
      summary: true,
      internalNotes: true,
      status: true,
      reviewedAt: true,
      reviewedByUser: {
        select: { name: true, email: true },
      },
    },
  });

  return (
    <DailyJobLogManager
      jobId={jobId}
      initialLogs={logs}
      variant="embedded"
      focusId={logId}
    />
  );
}
