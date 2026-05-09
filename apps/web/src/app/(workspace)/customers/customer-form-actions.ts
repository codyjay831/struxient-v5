"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { CUSTOMER_FIELD_LIMITS } from "./customer-field-limits";

export type CustomerFormState = {
  error?: string;
};

function trimOrNull(value: FormDataEntryValue | null): string | null {
  if (value == null || typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function trimRequired(value: FormDataEntryValue | null): string {
  if (value == null || typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function enforceMaxLength(label: string, value: string, max: number): CustomerFormState | null {
  if (value.length > max) {
    return { error: `${label} is too long (max ${max} characters).` };
  }
  return null;
}

/** Loose sanity check for stored email; avoids accepting obvious garbage while staying pragmatic. */
function isReasonableEmail(value: string): boolean {
  if (value.length > CUSTOMER_FIELD_LIMITS.email) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function createCustomerAction(
  _prevState: CustomerFormState,
  formData: FormData
): Promise<CustomerFormState> {
  const displayName = trimRequired(formData.get("displayName"));
  if (!displayName) {
    return { error: "Display name is required." };
  }
  const displayErr = enforceMaxLength(
    "Display name",
    displayName,
    CUSTOMER_FIELD_LIMITS.displayName,
  );
  if (displayErr) {
    return displayErr;
  }

  const ctx = await getRequestContextOrThrow();
  const companyName = trimOrNull(formData.get("companyName"));
  const email = trimOrNull(formData.get("email"));
  const phone = trimOrNull(formData.get("phone"));
  const notes = trimOrNull(formData.get("notes"));

  if (companyName) {
    const err = enforceMaxLength("Company", companyName, CUSTOMER_FIELD_LIMITS.companyName);
    if (err) {
      return err;
    }
  }
  if (email) {
    const err = enforceMaxLength("Email", email, CUSTOMER_FIELD_LIMITS.email);
    if (err) {
      return err;
    }
    if (!isReasonableEmail(email)) {
      return { error: "Enter a valid email address, or leave the field blank." };
    }
  }
  if (phone) {
    const err = enforceMaxLength("Phone", phone, CUSTOMER_FIELD_LIMITS.phone);
    if (err) {
      return err;
    }
  }
  if (notes) {
    const err = enforceMaxLength("Internal notes", notes, CUSTOMER_FIELD_LIMITS.notes);
    if (err) {
      return err;
    }
  }

  const customer = await db.customer.create({
    data: {
      organizationId: ctx.organizationId,
      displayName,
      companyName,
      email,
      phone,
      notes,
    },
  });

  redirect(`/customers/${customer.id}`);
}

/**
 * `customerId` must be supplied via `.bind(null, customerId)` from the edit route so the
 * record key cannot be swapped client-side to update a different row in the same org.
 */
export async function updateCustomerAction(
  customerId: string,
  _prevState: CustomerFormState,
  formData: FormData
): Promise<CustomerFormState> {
  const id = customerId.trim();
  if (!id) {
    return { error: "Missing customer record id." };
  }

  const displayName = trimRequired(formData.get("displayName"));
  if (!displayName) {
    return { error: "Display name is required." };
  }
  const displayErr = enforceMaxLength(
    "Display name",
    displayName,
    CUSTOMER_FIELD_LIMITS.displayName,
  );
  if (displayErr) {
    return displayErr;
  }

  const ctx = await getRequestContextOrThrow();
  const companyName = trimOrNull(formData.get("companyName"));
  const email = trimOrNull(formData.get("email"));
  const phone = trimOrNull(formData.get("phone"));
  const notes = trimOrNull(formData.get("notes"));

  if (companyName) {
    const err = enforceMaxLength("Company", companyName, CUSTOMER_FIELD_LIMITS.companyName);
    if (err) {
      return err;
    }
  }
  if (email) {
    const err = enforceMaxLength("Email", email, CUSTOMER_FIELD_LIMITS.email);
    if (err) {
      return err;
    }
    if (!isReasonableEmail(email)) {
      return { error: "Enter a valid email address, or leave the field blank." };
    }
  }
  if (phone) {
    const err = enforceMaxLength("Phone", phone, CUSTOMER_FIELD_LIMITS.phone);
    if (err) {
      return err;
    }
  }
  if (notes) {
    const err = enforceMaxLength("Internal notes", notes, CUSTOMER_FIELD_LIMITS.notes);
    if (err) {
      return err;
    }
  }

  const result = await db.customer.updateMany({
    where: {
      id,
      organizationId: ctx.organizationId,
    },
    data: {
      displayName,
      companyName,
      email,
      phone,
      notes,
    },
  });

  if (result.count === 0) {
    return {
      error: "This customer was not updated. It may not exist in your organization or may belong to another tenant.",
    };
  }

  redirect(`/customers/${id}`);
}
