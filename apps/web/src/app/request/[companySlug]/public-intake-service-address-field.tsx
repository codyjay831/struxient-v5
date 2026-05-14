"use client";

import { ServiceAddressCaptureField } from "@/components/forms/service-address-capture-field";

type PublicIntakeServiceAddressFieldProps = {
  googleMapsApiKey: string;
  fieldLabelClass: string;
  controlClass: string;
  required?: boolean;
  defaultDisplayAddress?: string;
  initialStructuredJson?: string;
  onDisplayAddressChange?: (value: string) => void;
  onStructuredJsonChange?: (value: string) => void;
};

/** Public intake wrapper — address is required for homeowners submitting the request form. */
export function PublicIntakeServiceAddressField(props: PublicIntakeServiceAddressFieldProps) {
  return (
    <ServiceAddressCaptureField
      googleMapsApiKey={props.googleMapsApiKey}
      fieldLabelClass={props.fieldLabelClass}
      controlClass={props.controlClass}
      required={props.required}
      defaultDisplayAddress={props.defaultDisplayAddress}
      initialStructuredJson={props.initialStructuredJson}
      onDisplayAddressChange={props.onDisplayAddressChange}
      onStructuredJsonChange={props.onStructuredJsonChange}
    />
  );
}
