import { JobCollaboratorStatus } from "@prisma/client";

export function getActiveCollaboratorGrantWhere(userId: string, now: Date = new Date()) {
  return {
    collaborators: {
      some: {
        userId,
        status: JobCollaboratorStatus.ACTIVE,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    },
  };
}

