"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import {
  createCustomerServiceLocationAction,
  updateCustomerServiceLocationAction,
  type CustomerServiceLocationFormState,
} from "@/app/(workspace)/customers/customer-service-location-actions";
import { ServiceAddressCaptureField } from "@/components/forms/service-address-capture-field";
import {
  PUBLIC_INTAKE_SERVICE_LOCATION_SCHEMA_VERSION,
  type PublicIntakeServiceLocationV1,
} from "@/lib/public-intake-service-location";
import { CustomerServiceLocationSource } from "@prisma/client";

const fieldLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";
const controlClass =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const primaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-4 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

const initialState: CustomerServiceLocationFormState = {};

function rowToSnapshot(row: {
  formattedAddress: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  googlePlaceId: string;
  latitude: number | null;
  longitude: number | null;
  source: CustomerServiceLocationSource;
}): PublicIntakeServiceLocationV1 {
  return {
    schemaVersion: PUBLIC_INTAKE_SERVICE_LOCATION_SCHEMA_VERSION,
    formattedAddress: row.formattedAddress,
    addressLine1: row.addressLine1 || row.formattedAddress,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    country: row.country,
    googlePlaceId: row.googlePlaceId,
    latitude: row.latitude,
    longitude: row.longitude,
    source: row.source === CustomerServiceLocationSource.google_places ? "google_places" : "manual",
  };
}

export type AddOrEditServiceLocationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  googleMapsApiKey: string;
  customerId: string;
  mode: "create" | "edit";
  /** Required when mode is "edit". */
  existingLocation?: {
    id: string;
    formattedAddress: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    googlePlaceId: string;
    latitude: number | null;
    longitude: number | null;
    source: CustomerServiceLocationSource;
  };
  onSaved?: () => void;
};

export function AddOrEditServiceLocationDialog({
  open,
  onOpenChange,
  googleMapsApiKey,
  customerId,
  mode,
  existingLocation,
  onSaved,
}: AddOrEditServiceLocationDialogProps) {
  const titleId = useId();
  const formKey =
    mode === "edit" && existingLocation
      ? `edit-${existingLocation.id}`
      : `create-${customerId}`;

  const createAction = createCustomerServiceLocationAction.bind(null, customerId);
  const updateAction =
    mode === "edit" && existingLocation
      ? updateCustomerServiceLocationAction.bind(null, existingLocation.id)
      : createAction;

  const action = mode === "edit" && existingLocation ? updateAction : createAction;
  const [state, formAction, isPending] = useActionState(action, initialState);

  const prevSuccess = useRef(false);
  useEffect(() => {
    if (state.success && !prevSuccess.current) {
      prevSuccess.current = true;
      onOpenChange(false);
      onSaved?.();
    } else if (!state.success) {
      prevSuccess.current = false;
    }
  }, [state.success, onOpenChange, onSaved]);

  if (!open) {
    return null;
  }

  const defaultDisplay =
    mode === "edit" && existingLocation
      ? existingLocation.formattedAddress.trim() || existingLocation.addressLine1
      : "";

  const initialJson =
    mode === "edit" && existingLocation
      ? JSON.stringify(rowToSnapshot(existingLocation))
      : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onOpenChange(false);
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-background p-5 shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-base font-semibold text-foreground">
          {mode === "edit" ? "Edit service address" : "Add service address"}
        </h2>
        <p className="mt-1 text-xs text-foreground-muted">
          {mode === "edit"
            ? "Update the project address or jobsite for this customer."
            : "Save the project address or jobsite for this customer."}
        </p>

        <form key={formKey} action={formAction} className="mt-5 space-y-4">
          {state.error ? (
            <p
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {state.error}
            </p>
          ) : null}

          <ServiceAddressCaptureField
            googleMapsApiKey={googleMapsApiKey}
            fieldLabelClass={fieldLabelClass}
            controlClass={controlClass}
            required
            defaultDisplayAddress={defaultDisplay}
            initialStructuredJson={initialJson}
          />

          <div className="flex flex-wrap gap-2 pt-2">
            <button type="submit" disabled={isPending} className={primaryButtonClass}>
              {isPending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
