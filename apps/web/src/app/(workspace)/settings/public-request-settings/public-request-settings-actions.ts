"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { PUBLIC_REQUEST_SETTINGS_LIMITS } from "@/lib/public-request-settings-limits";
import {
  DEFAULT_PUBLIC_REQUEST_FORM_TITLE,
  DEFAULT_PUBLIC_REQUEST_SUBMIT_BUTTON_TEXT,
} from "@/lib/public-request-settings-defaults";
export type PublicRequestSettingsFormState = {
  error?: string;
  success?: boolean;
};

function trimOrEmpty(value: FormDataEntryValue | null): string {
  if (value == null || typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function enforceMax(
  label: string,
  value: string,
  max: number,
): PublicRequestSettingsFormState | null {
  if (value.length > max) {
    return { error: `${label} is too long (max ${max} characters).` };
  }
  return null;
}

export async function updatePublicRequestSettingsAction(
  _prevState: PublicRequestSettingsFormState,
  formData: FormData,
): Promise<PublicRequestSettingsFormState> {
  void _prevState;

  const ctx = await getRequestContextOrThrow();

  const enabled = formData.get("publicRequestEnabled") === "on";
  const instantQuoteEnabled =
    formData.get("instantQuoteEnabled") === "on" ||
    formData.get("instantQuoteEnabled") === "true";
  const showInstantQuoteDetails =
    formData.get("showInstantQuoteDetails") === "on" ||
    formData.get("showInstantQuoteDetails") === "true";

  const formTitle = trimOrEmpty(formData.get("formTitle"));
  if (!formTitle) {
    return { error: "Public form title is required." };
  }
  const formTitleErr = enforceMax("Public form title", formTitle, PUBLIC_REQUEST_SETTINGS_LIMITS.formTitle);
  if (formTitleErr) {
    return formTitleErr;
  }

  const introRaw = formData.get("introMessage");
  const introMessage =
    introRaw == null || typeof introRaw !== "string"
      ? null
      : introRaw.trim() === ""
        ? null
        : introRaw.trim();
  if (introMessage) {
    const err = enforceMax("Intro / help message", introMessage, PUBLIC_REQUEST_SETTINGS_LIMITS.introMessage);
    if (err) {
      return err;
    }
  }

  const emergencyRaw = formData.get("emergencyWarningText");
  const emergencyWarningText =
    emergencyRaw == null || typeof emergencyRaw !== "string"
      ? null
      : emergencyRaw.trim() === ""
        ? null
        : emergencyRaw.trim();
  if (emergencyWarningText) {
    const err = enforceMax(
      "Emergency warning",
      emergencyWarningText,
      PUBLIC_REQUEST_SETTINGS_LIMITS.emergencyWarningText,
    );
    if (err) {
      return err;
    }
  }

  const submitButtonText = trimOrEmpty(formData.get("submitButtonText"));
  if (!submitButtonText) {
    return { error: "Submit button text is required." };
  }
  const submitErr = enforceMax(
    "Submit button text",
    submitButtonText,
    PUBLIC_REQUEST_SETTINGS_LIMITS.submitButtonText,
  );
  if (submitErr) {
    return submitErr;
  }

  const offeringsRaw = trimOrEmpty(formData.get("offerings"));
  const offerings = offeringsRaw ? offeringsRaw.split(",").map(s => s.trim()).filter(Boolean) : [];

  try {
    await db.publicRequestSettings.upsert({
      where: { organizationId: ctx.organizationId },
      create: {
        organizationId: ctx.organizationId,
        enabled,
        formTitle,
        introMessage,
        emergencyWarningText,
        submitButtonText,
        instantQuoteEnabled,
        showInstantQuoteDetails,
        offerings,
      },
      update: {
        enabled,
        formTitle,
        introMessage,
        emergencyWarningText,
        submitButtonText,
        instantQuoteEnabled,
        showInstantQuoteDetails,
        offerings,
      },
    });
  } catch {
    return { error: "Settings could not be saved. Please try again." };
  }

  revalidatePath("/leads");
  revalidatePath("/settings/public-request-settings");
  revalidatePath("/settings/intake");
  revalidatePath("/settings");

  return { success: true };
}

export async function updatePublicRequestEnabledAction(enabled: boolean) {
  const ctx = await getRequestContextOrThrow();

  if (typeof enabled !== "boolean") {
    return { success: false, error: "Invalid request status." };
  }

  try {
    await db.publicRequestSettings.upsert({
      where: { organizationId: ctx.organizationId },
      create: {
        organizationId: ctx.organizationId,
        enabled,
        formTitle: DEFAULT_PUBLIC_REQUEST_FORM_TITLE,
        submitButtonText: DEFAULT_PUBLIC_REQUEST_SUBMIT_BUTTON_TEXT,
      },
      update: {
        enabled,
      },
    });
  } catch (error) {
    console.error("Failed to update public request enabled state:", error);
    return { success: false, error: "Could not update public request status." };
  }

  revalidatePath("/leads");
  revalidatePath("/settings/public-request-settings");
  revalidatePath("/settings/intake");
  revalidatePath("/settings");

  return { success: true };
}
