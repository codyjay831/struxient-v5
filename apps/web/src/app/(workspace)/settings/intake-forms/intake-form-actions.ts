"use server";

import { db } from "@/lib/db";
import { getSettingsRequestContextOrThrow } from "@/lib/auth-context";
import { LeadChannel, Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { TRADE_STARTERS } from "@/lib/intake/trade-starters";
import {
  normalizePublicIntakeFormSlug,
  publicIntakeCreateDefaults,
} from "@/lib/intake/public-intake-form-constraints";
import {
  clearOtherDefaultsForIntakeSurface,
  formBelongsToIntakeSurface,
} from "@/lib/intake/intake-form-surface";
import { validateRequestTypeOptionsJson } from "@/lib/public-request-settings-validation";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
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
  const templateSlug = formData.get("templateSlug") as string;

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

  const template = templateSlug ? TRADE_STARTERS.find((s) => s.slug === templateSlug) : null;

  try {
    const form = await db.intakeFormDefinition.create({
      data: {
        organizationId: ctx.organizationId,
        name,
        slug,
        // Public intake forms flow: always WEB_FORM + public.
        channel: defaults.channel,
        isPublic: defaults.isPublic,
        schema: (template?.schema || {
          sections: [
            {
              key: "contact",
              title: "Contact Information",
              fields: [
                { key: "contact.name" },
                { key: "contact.email" },
                { key: "contact.phone" },
              ],
            },
            {
              key: "project",
              title: "Project Details",
              fields: [
                { key: "address.service" },
                { key: "scope.text" },
              ],
            },
          ],
        }) as Prisma.InputJsonValue,
      },
    });

    revalidatePath("/settings/intake-forms");
    redirect(`/settings/intake-forms/${form.id}`);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "A form with this slug already exists." };
    }
    console.error("Failed to create intake form", e);
    return { error: "Failed to create intake form." };
  }
}

export async function updateIntakeFormAction(
  formId: string,
  _prevState: IntakeFormState,
  formData: FormData,
): Promise<IntakeFormState> {
  const ctx = await getSettingsRequestContextOrThrow();

  const name = formData.get("name") as string;
  const isPublic = formData.get("isPublic") === "on";
  const isDefault = formData.get("isDefault") === "on";
  const schemaJson = formData.get("schema") as string;
  const requestTypesJson = formData.get("requestTypesJson") as string | null;

  if (!name) {
    return { error: "Name is required." };
  }

  try {
    const existing = await db.intakeFormDefinition.findFirst({
      where: { id: formId, organizationId: ctx.organizationId },
      select: { channel: true, isPublic: true, triageRules: true },
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
      isPublic,
      isDefault,
    };

    if (schemaJson) {
      data.schema = JSON.parse(schemaJson) as Prisma.InputJsonValue;
    }

    if (surface === "public") {
      data.isPublic = true;
      if (!requestTypesJson) {
        return { error: "Request type options are required." };
      }
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(requestTypesJson) as unknown;
      } catch {
        return { error: "Request type options must be valid JSON." };
      }
      const typesResult = validateRequestTypeOptionsJson(parsedJson);
      if (!typesResult.ok) {
        return { error: typesResult.error };
      }
      if (typesResult.options.length < 1) {
        return { error: "Add at least one request type." };
      }
      const triageBase = isRecord(existing.triageRules) ? existing.triageRules : {};
      data.triageRules = {
        ...triageBase,
        requestTypeOptions: typesResult.options,
      } as Prisma.InputJsonValue;
    }

    await db.$transaction(async (tx) => {
      await tx.intakeFormDefinition.update({
        where: { id: formId, organizationId: ctx.organizationId },
        data,
      });

      if (isDefault && surface) {
        await clearOtherDefaultsForIntakeSurface(
          tx,
          ctx.organizationId,
          surface,
          formId,
        );
      }
    });

    revalidatePath("/settings/intake-forms");
    revalidatePath(`/settings/intake-forms/${formId}`);
    revalidatePath("/settings/intake");
    revalidatePath("/settings/public-request-settings");
    if (surface === "public") {
      revalidatePath("/request", "layout");
    }
    return {};
  } catch (e) {
    console.error("Failed to update intake form", e);
    return { error: "Failed to update intake form." };
  }
}
