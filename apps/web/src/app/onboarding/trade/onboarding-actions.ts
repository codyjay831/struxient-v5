"use server";

import { getMutableRequestContextOrThrow } from "@/lib/auth-context";
import { TRADE_STARTERS } from "@/lib/intake/trade-starters";
import { redirect } from "next/navigation";

export async function seedTradeStartersAction(tradeSlug: string) {
  await getMutableRequestContextOrThrow();

  const template = TRADE_STARTERS.find(s => s.slug === tradeSlug);
  if (!template) throw new Error("Template not found");

  const slug = encodeURIComponent(template.slug);
  redirect(`/settings/intake/specialized/new?starter=${slug}`);
}
