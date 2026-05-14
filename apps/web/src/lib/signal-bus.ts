import { db } from "@/lib/db";
import { JobIssueSeverity, JobIssueStatus } from "@prisma/client";

/**
 * The Signal Bus is a per-job fact store.
 * It manages the publication and retraction of signals that drive task readiness.
 */

/**
 * Publishes a signal to the job's signal bus.
 * If the signal already exists, it updates the source information.
 */
export async function publishSignal({
  jobId,
  name,
  sourceJobTaskId,
  sourceJobStageId,
}: {
  jobId: string;
  name: string;
  sourceJobTaskId?: string;
  sourceJobStageId?: string;
}) {
  return await db.jobSignal.upsert({
    where: {
      jobId_name: {
        jobId,
        name,
      },
    },
    update: {
      publishedAt: new Date(),
      sourceJobTaskId,
      sourceJobStageId,
    },
    create: {
      jobId,
      name,
      sourceJobTaskId,
      sourceJobStageId,
    },
  });
}

/**
 * Retracts a signal from the job's signal bus.
 */
export async function retractSignal(jobId: string, name: string) {
  try {
    await db.jobSignal.delete({
      where: {
        jobId_name: {
          jobId,
          name,
        },
      },
    });
  } catch {
    // Ignore if already deleted or doesn't exist
  }
}

/**
 * Checks if a signal is currently "live" on the bus.
 * A signal is live if it has been published AND its source is not "muted" by a blocking issue.
 */
export async function isSignalLive(jobId: string, name: string): Promise<boolean> {
  const signal = await db.jobSignal.findUnique({
    where: {
      jobId_name: {
        jobId,
        name,
      },
    },
    include: {
      job: {
        include: {
          issues: {
            where: {
              status: JobIssueStatus.OPEN,
              severity: JobIssueSeverity.BLOCKS_WORK,
            },
          },
        },
      },
    },
  });

  if (!signal) return false;

  // Check if the source task or stage has a blocking issue
  const blockingIssues = signal.job.issues;
  
  if (signal.sourceJobTaskId) {
    const isTaskMuted = blockingIssues.some(issue => issue.jobTaskId === signal.sourceJobTaskId);
    if (isTaskMuted) return false;
  }

  if (signal.sourceJobStageId) {
    const isStageMuted = blockingIssues.some(issue => issue.jobStageId === signal.sourceJobStageId);
    if (isStageMuted) return false;
  }

  return true;
}

/**
 * Gets all live signals for a job in one query.
 * Useful for bulk readiness derivation.
 */
export async function getLiveSignals(jobId: string): Promise<string[]> {
  const signals = await db.jobSignal.findMany({
    where: { jobId },
    include: {
      job: {
        include: {
          issues: {
            where: {
              status: JobIssueStatus.OPEN,
              severity: JobIssueSeverity.BLOCKS_WORK,
            },
          },
        },
      },
    },
  });

  return signals
    .filter(signal => {
      const blockingIssues = signal.job.issues;
      if (signal.sourceJobTaskId) {
        if (blockingIssues.some(issue => issue.jobTaskId === signal.sourceJobTaskId)) return false;
      }
      if (signal.sourceJobStageId) {
        if (blockingIssues.some(issue => issue.jobStageId === signal.sourceJobStageId)) return false;
      }
      return true;
    })
    .map(s => s.name);
}
