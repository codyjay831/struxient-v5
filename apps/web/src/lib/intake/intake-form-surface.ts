import { LeadChannel, Prisma } from "@prisma/client";
import type { IntakeFormDefinitionShape, IntakeFormSchema } from "@/lib/intake/default-intake-form";

/** Public customer request forms: `/request/...` and public custom slugs. */
export const PUBLIC_INTAKE_FORM_WHERE = {
  channel: LeadChannel.WEB_FORM,
  isPublic: true,
} as const satisfies Prisma.IntakeFormDefinitionWhereInput;

/** Office new-lead form: `/leads/new` (staff workspace). */
export const OFFICE_INTAKE_FORM_WHERE = {
  channel: LeadChannel.MANUAL,
  isPublic: false,
} as const satisfies Prisma.IntakeFormDefinitionWhereInput;

export type IntakeFormSurface = "public" | "office";

export function intakeFormSurfaceWhere(
  surface: IntakeFormSurface,
): Prisma.IntakeFormDefinitionWhereInput {
  return surface === "public" ? { ...PUBLIC_INTAKE_FORM_WHERE } : { ...OFFICE_INTAKE_FORM_WHERE };
}

type IntakeFormDefinitionRow = {
  id: string;
  name: string;
  slug: string;
  channel: LeadChannel;
  isPublic: boolean;
  isDefault: boolean;
  schema: unknown;
};

export function toIntakeFormDefinitionShape(
  row: IntakeFormDefinitionRow,
): IntakeFormDefinitionShape | null {
  if (!row.schema || typeof row.schema !== "object") {
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    channel: row.channel,
    isPublic: row.isPublic,
    isDefault: row.isDefault,
    schema: row.schema as IntakeFormSchema,
  };
}

const INTAKE_FORM_DEFINITION_SELECT = {
  id: true,
  name: true,
  slug: true,
  channel: true,
  isPublic: true,
  isDefault: true,
  schema: true,
} as const;

export { INTAKE_FORM_DEFINITION_SELECT };

/**
 * Clears `isDefault` on other forms in the same surface family (channel + isPublic).
 */
export async function clearOtherDefaultsForIntakeSurface(
  tx: Prisma.TransactionClient,
  organizationId: string,
  surface: IntakeFormSurface,
  exceptFormId: string,
): Promise<void> {
  await tx.intakeFormDefinition.updateMany({
    where: {
      organizationId,
      ...intakeFormSurfaceWhere(surface),
      isDefault: true,
      id: { not: exceptFormId },
    },
    data: { isDefault: false },
  });
}

export function formBelongsToIntakeSurface(
  form: { channel: LeadChannel; isPublic: boolean },
  surface: IntakeFormSurface,
): boolean {
  if (surface === "public") {
    return form.channel === LeadChannel.WEB_FORM && form.isPublic === true;
  }
  return form.channel === LeadChannel.MANUAL && form.isPublic === false;
}

/** Prisma where clause for submit-time validation of a stored form definition id. */
export function intakeFormDefinitionWhereForSurface(
  surface: IntakeFormSurface,
  organizationId: string,
  formDefinitionId: string,
): Prisma.IntakeFormDefinitionWhereInput {
  return {
    id: formDefinitionId,
    organizationId,
    archivedAt: null,
    ...intakeFormSurfaceWhere(surface),
  };
}
