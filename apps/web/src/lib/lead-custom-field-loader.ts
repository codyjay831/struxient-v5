import "server-only";
import { db } from "@/lib/db";
import type { CustomFieldDefPayload } from "@/components/forms/custom-fields-form";

export async function loadLeadCustomFieldDefs(
  orgId: string,
  options: { publicOnly?: boolean } = {},
): Promise<CustomFieldDefPayload[]> {
  const rows = await db.leadCustomFieldDef.findMany({
    where: {
      organizationId: orgId,
      ...(options.publicOnly ? { showOnPublicIntake: true } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    label: r.label,
    type: r.type,
    options: r.optionsJson ? (r.optionsJson as string[]) : [],
    isRequired: r.isRequired,
  }));
}
