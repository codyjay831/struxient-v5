import { LeadChannel, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  DEFAULT_OFFICE_INTAKE_FORM_SCHEMA,
  DEFAULT_OFFICE_INTAKE_FORM_SLUG,
} from "@/lib/intake/default-office-intake-form";
import type { IntakeFormDefinitionShape } from "@/lib/intake/default-intake-form";
import {
  INTAKE_FORM_DEFINITION_SELECT,
  OFFICE_INTAKE_FORM_WHERE,
  toIntakeFormDefinitionShape,
} from "@/lib/intake/intake-form-surface";

const DEFAULT_OFFICE_INTAKE_NAME = "Office intake";

/**
 * Ensures the org has a published default office intake form (MANUAL, not public).
 * Used by `/leads/new` so submit/provenance stay consistent.
 */
export async function ensureDefaultOfficeIntakeFormDefinition(
  organizationId: string,
): Promise<IntakeFormDefinitionShape> {
  const existing = await db.intakeFormDefinition.findFirst({
    where: {
      organizationId,
      ...OFFICE_INTAKE_FORM_WHERE,
      isDefault: true,
      archivedAt: null,
    },
    select: INTAKE_FORM_DEFINITION_SELECT,
    orderBy: { updatedAt: "desc" },
  });

  const shaped = existing ? toIntakeFormDefinitionShape(existing) : null;
  if (shaped) {
    return shaped;
  }

  const schemaJson = DEFAULT_OFFICE_INTAKE_FORM_SCHEMA as unknown as Prisma.InputJsonValue;

  const upserted = await db.intakeFormDefinition.upsert({
    where: {
      organizationId_slug: {
        organizationId,
        slug: DEFAULT_OFFICE_INTAKE_FORM_SLUG,
      },
    },
    create: {
      organizationId,
      slug: DEFAULT_OFFICE_INTAKE_FORM_SLUG,
      name: DEFAULT_OFFICE_INTAKE_NAME,
      channel: LeadChannel.MANUAL,
      isPublic: false,
      isDefault: true,
      schema: schemaJson,
    },
    update: {
      name: DEFAULT_OFFICE_INTAKE_NAME,
      channel: LeadChannel.MANUAL,
      isPublic: false,
      isDefault: true,
      archivedAt: null,
      schema: schemaJson,
    },
    select: INTAKE_FORM_DEFINITION_SELECT,
  });

  const result = toIntakeFormDefinitionShape(upserted);
  if (!result) {
    throw new Error("Failed to provision default office intake form definition.");
  }
  return result;
}
