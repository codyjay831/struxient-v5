"use client";

import { ServiceAddressCaptureField } from "@/components/forms/service-address-capture-field";

type IntakeServiceAddressFieldProps = {
  googleMapsApiKey: string;
  fieldLabelClass: string;
  controlClass: string;
  required?: boolean;
  defaultDisplayAddress?: string;
  initialStructuredJson?: string;
  onDisplayAddressChange?: (value: string) => void;
  onStructuredJsonChange?: (value: string) => void;
};

export function IntakeServiceAddressField(props: IntakeServiceAddressFieldProps) {
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
