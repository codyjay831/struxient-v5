import { getRequestContextOrThrow } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { DailyJobLogManager } from "@/components/jobs/daily-job-log-manager";
import {
  canManageDailyLogCoordination,
  canReadDailyLogInternalNotes,
  canWriteDailyLogInternalNotes,
  dailyJobLogSelectForRole,
  redactDailyLogsForRole,
} from "@/lib/authz/daily-log-visibility";

type WorkstationDailyLogDetailLoaderProps = {
  logId: string;
  jobId: string;
};

export async function WorkstationDailyLogDetailLoader({
  logId,
  jobId,
}: WorkstationDailyLogDetailLoaderProps) {
  const ctx = await getRequestContextOrThrow();
  const logSelect = dailyJobLogSelectForRole(ctx.role);

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
    select: logSelect,
  });

  return (
    <DailyJobLogManager
      jobId={jobId}
      initialLogs={redactDailyLogsForRole(logs, ctx.role)}
      variant="embedded"
      focusId={logId}
      canAccessInternalNotes={canReadDailyLogInternalNotes(ctx.role)}
      canWriteInternalNotes={canWriteDailyLogInternalNotes(ctx.role)}
      canManageDailyLogCoordination={canManageDailyLogCoordination(ctx.role)}
    />
  );
}
