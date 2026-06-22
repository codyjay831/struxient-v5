import { db } from "@/lib/db";
import {
  DEFAULT_OFFICE_INTAKE_FORM_DEFINITION,
  isSyntheticDefaultOfficeIntakeFormDefinitionId,
  parseOfficeRequestTypeOptionsFromTriageRules,
} from "@/lib/intake/default-office-intake-form";
import type { IntakeRequestTypeOptionLike } from "@/lib/intake/map-intake-form-data-to-lead-input";
import type { IntakeFormDefinitionShape } from "@/lib/intake/default-intake-form";
import { ensureDefaultOfficeIntakeFormDefinition } from "@/lib/intake/ensure-default-office-intake-form";

export type OfficeIntakeFormBundle = {
  formDefinition: IntakeFormDefinitionShape;
  requestTypeOptions: IntakeRequestTypeOptionLike[];
};

/**
 * Loads the default office new-lead form for an organization.
 * Does not use public WEB_FORM definitions.
 */
export async function getOfficeIntakeFormBundle(
  organizationId: string,
): Promise<OfficeIntakeFormBundle> {
  let formDefinition: IntakeFormDefinitionShape;
  try {
    formDefinition = await ensureDefaultOfficeIntakeFormDefinition(organizationId);
  } catch (error) {
    console.error(
      "[getOfficeIntakeFormBundle] ensureDefaultOfficeIntakeFormDefinition failed; using synthetic fallback",
      { organizationId, error },
    );
    formDefinition = DEFAULT_OFFICE_INTAKE_FORM_DEFINITION;
  }

  const triageRules = isSyntheticDefaultOfficeIntakeFormDefinitionId(formDefinition.id)
    ? null
    : (
        await db.intakeFormDefinition.findFirst({
          where: { id: formDefinition.id, organizationId },
          select: { triageRules: true },
        })
      )?.triageRules;

  const requestTypeOptions = parseOfficeRequestTypeOptionsFromTriageRules(triageRules);
  if (!requestTypeOptions) {
    throw new Error(
      `[getOfficeIntakeFormBundle] default office form missing triageRules.requestTypeOptions (organizationId=${organizationId})`,
    );
  }

  return {
    formDefinition,
    requestTypeOptions,
  };
}
