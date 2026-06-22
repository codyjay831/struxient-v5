import { LeadChannel, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  DEFAULT_INTAKE_FORM_SCHEMA,
  type IntakeFormDefinitionShape,
} from "@/lib/intake/default-intake-form";
import { DEFAULT_PUBLIC_REQUEST_TYPE_OPTIONS } from "@/lib/public-request-settings-defaults";
import {
  INTAKE_FORM_DEFINITION_SELECT,
  PUBLIC_INTAKE_FORM_WHERE,
  toIntakeFormDefinitionShape,
} from "@/lib/intake/intake-form-surface";

const DEFAULT_PUBLIC_INTAKE_SLUG = "default";
const DEFAULT_PUBLIC_INTAKE_NAME = "Service Request";

/**
 * Ensures the org has a published default public WEB_FORM definition.
 * Used when loading `/request/[companySlug]` so submit always has a real
 * `formDefinitionId` (compatible with formSnapshot provenance).
 */
export async function ensureDefaultPublicIntakeFormDefinition(
  organizationId: string,
): Promise<IntakeFormDefinitionShape> {
  const existing = await db.intakeFormDefinition.findFirst({
    where: {
      organizationId,
      ...PUBLIC_INTAKE_FORM_WHERE,
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

  const schemaJson = DEFAULT_INTAKE_FORM_SCHEMA as unknown as Prisma.InputJsonValue;
  const triageRulesJson = {
    requestTypeOptions: DEFAULT_PUBLIC_REQUEST_TYPE_OPTIONS,
  } as Prisma.InputJsonValue;

  const upserted = await db.intakeFormDefinition.upsert({
    where: {
      organizationId_slug: {
        organizationId,
        slug: DEFAULT_PUBLIC_INTAKE_SLUG,
      },
    },
    create: {
      organizationId,
      slug: DEFAULT_PUBLIC_INTAKE_SLUG,
      name: DEFAULT_PUBLIC_INTAKE_NAME,
      channel: LeadChannel.WEB_FORM,
      isPublic: true,
      isDefault: true,
      schema: schemaJson,
      triageRules: triageRulesJson,
    },
    update: {
      name: DEFAULT_PUBLIC_INTAKE_NAME,
      channel: LeadChannel.WEB_FORM,
      isPublic: true,
      isDefault: true,
      archivedAt: null,
      schema: schemaJson,
    },
    select: INTAKE_FORM_DEFINITION_SELECT,
  });

  const result = toIntakeFormDefinitionShape(upserted);
  if (!result) {
    throw new Error("Failed to provision default public intake form definition.");
  }
  return result;
}
