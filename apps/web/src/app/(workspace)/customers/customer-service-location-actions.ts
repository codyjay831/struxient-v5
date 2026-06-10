"use server";

import { revalidatePath } from "next/cache";
import { CustomerServiceLocationSource } from "@prisma/client";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import {
  normalizeAddressDedupKey,
  upsertCustomerServiceLocationFromIntakeSnapshot,
} from "@/lib/customer-service-location-from-lead";
import { resolveServiceLocationSnapshotFromFormData } from "@/lib/service-address-form";
import type { PublicIntakeServiceLocationV1 } from "@/lib/public-lead-service-location";
import { CUSTOMER_FIELD_LIMITS } from "./customer-field-limits";

export type CustomerServiceLocationFormState = {
  error?: string;
  success?: boolean;
};

function revalidateCustomerSurfaces(customerId: string) {
  const cid = customerId.trim();
  revalidatePath("/customers");
  revalidatePath(`/customers/${cid}`);
  revalidatePath("/leads");
  revalidatePath("/jobs");
  revalidatePath("/workstation");
  revalidatePath("/workstation/tasks");
  revalidatePath("/workstation/jobs");
}

function snapshotToWriteData(snapshot: PublicIntakeServiceLocationV1) {
  const placeId = snapshot.googlePlaceId?.trim() ?? "";
  const formatted =
    snapshot.formattedAddress.trim() || snapshot.addressLine1.trim() || snapshot.addressLine1;
  const sourceEnum =
    snapshot.source === "google_places"
      ? CustomerServiceLocationSource.google_places
      : CustomerServiceLocationSource.manual;
  return {
    formattedAddress: formatted,
    addressLine1: snapshot.addressLine1.trim() || formatted,
    addressLine2: snapshot.addressLine2 ?? "",
    city: snapshot.city ?? "",
    state: snapshot.state ?? "",
    postalCode: snapshot.postalCode ?? "",
    country: snapshot.country ?? "",
    googlePlaceId: placeId,
    latitude: snapshot.latitude,
    longitude: snapshot.longitude,
    source: sourceEnum,
  };
}

/**
 * `customerId` must be bound from a server-trusted id (e.g. `.bind(null, customer.id)`).
 */
export async function createCustomerServiceLocationAction(
  customerId: string,
  _prevState: CustomerServiceLocationFormState,
  formData: FormData,
): Promise<CustomerServiceLocationFormState> {
  void _prevState;
  const cid = customerId.trim();
  if (!cid) {
    return { error: "Missing customer record id." };
  }

  const ctx = await getRequestContextOrThrow();
  const customer = await db.customer.findFirst({
    where: { id: cid, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!customer) {
    return { error: "Customer not found in your organization." };
  }

  const { snapshot, serviceAddressText } = resolveServiceLocationSnapshotFromFormData(formData);
  if (!snapshot || (!snapshot.formattedAddress.trim() && !snapshot.addressLine1.trim())) {
    if (!serviceAddressText) {
      return { error: "Enter a service address or project location." };
    }
    return { error: "That address could not be saved. Check the address and try again." };
  }

  try {
    const result = await db.$transaction(async (tx) => {
      return upsertCustomerServiceLocationFromIntakeSnapshot(tx, {
        organizationId: ctx.organizationId,
        customerId: cid,
        snapshot,
        label: null,
        createdFromLeadId: null,
      });
    });

    if (!result.created && result.skippedDuplicate) {
      revalidateCustomerSurfaces(cid);
      return { success: true };
    }
  } catch {
    return { error: "Could not save the address. Try again." };
  }

  revalidateCustomerSurfaces(cid);
  return { success: true };
}

/**
 * `serviceLocationId` must be bound from a server-trusted id.
 */
export async function updateCustomerServiceLocationAction(
  serviceLocationId: string,
  _prevState: CustomerServiceLocationFormState,
  formData: FormData,
): Promise<CustomerServiceLocationFormState> {
  void _prevState;
  const lid = serviceLocationId.trim();
  if (!lid) {
    return { error: "Missing service location id." };
  }

  const ctx = await getRequestContextOrThrow();
  const existing = await db.customerServiceLocation.findFirst({
    where: { id: lid, organizationId: ctx.organizationId },
    select: { id: true, customerId: true },
  });
  if (!existing) {
    return { error: "That service location was not found." };
  }

  const { snapshot, serviceAddressText } = resolveServiceLocationSnapshotFromFormData(formData);
  if (!snapshot || (!snapshot.formattedAddress.trim() && !snapshot.addressLine1.trim())) {
    if (!serviceAddressText) {
      return { error: "Enter a service address or project location." };
    }
    return { error: "That address could not be saved. Check the address and try again." };
  }

  const primary =
    snapshot.formattedAddress.trim() || snapshot.addressLine1.trim() || snapshot.addressLine1;
  if (primary.length > CUSTOMER_FIELD_LIMITS.displayName * 4) {
    return { error: "That address is too long." };
  }

  const placeId = snapshot.googlePlaceId?.trim() ?? "";
  const dedupFmt = normalizeAddressDedupKey(snapshot.formattedAddress, snapshot.addressLine1);

  const others = await db.customerServiceLocation.findMany({
    where: {
      organizationId: ctx.organizationId,
      customerId: existing.customerId,
      NOT: { id: lid },
    },
    select: { id: true, formattedAddress: true, googlePlaceId: true },
  });

  if (placeId.length > 0) {
    const dup = others.find((e) => (e.googlePlaceId ?? "").trim() === placeId);
    if (dup) {
      return { error: "This customer already has that address on file." };
    }
  }
  if (dedupFmt.length > 0) {
    const dup = others.find((e) => normalizeAddressDedupKey(e.formattedAddress, "") === dedupFmt);
    if (dup) {
      return { error: "This customer already has that address on file." };
    }
  }

  const write = snapshotToWriteData(snapshot);
  await db.customerServiceLocation.updateMany({
    where: { id: lid, organizationId: ctx.organizationId },
    data: write,
  });

  if (!existing.customerId) {
    return { error: "This service location is not linked to a customer profile yet." };
  }
  revalidateCustomerSurfaces(existing.customerId);
  return { success: true };
}

/**
 * Marks one location primary for a customer. `customerId` must be bound server-side.
 */
export async function setPrimaryCustomerServiceLocationAction(
  customerId: string,
  _prevState: CustomerServiceLocationFormState,
  formData: FormData,
): Promise<CustomerServiceLocationFormState> {
  void _prevState;
  const cid = customerId.trim();
  const locId =
    typeof formData.get("serviceLocationId") === "string"
      ? (formData.get("serviceLocationId") as string).trim()
      : "";
  if (!cid || !locId) {
    return { error: "Missing customer or location id." };
  }

  const ctx = await getRequestContextOrThrow();
  const loc = await db.customerServiceLocation.findFirst({
    where: {
      id: locId,
      customerId: cid,
      organizationId: ctx.organizationId,
    },
    select: { id: true },
  });
  if (!loc) {
    return { error: "That service location was not found." };
  }

  await db.$transaction([
    db.customerServiceLocation.updateMany({
      where: { customerId: cid, organizationId: ctx.organizationId },
      data: { isPrimary: false },
    }),
    db.customerServiceLocation.updateMany({
      where: { id: locId, customerId: cid, organizationId: ctx.organizationId },
      data: { isPrimary: true },
    }),
  ]);

  revalidateCustomerSurfaces(cid);
  return { success: true };
}
