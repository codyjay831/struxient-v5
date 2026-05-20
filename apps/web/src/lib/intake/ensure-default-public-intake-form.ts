import { LeadChannel, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  DEFAULT_INTAKE_FORM_SCHEMA,
  type IntakeFormDefinitionShape,
  type IntakeFormSchema,
} from "@/lib/intake/default-intake-form";

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
      channel: LeadChannel.WEB_FORM,
      isPublic: true,
      isDefault: true,
      archivedAt: null,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      channel: true,
      isPublic: true,
      isDefault: true,
      schema: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  if (existing?.schema && typeof existing.schema === "object") {
    return {
      id: existing.id,
      name: existing.name,
      slug: existing.slug,
      channel: existing.channel,
      isPublic: existing.isPublic,
      isDefault: existing.isDefault,
      schema: existing.schema as unknown as IntakeFormSchema,
    };
  }

  const schemaJson = DEFAULT_INTAKE_FORM_SCHEMA as unknown as Prisma.InputJsonValue;

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
    },
    update: {
      name: DEFAULT_PUBLIC_INTAKE_NAME,
      channel: LeadChannel.WEB_FORM,
      isPublic: true,
      isDefault: true,
      archivedAt: null,
      schema: schemaJson,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      channel: true,
      isPublic: true,
      isDefault: true,
      schema: true,
    },
  });

  return {
    id: upserted.id,
    name: upserted.name,
    slug: upserted.slug,
    channel: upserted.channel,
    isPublic: upserted.isPublic,
    isDefault: upserted.isDefault,
    schema: upserted.schema as unknown as IntakeFormSchema,
  };
}
