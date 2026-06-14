"use server";

import { revalidatePath } from "next/cache";
import { getSettingsRequestContextOrThrow } from "@/lib/auth-context";
import { saveBusinessProfile } from "@/lib/business-profile/business-profile-service";

export type BusinessProfileSettingsFormState = {
  error?: string;
  success?: boolean;
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

export async function saveBusinessProfileSettingsAction(
  _prevState: BusinessProfileSettingsFormState,
  formData: FormData,
): Promise<BusinessProfileSettingsFormState> {
  void _prevState;
  const ctx = await getSettingsRequestContextOrThrow();
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
  return { success: true };
}

