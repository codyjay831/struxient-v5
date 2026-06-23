"use server";

import { db } from "@/lib/db";
import { getSettingsRequestContextOrThrow } from "@/lib/auth-context";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  normalizePublicIntakeFormSlug,
  publicIntakeCreateDefaults,
} from "@/lib/intake/public-intake-form-constraints";
import { clonePrimaryPublicIntakeFormSchema } from "@/lib/intake/ensure-default-public-intake-form";
import { formBelongsToIntakeSurface } from "@/lib/intake/intake-form-surface";
import {
  canArchiveSpecializedIntakeForm,
  canRestoreSpecializedIntakeForm,
} from "@/lib/intake/intake-form-archive";
import { resolveIntakeFormSlugOnCreate } from "@/lib/intake/intake-form-slug-create";
import { validateRequestTypeOptionsJson } from "@/lib/public-request-settings-validation";
import { validatePublicIntakeSchema } from "@/lib/intake/public-intake-schema-invariants";
import type { IntakeFormSchema } from "@/lib/intake/default-intake-form";
import { DEFAULT_PUBLIC_REQUEST_TYPE_OPTIONS } from "@/lib/public-request-settings-defaults";
import {
  INTAKE_SETTINGS_HUB_PATH,
  INTAKE_SPECIALIZED_PATH,
  INTAKE_STAFF_PATH,
  intakeFormEditorPath,
} from "@/lib/intake-settings-hierarchy";

/**
 * Intake settings source-of-truth boundaries:
 * - Form field layout → IntakeFormDefinition.schema
 * - Request/service type options → IntakeFormDefinition.triageRules.requestTypeOptions
 * - Public page copy & availability → PublicRequestSettings
 * - Submitted lead facts → Lead via ingestLead (not configured here)
 *
 * LeadCustomFieldDef composer/renderer wiring is intentionally deferred.
 */

function revalidateIntakeFormPaths(formId: string, surface: "public" | "office" | null) {
  revalidatePath(INTAKE_SETTINGS_HUB_PATH);
  revalidatePath(INTAKE_SPECIALIZED_PATH);
  revalidatePath(INTAKE_STAFF_PATH);
  revalidatePath(intakeFormEditorPath(formId));
  revalidatePath("/settings/intake/public");
  if (surface === "public") {
    revalidatePath("/request", "layout");
  }
  if (surface === "office") {
    revalidatePath("/leads/new");
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseAndMergeRequestTypeOptions(
  existingTriageRules: unknown,
  requestTypesJson: string | null,
): { ok: true; triageRules: Prisma.InputJsonValue } | { ok: false; error: string } {
  if (!requestTypesJson) {
    return { ok: false, error: "Request type options are required." };
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(requestTypesJson) as unknown;
  } catch {
    return { ok: false, error: "Request type options must be valid JSON." };
  }
  const typesResult = validateRequestTypeOptionsJson(parsedJson);
  if (!typesResult.ok) {
    return { ok: false, error: typesResult.error };
  }
  if (typesResult.options.length < 1) {
    return { ok: false, error: "Add at least one request type." };
  }
  const triageBase = isRecord(existingTriageRules) ? existingTriageRules : {};
  return {
    ok: true,
    triageRules: {
      ...triageBase,
      requestTypeOptions: typesResult.options,
    } as Prisma.InputJsonValue,
  };
}

export type IntakeFormState = {
  error?: string;
};

export async function createIntakeFormAction(
  _prevState: IntakeFormState,
  formData: FormData,
): Promise<IntakeFormState> {
  const ctx = await getSettingsRequestContextOrThrow();

  const name = formData.get("name") as string;
  const slugRaw = formData.get("slug") as string | null;
  const slug = normalizePublicIntakeFormSlug(slugRaw);

  if (!name) {
    return { error: "Name and slug are required." };
  }
  if (!slug) {
    if ((slugRaw ?? "").trim().length === 0) {
      return { error: "Name and slug are required." };
    }
    return {
      error:
        "Slug must use lowercase letters, numbers, and single hyphens only (for example: roofing-estimate).",
    };
  }
  const defaults = publicIntakeCreateDefaults();
  const schema = await clonePrimaryPublicIntakeFormSchema(ctx.organizationId);
  const triageRules = {
    requestTypeOptions: DEFAULT_PUBLIC_REQUEST_TYPE_OPTIONS,
  } as Prisma.InputJsonValue;

  let formId: string;

  try {
    const existingBySlug = await db.intakeFormDefinition.findFirst({
      where: {
        organizationId: ctx.organizationId,
        slug,
      },
      select: {
        id: true,
        archivedAt: true,
        isDefault: true,
      },
    });

    const slugAction = resolveIntakeFormSlugOnCreate(existingBySlug);
    if (slugAction === "error_active") {
      return { error: "A form with this slug already exists." };
    }

    if (slugAction === "restore_archived" && existingBySlug) {
      const restored = await db.intakeFormDefinition.update({
        where: { id: existingBySlug.id, organizationId: ctx.organizationId },
        data: {
          name,
          archivedAt: null,
          channel: defaults.channel,
          isPublic: defaults.isPublic,
          isDefault: false,
          schema: schema as Prisma.InputJsonValue,
          triageRules,
        },
      });

      formId = restored.id;
    } else {
      const form = await db.intakeFormDefinition.create({
        data: {
          organizationId: ctx.organizationId,
          name,
          slug,
          channel: defaults.channel,
          isPublic: defaults.isPublic,
          isDefault: false,
          schema: schema as Prisma.InputJsonValue,
          triageRules,
        },
      });

      formId = form.id;
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "A form with this slug already exists." };
    }
    console.error("Failed to create intake form", e);
    return { error: "Failed to create intake form." };
  }

  revalidatePath(INTAKE_SPECIALIZED_PATH);
  redirect(intakeFormEditorPath(formId));
}

export async function updateIntakeFormAction(
  formId: string,
  _prevState: IntakeFormState,
  formData: FormData,
): Promise<IntakeFormState> {
  const ctx = await getSettingsRequestContextOrThrow();

  const name = formData.get("name") as string;
  const isPublic = formData.get("isPublic") === "on";
  const schemaJson = formData.get("schema") as string;
  const requestTypesJson = formData.get("requestTypesJson") as string | null;

  if (!name) {
    return { error: "Name is required." };
  }

  try {
    const existing = await db.intakeFormDefinition.findFirst({
      where: { id: formId, organizationId: ctx.organizationId },
      select: { channel: true, isPublic: true, triageRules: true, isDefault: true },
    });
    if (!existing) {
      return { error: "Form not found." };
    }

    const surface = formBelongsToIntakeSurface(existing, "public")
      ? ("public" as const)
      : formBelongsToIntakeSurface(existing, "office")
        ? ("office" as const)
        : null;

    const data: Prisma.IntakeFormDefinitionUpdateInput = {
      name,
      isPublic: surface === "public" ? true : isPublic,
      isDefault: existing.isDefault,
    };

    if (schemaJson) {
      const parsedSchema = JSON.parse(schemaJson) as IntakeFormSchema;
      if (surface === "public") {
        const schemaValidation = validatePublicIntakeSchema(parsedSchema);
        if (!schemaValidation.ok) {
          return { error: schemaValidation.error };
        }
      }
      data.schema = parsedSchema as Prisma.InputJsonValue;
    }

    if (surface === "public") {
      const mergedTypes = parseAndMergeRequestTypeOptions(existing.triageRules, requestTypesJson);
      if (!mergedTypes.ok) {
        return { error: mergedTypes.error };
      }
      data.triageRules = mergedTypes.triageRules;
    } else if (surface === "office") {
      const mergedTypes = parseAndMergeRequestTypeOptions(existing.triageRules, requestTypesJson);
      if (!mergedTypes.ok) {
        return { error: mergedTypes.error };
      }
      data.triageRules = mergedTypes.triageRules;
    }

    await db.intakeFormDefinition.update({
      where: { id: formId, organizationId: ctx.organizationId },
      data,
    });

    revalidateIntakeFormPaths(formId, surface);
    return {};
  } catch (e) {
    console.error("Failed to update intake form", e);
    return { error: "Failed to update intake form." };
  }
}

export async function archiveIntakeFormAction(formId: string): Promise<IntakeFormState> {
  const ctx = await getSettingsRequestContextOrThrow();

  const form = await db.intakeFormDefinition.findFirst({
    where: {
      id: formId,
      organizationId: ctx.organizationId,
      archivedAt: null,
    },
    select: {
      id: true,
      isDefault: true,
      channel: true,
      isPublic: true,
    },
  });

  if (!form) {
    return { error: "Form not found." };
  }

  if (!canArchiveSpecializedIntakeForm(form)) {
    return { error: "Only non-default specialized customer forms can be archived." };
  }

  await db.intakeFormDefinition.update({
    where: { id: formId, organizationId: ctx.organizationId },
    data: { archivedAt: new Date() },
  });

  revalidateIntakeFormPaths(formId, "public");

  return {};
}

export async function restoreIntakeFormAction(formId: string): Promise<IntakeFormState> {
  const ctx = await getSettingsRequestContextOrThrow();

  const form = await db.intakeFormDefinition.findFirst({
    where: {
      id: formId,
      organizationId: ctx.organizationId,
      archivedAt: { not: null },
    },
    select: {
      id: true,
      isDefault: true,
      channel: true,
      isPublic: true,
    },
  });

  if (!form) {
    return { error: "Form not found." };
  }

  if (!canRestoreSpecializedIntakeForm(form)) {
    return { error: "Only archived additional customer request links can be restored." };
  }

  await db.intakeFormDefinition.update({
    where: { id: formId, organizationId: ctx.organizationId },
    data: { archivedAt: null },
  });

  revalidateIntakeFormPaths(formId, "public");

  return {};
}
