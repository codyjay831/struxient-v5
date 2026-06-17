import { ScheduleBlockType, StaffRole, type Prisma } from "@prisma/client";
import { db, type ExtendedTransactionClient } from "@/lib/db";
import { enqueueNotification } from "@/lib/notifications/notification-outbox";
import { assertSchedulePermission } from "./schedule-permissions";

export type ScheduleBlockServiceError = { error: string };

export type UpsertScheduleBlockInput = {
  organizationId: string;
  actorUserId: string;
  role: StaffRole;
  blockId?: string;
  title: string;
  type: ScheduleBlockType;
  startAt: Date;
  endAt?: Date | null;
  allDay?: boolean;
  userId?: string | null;
  notes?: string;
};

export function getScheduleBlockMutationPermission(
  role: StaffRole,
  isUpdate: boolean,
): { ok: true } | { ok: false; error: string } {
  return assertSchedulePermission(
    role,
    isUpdate ? "reschedule_tentative" : "create_tentative",
  );
}

export async function upsertScheduleBlock(
  input: UpsertScheduleBlockInput,
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true; blockId: string } | ScheduleBlockServiceError> {
  const permission = getScheduleBlockMutationPermission(input.role, Boolean(input.blockId));
  if (!permission.ok) return { error: permission.error };

  if (input.endAt && input.endAt <= input.startAt) {
    return { error: "Schedule block end must be after start." };
  }

  if (input.blockId) {
    const existing = await tx.scheduleBlock.findFirst({
      where: { id: input.blockId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (!existing) return { error: "Schedule block not found." };

    await tx.scheduleBlock.update({
      where: { id: input.blockId },
      data: {
        title: input.title,
        type: input.type,
        startAt: input.startAt,
        endAt: input.endAt,
        allDay: input.allDay ?? false,
        userId: input.userId ?? null,
        notes: input.notes,
      },
    });

    await enqueueNotification(
      {
        organizationId: input.organizationId,
        kind: "SCHEDULE_BLOCK_UPDATED",
        title: `Schedule block updated: ${input.title}`,
        dedupeKey: `schedule-block-updated-${input.blockId}-${Date.now()}`,
        payloadJson: {
          blockId: input.blockId,
          type: input.type,
          startAt: input.startAt.toISOString(),
          endAt: input.endAt?.toISOString() ?? null,
          actorUserId: input.actorUserId,
        } satisfies Prisma.InputJsonObject,
      },
      tx,
    );

    return { success: true, blockId: input.blockId };
  }

  const created = await tx.scheduleBlock.create({
    data: {
      organizationId: input.organizationId,
      title: input.title,
      type: input.type,
      startAt: input.startAt,
      endAt: input.endAt,
      allDay: input.allDay ?? false,
      userId: input.userId ?? null,
      notes: input.notes,
    },
    select: { id: true },
  });

  await enqueueNotification(
    {
      organizationId: input.organizationId,
      kind: "SCHEDULE_BLOCK_CREATED",
      title: `Schedule block created: ${input.title}`,
      dedupeKey: `schedule-block-created-${created.id}`,
      payloadJson: {
        blockId: created.id,
        type: input.type,
        startAt: input.startAt.toISOString(),
        endAt: input.endAt?.toISOString() ?? null,
        actorUserId: input.actorUserId,
      } satisfies Prisma.InputJsonObject,
    },
    tx,
  );

  return { success: true, blockId: created.id };
}
