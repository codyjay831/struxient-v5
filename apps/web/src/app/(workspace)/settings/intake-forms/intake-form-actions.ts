"use server";

import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { LeadChannel, Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { TRADE_STARTERS } from "@/lib/intake/trade-starters";

export type IntakeFormState = {
  error?: string;
};

export async function createIntakeFormAction(
  _prevState: IntakeFormState,
  formData: FormData,
): Promise<IntakeFormState> {
  const ctx = await getRequestContextOrThrow();

  const name = formData.get("name") as string;
  const slug = formData.get("slug") as string;
  const channel = formData.get("channel") as LeadChannel;
  const isPublic = formData.get("isPublic") === "on";
  const templateSlug = formData.get("templateSlug") as string;

  if (!name || !slug) {
    return { error: "Name and slug are required." };
  }

  const template = templateSlug ? TRADE_STARTERS.find((s) => s.slug === templateSlug) : null;

  try {
    const form = await db.intakeFormDefinition.create({
      data: {
        organizationId: ctx.organizationId,
        name,
        slug: slug.toLowerCase(),
        channel,
        isPublic,
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
  const ctx = await getRequestContextOrThrow();

  const name = formData.get("name") as string;
  const isPublic = formData.get("isPublic") === "on";
  const isDefault = formData.get("isDefault") === "on";
  const schemaJson = formData.get("schema") as string;

  if (!name) {
    return { error: "Name is required." };
  }

  try {
    const data: Prisma.IntakeFormDefinitionUpdateInput = {
      name,
      isPublic,
      isDefault,
    };

    if (schemaJson) {
      data.schema = JSON.parse(schemaJson) as Prisma.InputJsonValue;
    }

    await db.intakeFormDefinition.update({
      where: { id: formId, organizationId: ctx.organizationId },
      data,
    });

    if (isDefault) {
      // Unset other defaults
      await db.intakeFormDefinition.updateMany({
        where: {
          organizationId: ctx.organizationId,
          id: { not: formId },
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    revalidatePath("/settings/intake-forms");
    revalidatePath(`/settings/intake-forms/${formId}`);
    return {};
  } catch (e) {
    console.error("Failed to update intake form", e);
    return { error: "Failed to update intake form." };
  }
}
