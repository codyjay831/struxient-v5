import { StaffRole } from "@prisma/client";
import { getSpecForRole } from "./role-feeds";
import { SIGNAL_CATALOG } from "./signal-catalog";

export type WorkstationLane = "critical" | "due" | "upcoming" | "watch";

export interface RankResult {
  lane: WorkstationLane;
  withinLaneRank: number;
  reason: string;
}

/**
 * Pure ranking function for Workstation items.
 *
 * Emits a lane and a sort rank within that lane based on the item's state,
 * the viewer's role, and the current time.
 */
export function rank(
  item: {
    kind: string;
    priority: string;
    group: string;
    updatedAt: Date;
    isBlocked?: boolean;
    signalId?: string;
  },
  role: StaffRole,
  now: Date
): RankResult {
  const spec = getSpecForRole(role);
  const signal = item.signalId ? SIGNAL_CATALOG[item.signalId] : undefined;

  // 1. Determine Lane
  let lane: WorkstationLane = signal?.defaultLane || "due";

  if (item.priority === "critical" || item.isBlocked || item.group === "investigate") {
    lane = "critical";
  } else if (item.priority === "high") {
    lane = "due";
  } else if (item.priority === "medium") {
    lane = "due";
  } else if (item.priority === "low" || item.group === "waiting") {
    lane = "upcoming";
  }

  // 2. Determine within-lane rank (lower is higher priority)
  // Base rank on updatedAt (newer first)
  let withinLaneRank = now.getTime() - item.updatedAt.getTime();

  // Apply role-based priority weights
  const priorityWeight = spec.priorityWeights[item.priority as keyof typeof spec.priorityWeights] || 1;
  withinLaneRank = withinLaneRank / priorityWeight;

  // 3. Reason
  const reason = signal?.copy.why || "Needs attention.";

  return { lane, withinLaneRank, reason };
}

export const LANE_ORDER: Record<WorkstationLane, number> = {
  critical: 0,
  due: 1,
  upcoming: 2,
  watch: 3,
};
