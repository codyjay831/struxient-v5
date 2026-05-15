"use server";

import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { TRADE_STARTERS } from "@/lib/intake/trade-starters";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

export async function seedTradeStartersAction(tradeSlug: string) {
  const ctx = await getRequestContextOrThrow();

  const template = TRADE_STARTERS.find(s => s.slug === tradeSlug);
  if (!template) throw new Error("Template not found");

  await db.intakeFormDefinition.create({
    data: {
      organizationId: ctx.organizationId,
      name: template.name,
      slug: template.slug,
      channel: template.channel,
      isPublic: template.isPublic,
      isDefault: true,
      schema: template.schema as Prisma.InputJsonValue,
    },
  });

  revalidatePath("/settings/intake-forms");
  redirect("/settings/intake-forms");
}
