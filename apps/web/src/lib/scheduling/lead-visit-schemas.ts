import { z } from "zod";

export const LeadVisitAccessSnapshotSchema = z
  .object({
    someoneMustBeHome: z.boolean().optional(),
    gateCode: z.string().nullable().optional(),
    garageAccess: z.string().nullable().optional(),
    lockbox: z.string().nullable().optional(),
    pets: z.string().nullable().optional(),
    parking: z.string().nullable().optional(),
    callOnArrival: z.boolean().optional(),
    accessNotes: z.string().nullable().optional(),
  })
  .strict();

export type LeadVisitAccessSnapshot = z.infer<typeof LeadVisitAccessSnapshotSchema>;

export const LeadVisitSiteContactSnapshotSchema = z
  .object({
    name: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    relationship: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .strict();

export type LeadVisitSiteContactSnapshot = z.infer<typeof LeadVisitSiteContactSnapshotSchema>;

export const DEFAULT_ESTIMATED_DURATION_MINUTES = 120;

export function parseLeadVisitAccessSnapshot(
  value: unknown,
): LeadVisitAccessSnapshot | { error: string } {
  const parsed = LeadVisitAccessSnapshotSchema.safeParse(value);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  return parsed.data;
}

export function parseLeadVisitSiteContactSnapshot(
  value: unknown,
): LeadVisitSiteContactSnapshot | { error: string } {
  const parsed = LeadVisitSiteContactSnapshotSchema.safeParse(value);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  return parsed.data;
}

export function hasAccessSnapshotContent(snapshot: LeadVisitAccessSnapshot | null | undefined): boolean {
  if (!snapshot) return false;
  return Object.values(snapshot).some((value) => {
    if (typeof value === "boolean") return value;
    return value != null && String(value).trim().length > 0;
  });
}
