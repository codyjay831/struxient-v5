import { LeadCustomFieldType } from "@prisma/client";

export interface IntakeAtom {
  key: string;
  label: string;
  type: LeadCustomFieldType | "SYSTEM";
  description?: string;
  required?: boolean;
}

export const INTAKE_ATOMS: Record<string, IntakeAtom> = {
  "contact.name": {
    key: "contact.name",
    label: "Name",
    type: "SYSTEM",
    required: true,
  },
  "contact.email": {
    key: "contact.email",
    label: "Email",
    type: "SYSTEM",
  },
  "contact.phone": {
    key: "contact.phone",
    label: "Phone",
    type: "SYSTEM",
  },
  "address.service": {
    key: "address.service",
    label: "Service Address",
    type: "SYSTEM",
    required: true,
  },
  "scope.text": {
    key: "scope.text",
    label: "What do you need help with?",
    type: "SYSTEM",
    required: true,
  },
  "scope.photos": {
    key: "scope.photos",
    label: "Photos & Documents",
    type: "SYSTEM",
  },
  "timing.bucket": {
    key: "timing.bucket",
    label: "Preferred timing",
    type: "SYSTEM",
  },
  "timing.specificDate": {
    key: "timing.specificDate",
    label: "Specific date",
    type: "SYSTEM",
  },
  "request.type": {
    key: "request.type",
    label: "Service category",
    type: "SYSTEM",
  },
  "consent.terms": {
    key: "consent.terms",
    label: "Terms & Conditions",
    type: "SYSTEM",
    required: true,
  },
  "preferred.contactMethod": {
    key: "preferred.contactMethod",
    label: "Preferred contact method",
    type: "SELECT",
  },
  "visit.requestedDate": {
    key: "visit.requestedDate",
    label: "Requested visit date",
    type: "SYSTEM",
  },
  "visit.window": {
    key: "visit.window",
    label: "Requested visit window",
    type: "SYSTEM",
  },
  "visit.notes": {
    key: "visit.notes",
    label: "Visit notes",
    type: "SYSTEM",
  },
};
