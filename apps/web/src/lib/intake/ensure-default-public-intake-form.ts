import { LeadChannel, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  DEFAULT_INTAKE_FORM_SCHEMA,
  type IntakeFormDefinitionShape,
  type IntakeFormSchema,
} from "@/lib/intake/default-intake-form";
import { DEFAULT_PUBLIC_REQUEST_TYPE_OPTIONS } from "@/lib/public-request-settings-defaults";
import { resolvePublicFormRequestTypeOptions } from "@/lib/intake/public-intake-request-types";
import {
  INTAKE_FORM_DEFINITION_SELECT,
  PUBLIC_INTAKE_FORM_WHERE,
  toIntakeFormDefinitionShape,
} from "@/lib/intake/intake-form-surface";

export const DEFAULT_PRIMARY_INTAKE_SLUG = "default";
export const DEFAULT_PRIMARY_INTAKE_NAME = "Customer request";

type IntakeFormDefinitionUpsertPayload = Prisma.IntakeFormDefinitionGetPayload<{
  select: typeof INTAKE_FORM_DEFINITION_SELECT;
}>;

type IntakeFormDb = {
  intakeFormDefinition: {
    upsert(args: Prisma.IntakeFormDefinitionUpsertArgs): Promise<unknown>;
  };
};

function defaultTriageRulesJson(): Prisma.InputJsonValue {
  return {
    requestTypeOptions: DEFAULT_PUBLIC_REQUEST_TYPE_OPTIONS,
  } as Prisma.InputJsonValue;
}

function defaultSchemaJson(): Prisma.InputJsonValue {
  return DEFAULT_INTAKE_FORM_SCHEMA as unknown as Prisma.InputJsonValue;
}

/**
 * Idempotent Primary customer request link for a new org (signup) or slug `default` row.
 * Does not overwrite an existing form name or schema on update.
 */
export async function provisionDefaultPublicIntakeFormForOrganization(
  organizationId: string,
  tx: IntakeFormDb = db,
): Promise<IntakeFormDefinitionShape> {
  const upserted = (await tx.intakeFormDefinition.upsert({
    where: {
      organizationId_slug: {
        organizationId,
        slug: DEFAULT_PRIMARY_INTAKE_SLUG,
      },
    },
    create: {
      organizationId,
      slug: DEFAULT_PRIMARY_INTAKE_SLUG,
      name: DEFAULT_PRIMARY_INTAKE_NAME,
      channel: LeadChannel.WEB_FORM,
      isPublic: true,
      isDefault: true,
      schema: defaultSchemaJson(),
      triageRules: defaultTriageRulesJson(),
    },
    update: {
      channel: LeadChannel.WEB_FORM,
      isPublic: true,
      isDefault: true,
      archivedAt: null,
    },
    select: INTAKE_FORM_DEFINITION_SELECT,
  })) as IntakeFormDefinitionUpsertPayload;

  const result = toIntakeFormDefinitionShape(upserted);
  if (!result) {
    throw new Error("Failed to provision default public intake form definition.");
  }
  return result;
}

/** Deep-clone Primary link schema for copy-on-create additional links. */
export async function clonePrimaryPublicIntakeFormSchema(
  organizationId: string,
): Promise<IntakeFormSchema> {
  const primary = await db.intakeFormDefinition.findFirst({
    where: {
      organizationId,
      ...PUBLIC_INTAKE_FORM_WHERE,
      isDefault: true,
      archivedAt: null,
    },
    select: { schema: true },
    orderBy: { updatedAt: "desc" },
  });

  if (primary?.schema && typeof primary.schema === "object") {
    return JSON.parse(JSON.stringify(primary.schema)) as IntakeFormSchema;
  }

  return JSON.parse(JSON.stringify(DEFAULT_INTAKE_FORM_SCHEMA)) as IntakeFormSchema;
}

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
    select: {
      ...INTAKE_FORM_DEFINITION_SELECT,
      triageRules: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const shaped = existing ? toIntakeFormDefinitionShape(existing) : null;
  const triageRulesJson = defaultTriageRulesJson();
  const hasRequestTypeOptions = resolvePublicFormRequestTypeOptions(existing?.triageRules);
  if (shaped && hasRequestTypeOptions) {
    return shaped;
  }
  if (shaped && existing) {
    const repaired = await db.intakeFormDefinition.update({
      where: { id: existing.id },
      data: { triageRules: triageRulesJson },
      select: INTAKE_FORM_DEFINITION_SELECT,
    });
    const result = toIntakeFormDefinitionShape(repaired);
    if (!result) {
      throw new Error("Failed to backfill default public intake triageRules.");
    }
    return result;
  }

  return provisionDefaultPublicIntakeFormForOrganization(organizationId);
}
