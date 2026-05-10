"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { LEAD_FIELD_LIMITS } from "@/app/(workspace)/leads/lead-field-limits";
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

type PublicIntakeServiceAddressFieldProps = {
  googleMapsApiKey: string;
  fieldLabelClass: string;
  controlClass: string;
};

export function PublicIntakeServiceAddressField({
  googleMapsApiKey,
  fieldLabelClass,
  controlClass,
}: PublicIntakeServiceAddressFieldProps) {
  const placesEnabled = googleMapsApiKey.trim().length > 0;
  const searchId = useId();
  const [structuredJson, setStructuredJson] = useState("");
  const placesInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const applyPlace = useCallback((place: google.maps.places.PlaceResult) => {
    const snap = placeToSnapshot(place);
    if (!snap) return;
    setStructuredJson(JSON.stringify(snap));
    const display = snap.formattedAddress.trim() || snap.addressLine1;
    if (textareaRef.current && display) {
      textareaRef.current.value = display;
    }
  }, []);

  useEffect(() => {
    if (!placesEnabled || !placesInputRef.current) {
      return;
    }

    let cancelled = false;
    let listener: google.maps.MapsEventListener | undefined;
    let autocomplete: google.maps.places.Autocomplete | undefined;

    void (async () => {
      try {
        await loadGoogleMapsPlacesScript(googleMapsApiKey.trim());
        if (cancelled || !placesInputRef.current) {
          return;
        }
        autocomplete = new google.maps.places.Autocomplete(placesInputRef.current, {
          fields: ["formatted_address", "address_components", "geometry", "place_id"],
        });
        listener = autocomplete.addListener("place_changed", () => {
          const place = autocomplete?.getPlace();
          if (place) {
            applyPlace(place);
          }
        });
      } catch {
        /* Progressive enhancement — form stays usable without Maps. */
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
      <p className={`${fieldLabelClass} mb-2`}>Service location (required)</p>
      {placesEnabled ? (
        <div className="mb-3">
          <label className="block" htmlFor={searchId}>
            <span className={fieldLabelClass}>Find address with Google</span>
            <input
              ref={placesInputRef}
              id={searchId}
              type="text"
              autoComplete="off"
              placeholder="Start typing your street or place…"
              className={controlClass}
            />
          </label>
          <p className="mt-1.5 text-xs text-foreground-subtle">
            Matching addresses load when Google is available. You must still confirm the address
            below — it is required for scheduling and routing.
          </p>
        </div>
      ) : null}

      <label className="block">
        <span className={fieldLabelClass}>Service address / project location (required)</span>
        <textarea
          ref={textareaRef}
          name="serviceAddress"
          required
          rows={3}
          maxLength={LEAD_FIELD_LIMITS.publicIntakeServiceAddress}
          autoComplete="street-address"
          className={`${controlClass} min-h-[5.5rem] resize-y`}
          onChange={() => {
            setStructuredJson("");
          }}
        />
      </label>

      <input type="hidden" name="publicIntakeServiceLocation" value={structuredJson} />
    </div>
  );
}
