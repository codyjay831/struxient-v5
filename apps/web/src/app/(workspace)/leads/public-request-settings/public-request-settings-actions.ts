"use server";

import { revalidatePath } from "next/cache";
import { db, getDevOrganizationOrThrow } from "@/lib/db";
import { PUBLIC_REQUEST_SETTINGS_LIMITS } from "@/lib/public-request-settings-limits";
import { validateRequestTypeOptionsJson } from "@/lib/public-request-settings-validation";
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

  const org = await getDevOrganizationOrThrow();

  const enabled = formData.get("publicRequestEnabled") === "on";

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

  const jsonRaw = trimOrEmpty(formData.get("requestTypesJson"));
  if (!jsonRaw) {
    return { error: "Request type options are required." };
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonRaw) as unknown;
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

  try {
    await db.publicRequestSettings.upsert({
      where: { organizationId: org.id },
      create: {
        organizationId: org.id,
        enabled,
        formTitle,
        introMessage,
        emergencyWarningText,
        submitButtonText,
        requestTypeOptionsJson: typesResult.options,
      },
      update: {
        enabled,
        formTitle,
        introMessage,
        emergencyWarningText,
        submitButtonText,
        requestTypeOptionsJson: typesResult.options,
      },
    });
  } catch {
    return { error: "Settings could not be saved. Please try again." };
  }

  revalidatePath("/leads");
  revalidatePath("/leads/public-request-settings");

  return { success: true };
}
