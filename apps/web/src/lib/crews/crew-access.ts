export function getActiveCrewWindowWhere(now: Date = new Date()) {
  return {
    AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
  };
}

export function getCrewLinkedAssigneeWhere(userId: string, now: Date = new Date()) {
  const activeWindow = getActiveCrewWindowWhere(now);
  return {
    assignedUser: {
      crewMemberships: {
        some: {
          ...activeWindow,
          crew: {
            members: {
              some: {
                userId,
                ...activeWindow,
              },
            },
          },
        },
      },
    },
  };
}

