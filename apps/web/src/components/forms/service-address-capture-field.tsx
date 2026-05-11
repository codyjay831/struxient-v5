"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { LEAD_FIELD_LIMITS } from "@/app/(workspace)/sales/sales-field-limits";
import {
  PUBLIC_INTAKE_SERVICE_LOCATION_SCHEMA_VERSION,
  type PublicIntakeServiceLocationV1,
} from "@/lib/public-intake-service-location";

function loadGoogleMapsPlacesScript(apiKey: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }
  if (window.google?.maps?.places) {
    return Promise.resolve();
  }
  const existing = document.querySelector(
    'script[src^="https://maps.googleapis.com/maps/api/js"]',
  ) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.google?.maps?.places) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Google Maps script failed")),
        { once: true },
      );
    });
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Google Maps script failed"));
    document.head.appendChild(s);
  });
}

function componentLongName(
  components: google.maps.GeocoderAddressComponent[],
  ...types: string[]
): string {
  for (const t of types) {
    const c = components.find((x) => x.types.includes(t));
    if (c?.long_name) {
      return c.long_name;
    }
  }
  return "";
}

function placeToSnapshot(place: google.maps.places.PlaceResult): PublicIntakeServiceLocationV1 | null {
  const formattedAddress = (place.formatted_address ?? "").trim();
  const comps = place.address_components ?? [];
  const streetNumber = componentLongName(comps, "street_number");
  const route = componentLongName(comps, "route");
  const addressLine1 = [streetNumber, route].filter(Boolean).join(" ").trim();
  const subpremise = componentLongName(comps, "subpremise", "floor", "room");
  const premise = componentLongName(comps, "premise");
  const addressLine2 = [premise, subpremise].filter(Boolean).join(" · ").trim();
  const city = componentLongName(comps, "locality", "postal_town", "sublocality", "neighborhood");
  const state = componentLongName(comps, "administrative_area_level_1");
  const postalCode = componentLongName(comps, "postal_code");
  const country = componentLongName(comps, "country");
  const googlePlaceId = place.place_id ?? "";
  let latitude: number | null = null;
  let longitude: number | null = null;
  const loc = place.geometry?.location;
  if (loc) {
    const readCoord = (v: unknown): number => {
      if (typeof v === "function") {
        return (v as () => number)();
      }
      if (typeof v === "number") {
        return v;
      }
      return Number.NaN;
    };
    const latN = readCoord(loc.lat as unknown);
    const lngN = readCoord(loc.lng as unknown);
    if (Number.isFinite(latN) && Number.isFinite(lngN)) {
      latitude = latN;
      longitude = lngN;
    }
  }

  if (!formattedAddress && !addressLine1) {
    return null;
  }

  return {
    schemaVersion: PUBLIC_INTAKE_SERVICE_LOCATION_SCHEMA_VERSION,
    formattedAddress,
    addressLine1: addressLine1 || formattedAddress,
    addressLine2,
    city,
    state,
    postalCode,
    country,
    googlePlaceId,
    latitude,
    longitude,
    source: "google_places",
  };
}

export type ServiceAddressCaptureFieldProps = {
  googleMapsApiKey: string;
  fieldLabelClass: string;
  controlClass: string;
  /** When true, HTML5 `required` is set on the visible address input. */
  required?: boolean;
  defaultDisplayAddress?: string;
  /** Serialized snapshot for edit / republish — keeps hidden JSON in sync on first paint. */
  initialStructuredJson?: string;
};

/**
 * One visible “service address / project location” field with optional Places assist
 * on the same input. Structured capture is posted via hidden `publicIntakeServiceLocation`;
 * the visible line uses `serviceAddress` (matches public intake and staff lead forms).
 */
export function ServiceAddressCaptureField({
  googleMapsApiKey,
  fieldLabelClass,
  controlClass,
  required = false,
  defaultDisplayAddress = "",
  initialStructuredJson = "",
}: ServiceAddressCaptureFieldProps) {
  const placesEnabled = googleMapsApiKey.trim().length > 0;
  const fieldId = useId();
  const [structuredJson, setStructuredJson] = useState(initialStructuredJson);
  const addressInputRef = useRef<HTMLInputElement>(null);

  const applyPlace = useCallback((place: google.maps.places.PlaceResult) => {
    const snap = placeToSnapshot(place);
    if (!snap) return;
    setStructuredJson(JSON.stringify(snap));
    const display = snap.formattedAddress.trim() || snap.addressLine1;
    if (addressInputRef.current && display) {
      addressInputRef.current.value = display;
    }
  }, []);

  useEffect(() => {
    if (!placesEnabled || !addressInputRef.current) {
      return;
    }

    let cancelled = false;
    let listener: google.maps.MapsEventListener | undefined;
    let autocomplete: google.maps.places.Autocomplete | undefined;

    void (async () => {
      try {
        await loadGoogleMapsPlacesScript(googleMapsApiKey.trim());
        if (cancelled || !addressInputRef.current) {
          return;
        }
        autocomplete = new google.maps.places.Autocomplete(addressInputRef.current, {
          fields: ["formatted_address", "address_components", "geometry", "place_id"],
        });
        listener = autocomplete.addListener("place_changed", () => {
          const place = autocomplete?.getPlace();
          if (place) {
            applyPlace(place);
          }
        });
      } catch {
        /* Progressive enhancement — manual entry still works. */
      }
    })();

    return () => {
      cancelled = true;
      if (autocomplete !== undefined) {
        google.maps.event.clearInstanceListeners(autocomplete);
      } else if (listener !== undefined) {
        google.maps.event.removeListener(listener);
      }
    };
  }, [placesEnabled, googleMapsApiKey, applyPlace]);

  return (
    <div>
      <label className="block" htmlFor={fieldId}>
        <span className={fieldLabelClass}>Service address / project location</span>
        <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
          Start typing to search, or enter the address manually.
        </p>
        <input
          ref={addressInputRef}
          id={fieldId}
          name="serviceAddress"
          type="text"
          required={required}
          maxLength={LEAD_FIELD_LIMITS.publicIntakeServiceAddress}
          autoComplete="street-address"
          defaultValue={defaultDisplayAddress}
          placeholder={
            placesEnabled
              ? "Start typing to search, or type the full address…"
              : "Enter the full service or project address"
          }
          className={controlClass}
          onChange={() => {
            setStructuredJson("");
          }}
        />
      </label>

      <input type="hidden" name="publicIntakeServiceLocation" value={structuredJson} />
    </div>
  );
}
