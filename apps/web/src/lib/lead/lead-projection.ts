/**
 * Lead projection layer.
 *
 * The Lead row stores flexible data in JSONB columns (`contact`, `request`,
 * `address`, `signals`). This file exposes:
 *   - Strongly typed JSONB shapes for safe extraction.
 *   - `LEAD_PROJECTION_SELECT` — the Prisma select that downstream readers should
 *     ask for. Combined with the Prisma client extension in `lib/db.ts`, the
 *     resulting row gains virtual fields (`title`, `contactName`, `email`,
 *     `phone`, `notes`, `source`, `requestType`, `neededByBucket`,
 *     `neededByDate`, `scopeSummary`, `sourceDetail`,
 *     `publicIntakeServiceLocation`) so existing consumer code that reads
 *     `lead.title` / `lead.email` keeps working unchanged.
 *   - `projectLead(row)` — a one-shot mapper that returns a fully flat
 *     `LeadProjection` for places that prefer an explicit object.
 *
 * Writers (server actions / use cases) MUST write into the JSONB shape. There
 * are no flat columns left for `title`, `contactName`, `email`, `phone`,
 * `notes`, `source`, `sourceDetail`, `requestType`, `neededByBucket`,
 * `neededByDate`, `scopeSummary`, or `publicIntakeServiceLocation` — those are
 * derived for read.
 */

import type { LeadChannel, LeadStatus, NeededByBucket, Prisma } from "@prisma/client";

export type LeadContactJson = {
  name: string | null;
  email: string | null;
  phone: string | null;
  companyName: string | null;
};

export type LeadRequestJson = {
  type: string | null;
  neededByBucket: NeededByBucket | null;
  neededByDate: string | Date | null;
  scope: string | null;
  suggestedTemplateIds?: string[];
  lockInInstantQuote?: boolean;
  instantQuoteTemplateIds?: string[];
};

export type LeadAddressJson = {
  formattedAddress?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  googlePlaceId?: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type LeadSignalsJson = {
  duplicateCandidateIds?: string[];
  suggestedTemplateIds?: string[];
  urgencyHint?: "LOW" | "MEDIUM" | "HIGH";
  sourceDetail?: string | null;
  notes?: string | null;
  [key: string]: unknown;
};

/** Safe JSONB extractors — never throw on bad data. */
export function readContact(value: Prisma.JsonValue | null | undefined): LeadContactJson {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    return {
      name: typeof o.name === "string" ? o.name : null,
      email: typeof o.email === "string" ? o.email : null,
      phone: typeof o.phone === "string" ? o.phone : null,
      companyName: typeof o.companyName === "string" ? o.companyName : null,
    };
  }
  return { name: null, email: null, phone: null, companyName: null };
}

export function readRequest(value: Prisma.JsonValue | null | undefined): LeadRequestJson {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    return {
      type: typeof o.type === "string" ? o.type : null,
      neededByBucket:
        typeof o.neededByBucket === "string"
          ? (o.neededByBucket as NeededByBucket)
          : null,
      neededByDate:
        typeof o.neededByDate === "string" || o.neededByDate instanceof Date
          ? (o.neededByDate as string | Date)
          : null,
      scope: typeof o.scope === "string" ? o.scope : null,
      suggestedTemplateIds: Array.isArray(o.suggestedTemplateIds)
        ? (o.suggestedTemplateIds as string[])
        : undefined,
      lockInInstantQuote:
        typeof o.lockInInstantQuote === "boolean" ? o.lockInInstantQuote : undefined,
      instantQuoteTemplateIds: Array.isArray(o.instantQuoteTemplateIds)
        ? (o.instantQuoteTemplateIds as string[])
        : undefined,
    };
  }
  return {
    type: null,
    neededByBucket: null,
    neededByDate: null,
    scope: null,
  };
}

export function readSignals(value: Prisma.JsonValue | null | undefined): LeadSignalsJson {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as LeadSignalsJson;
  }
  return {};
}

export function readAddress(value: Prisma.JsonValue | null | undefined): LeadAddressJson | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as LeadAddressJson;
  }
  return null;
}

/**
 * Derives a stable display title from the JSONB columns. Order:
 *   1. explicit request.type (e.g. "Roof repair")
 *   2. contact.name + " request"
 *   3. "New lead"
 */
export function deriveLeadTitle(
  contact: Prisma.JsonValue | null | undefined,
  request: Prisma.JsonValue | null | undefined,
): string {
  const r = readRequest(request);
  if (r.type && r.type.trim()) {
    const c = readContact(contact);
    if (c.name && c.name.trim()) {
      return `${r.type.trim()} — ${c.name.trim()}`;
    }
    return r.type.trim();
  }
  const c = readContact(contact);
  if (c.name && c.name.trim()) {
    return `${c.name.trim()} request`;
  }
  return "New lead";
}

/** Required Prisma select fields for any lead read that wants the projection helpers. */
export const LEAD_PROJECTION_SELECT = {
  contact: true,
  request: true,
  address: true,
  signals: true,
  channel: true,
} satisfies Prisma.LeadSelect;

/**
 * Flat snapshot of a lead row for code that prefers an explicit object.
 * NOTE: prefer using the Prisma extension's computed fields (`lead.title`,
 * `lead.email`, etc.) when you already have a row from `db.lead.findX`.
 */
export type LeadProjection = {
  id: string;
  status: LeadStatus;
  channel: LeadChannel;
  customerId: string | null;
  convertedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  title: string;
  contactName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  sourceDetail: string | null;
  requestType: string | null;
  neededByBucket: NeededByBucket | null;
  neededByDate: Date | null;
  scopeSummary: string | null;
  /** Raw JSONB structured address — null when not provided. */
  address: LeadAddressJson | null;
  /** Raw JSONB signals — empty object when not provided. */
  signals: LeadSignalsJson;
};

export type ProjectableLeadRow = {
  id: string;
  status: LeadStatus;
  channel: LeadChannel;
  customerId: string | null;
  convertedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  contact: Prisma.JsonValue;
  request: Prisma.JsonValue;
  address: Prisma.JsonValue | null;
  signals: Prisma.JsonValue | null;
};

export function projectLead(row: ProjectableLeadRow): LeadProjection {
  const contact = readContact(row.contact);
  const request = readRequest(row.request);
  const signals = readSignals(row.signals);
  const address = readAddress(row.address);

  let neededByDate: Date | null = null;
  if (request.neededByDate instanceof Date) {
    neededByDate = request.neededByDate;
  } else if (typeof request.neededByDate === "string") {
    const d = new Date(request.neededByDate);
    if (!Number.isNaN(d.getTime())) {
      neededByDate = d;
    }
  }

  return {
    id: row.id,
    status: row.status,
    channel: row.channel,
    customerId: row.customerId,
    convertedAt: row.convertedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    title: deriveLeadTitle(row.contact, row.request),
    contactName: contact.name,
    companyName: contact.companyName,
    email: contact.email,
    phone: contact.phone,
    notes: typeof signals.notes === "string" ? signals.notes : null,
    sourceDetail: typeof signals.sourceDetail === "string" ? signals.sourceDetail : null,
    requestType: request.type,
    neededByBucket: request.neededByBucket,
    neededByDate,
    scopeSummary: request.scope,
    address,
    signals,
  };
}

/** Service-location snapshot input — accepts either a full Prisma row or a projection. */
export type LeadAddressSignalsInput = {
  address: Prisma.JsonValue | null;
  signals: Prisma.JsonValue | null;
};
