import { db } from "@/lib/db";
import {
  DEFAULT_OFFICE_INTAKE_FORM_DEFINITION,
  parseOfficeRequestTypeOptionsFromTriageRules,
} from "@/lib/intake/default-office-intake-form";
import type { IntakeRequestTypeOptionLike } from "@/lib/intake/map-intake-form-data-to-lead-input";
import type { IntakeFormDefinitionShape } from "@/lib/intake/default-intake-form";
import { ensureDefaultOfficeIntakeFormDefinition } from "@/lib/intake/ensure-default-office-intake-form";
import {
  INTAKE_FORM_DEFINITION_SELECT,
  OFFICE_INTAKE_FORM_WHERE,
  toIntakeFormDefinitionShape,
} from "@/lib/intake/intake-form-surface";

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
  const published = await db.intakeFormDefinition.findFirst({
    where: {
      organizationId,
      ...OFFICE_INTAKE_FORM_WHERE,
      isDefault: true,
      archivedAt: null,
    },
    select: {
      ...INTAKE_FORM_DEFINITION_SELECT,
      triageRules: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  let formDefinition: IntakeFormDefinitionShape;
  let triageRules: unknown = null;

  const shaped = published ? toIntakeFormDefinitionShape(published) : null;
  if (shaped) {
    formDefinition = shaped;
    triageRules = published?.triageRules;
  } else {
    try {
      formDefinition = await ensureDefaultOfficeIntakeFormDefinition(organizationId);
      const row = await db.intakeFormDefinition.findFirst({
        where: { id: formDefinition.id, organizationId },
        select: { triageRules: true },
      });
      triageRules = row?.triageRules;
    } catch (error) {
      console.error(
        "[getOfficeIntakeFormBundle] ensureDefaultOfficeIntakeFormDefinition failed; using synthetic fallback",
        { organizationId, error },
      );
      formDefinition = DEFAULT_OFFICE_INTAKE_FORM_DEFINITION;
    }
  }

  return {
    formDefinition,
    requestTypeOptions: parseOfficeRequestTypeOptionsFromTriageRules(triageRules),
  };
}
