"use client";

import { ServiceAddressCaptureField } from "@/components/forms/service-address-capture-field";

type PublicIntakeServiceAddressFieldProps = {
  googleMapsApiKey: string;
  fieldLabelClass: string;
  controlClass: string;
  required?: boolean;
};

/** Public intake wrapper — address is required for homeowners submitting the request form. */
export function PublicIntakeServiceAddressField(props: PublicIntakeServiceAddressFieldProps) {
  return <ServiceAddressCaptureField {...props} />;
}
