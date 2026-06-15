"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getMutableRequestContextOrThrow } from "@/lib/auth-context";
import { saveBusinessProfile } from "@/lib/business-profile/business-profile-service";

export type OnboardingBusinessProfileState = {
  error?: string;
};

function parseMultiValue(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
}

function parseNullableSingle(formData: FormData, key: string): string | null {
  const raw = formData.get(key);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function saveBusinessProfileOnboardingAction(
  _prevState: OnboardingBusinessProfileState,
  formData: FormData,
): Promise<OnboardingBusinessProfileState> {
  void _prevState;
  const ctx = await getMutableRequestContextOrThrow();
  const result = await saveBusinessProfile(ctx, {
    trades: parseMultiValue(formData, "trades"),
    workTypes: parseMultiValue(formData, "workTypes"),
    customerMarkets: parseMultiValue(formData, "customerMarkets"),
    operatingModel: parseNullableSingle(formData, "operatingModel"),
    teamSize: parseNullableSingle(formData, "teamSize"),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/settings/organization");
  revalidatePath("/onboarding/business-profile");
  redirect("/onboarding/billing");
}

export async function skipBusinessProfileOnboardingAction() {
  redirect("/onboarding/billing");
}

