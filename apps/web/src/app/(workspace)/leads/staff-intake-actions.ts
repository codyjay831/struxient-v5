"use server";

import { LeadChannel } from "@prisma/client";
import { redirect } from "next/navigation";
import { getMutableRequestContextOrThrow } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { ingestLead } from "@/lib/lead/ingest-lead";
import { mapIntakeFormDataToLeadInput } from "@/lib/intake/map-intake-form-data-to-lead-input";
import { isSyntheticIntakeFormDefinitionId } from "@/lib/intake/default-intake-form";
import { getOfficeIntakeFormBundle } from "@/lib/intake/load-office-intake-form";
import { intakeFormDefinitionWhereForSurface } from "@/lib/intake/intake-form-surface";

export type StaffIntakeState = {
  error?: string;
  success?: boolean;
};

function trimOrNull(value: FormDataEntryValue | null): string | null {
  if (value == null || typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export async function createStaffLeadFromIntakeAction(
  _prevState: StaffIntakeState,
  formData: FormData,
): Promise<StaffIntakeState> {
  const ctx = await getMutableRequestContextOrThrow();
  const officeBundle = await getOfficeIntakeFormBundle(ctx.organizationId);

  const formDefinitionId = trimOrNull(formData.get("formDefinitionId"));
  if (formDefinitionId && !isSyntheticIntakeFormDefinitionId(formDefinitionId)) {
    const formDef = await db.intakeFormDefinition.findFirst({
      where: intakeFormDefinitionWhereForSurface(
        "office",
        ctx.organizationId,
        formDefinitionId,
      ),
      select: { id: true },
    });
    if (!formDef) {
      return { error: "This intake form is not valid for office intake. Refresh and try again." };
    }
  }

  const mapped = mapIntakeFormDataToLeadInput({
    formData,
    surfaceMode: "staff",
    fallbackChannel: LeadChannel.MANUAL,
    requestTypeOptions: officeBundle.requestTypeOptions,
    requireRequestTypeMatch: false,
  });
  if (!mapped.ok) {
    return { error: mapped.error };
  }

  let leadId: string;
  try {
    const lead = await ingestLead(mapped.input, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      formSnapshot:
        mapped.formDefinitionId != null &&
        !isSyntheticIntakeFormDefinitionId(mapped.formDefinitionId)
          ? {
              formDefinitionId: mapped.formDefinitionId,
              capturedAt: new Date().toISOString(),
            }
          : undefined,
    });
    leadId = lead.id;
  } catch (error) {
    if (error instanceof Error) {
      return { error: error.message };
    }
    return { error: "Could not create the intake record. Please try again." };
  }

  redirect(`/leads/${leadId}`);
}
