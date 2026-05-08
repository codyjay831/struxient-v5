import { db } from "./db";
import { JobActivityType } from "@prisma/client";

export type GenerateDailyJobLogDraftInput = {
  organizationId: string;
  jobId: string;
  logDate: Date;
};

/**
 * Generates a deterministic text draft for a Daily Job Log based on JobActivity records.
 * V1 is strictly deterministic and does not use AI.
 */
export async function generateDailyJobLogDraft(input: GenerateDailyJobLogDraftInput): Promise<string> {
  const { organizationId, jobId, logDate } = input;

  // Normalize logDate to start and end of day
  const startOfDay = new Date(logDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(logDate);
  endOfDay.setHours(23, 59, 59, 999);

  const activities = await db.jobActivity.findMany({
    where: {
      organizationId,
      jobId,
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (activities.length === 0) {
    return "No recorded job activity for this date.";
  }

  let draft = `Daily activity recorded on ${startOfDay.toLocaleDateString()}:\n\n`;

  for (const activity of activities) {
    const time = activity.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    draft += `- [${time}] ${activity.title}\n`;
    if (activity.details) {
      draft += `  Note: ${activity.details}\n`;
    }
  }

  return draft;
}
