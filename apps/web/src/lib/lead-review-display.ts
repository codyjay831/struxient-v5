import type { LeadChannel } from "@prisma/client";
import { formatLeadChannel } from "@/lib/lead-display";
import { addressesDedupEquivalent } from "@/lib/customer-service-location-from-lead";
import type {
  LeadReviewRequestField,
  LeadReviewViewModel,
} from "@/lib/lead-review-view-model";

/** Review surface entry points — display allocation differs by chrome available. */
export type LeadReviewEntryPoint = "record" | "sales_modal" | "workstation";

/** Minimal service-location rows for primary jobsite comparison. */
export type LeadReviewServiceLocationRef = {
  formattedAddress: string;
  addressLine1: string;
  isPrimary: boolean;
};

export type LeadReviewServiceAddressContextRef = {
  customer: {
    serviceLocations: LeadReviewServiceLocationRef[];
  } | null;
};

export type LeadReviewDisplayInput = {
  entryPoint: LeadReviewEntryPoint;
  lead: {
    title: string;
    contactName: string;
    companyName: string;
    email: string;
    phone: string;
    channel: LeadChannel;
    jobsiteAddressLine: string;
    scopeSummary: string | null;
    requestType: string | null;
    serviceLocationId: string | null;
    isAddressVerified: boolean;
    isAddressQuoteReady: boolean;
  };
  customer: { displayName: string } | null;
  reviewViewModel: LeadReviewViewModel;
  serviceAddressContext?: LeadReviewServiceAddressContextRef | null;
};

export type LeadReviewCompactHeader = {
  /** Work label for dense contexts — scope or request type, not fused title. */
  title: string;
  subtitle: string | null;
  /** Channel label when source is promoted to the scan band. */
  metaLine: string | null;
};

export type LeadReviewDisplay = {
  pageEyebrow: string;
  primaryName: string;
  /** Deduped what / when / where for page description or compact subtitle. */
  contextLine: string | null;
  showSurfaceHeader: boolean;
  compactHeader: LeadReviewCompactHeader | null;
  /** Request fields with facts already surfaced above removed for this context. */
  requestDetailFields: LeadReviewRequestField[];
  /** Show scopeText fallback block when scope is not in detail fields or context. */
  showScopeFallback: boolean;
  contactSection: {
    show: boolean;
    name: string;
    companyName: string | null;
    email: string | null;
    phone: string | null;
  };
  customerReachabilityLine: string | null;
  jobsiteSection: {
    jobsiteLine: string | null;
    verificationLabel: "verified" | "needs_review" | "missing";
    differsFromCustomerPrimary: boolean;
    primaryJobsiteLine: string | null;
  };
  addressResolve: {
    show: boolean;
    placement: "prominent";
  };
  /** Linked customer but jobsite not resolved on this lead. */
  needsJobsiteLinkConfirmation: boolean;
  siteDetails: {
    showRow: boolean;
    showPlaceholder: boolean;
    showAddressLine: boolean;
  };
  /** @deprecated use siteDetails.showAddressLine */
  siteDetailsShowAddressLine: boolean;
};

function fieldValue(
  fields: LeadReviewRequestField[],
  label: string,
): string | null {
  const row = fields.find((f) => f.label.toLowerCase() === label.toLowerCase());
  return row?.value?.trim() || null;
}

/** Best identity label — aligned with sales list row primary name. */
export function resolveLeadPrimaryName(input: LeadReviewDisplayInput): string {
  const { lead, customer } = input;
  return (
    customer?.displayName?.trim() ||
    lead.contactName?.trim() ||
    lead.companyName?.trim() ||
    lead.email?.trim() ||
    "Unknown contact"
  );
}

/** Work/scope label without fusing contact name from deriveLeadTitle. */
export function resolveLeadScopeLabel(input: LeadReviewDisplayInput): string | null {
  const { lead, reviewViewModel } = input;
  const fromField = fieldValue(reviewViewModel.requestFields, "What they need");
  const scope =
    lead.scopeSummary?.trim() ||
    fromField ||
    reviewViewModel.scopeText?.trim() ||
    null;
  if (scope) {
    return scope;
  }
  const requestType =
    lead.requestType?.trim() ||
    fieldValue(reviewViewModel.requestFields, "Request type");
  return requestType || null;
}

function resolveTimingLabel(reviewViewModel: LeadReviewViewModel): string | null {
  return fieldValue(reviewViewModel.requestFields, "Timing");
}

function buildContextSegments(input: LeadReviewDisplayInput): {
  scopeLabel: string | null;
  timingLabel: string | null;
  jobsiteLine: string | null;
} {
  const jobsite = input.lead.jobsiteAddressLine?.trim() || null;
  return {
    scopeLabel: resolveLeadScopeLabel(input),
    timingLabel: resolveTimingLabel(input.reviewViewModel),
    jobsiteLine: jobsite,
  };
}

export function buildLeadReviewContextLine(input: LeadReviewDisplayInput): string | null {
  const { scopeLabel, timingLabel, jobsiteLine } = buildContextSegments(input);
  const line = [scopeLabel, timingLabel, jobsiteLine].filter(Boolean).join(" · ");
  return line || null;
}

export function resolveCustomerPrimaryJobsiteLine(
  context: LeadReviewServiceAddressContextRef | null | undefined,
): string | null {
  const locations = context?.customer?.serviceLocations;
  if (!locations?.length) {
    return null;
  }
  const ordered = [...locations].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  for (const loc of ordered) {
    const line = loc.formattedAddress.trim() || loc.addressLine1.trim();
    if (line) {
      return line;
    }
  }
  return null;
}

function buildReachabilityLine(email: string, phone: string): string | null {
  const parts = [email?.trim(), phone?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function resolveJobsiteVerificationLabel(
  lead: LeadReviewDisplayInput["lead"],
): "verified" | "needs_review" | "missing" {
  const line = lead.jobsiteAddressLine?.trim();
  if (!line) {
    return "missing";
  }
  if (lead.isAddressVerified || lead.isAddressQuoteReady) {
    return "verified";
  }
  return "needs_review";
}

function filterRequestDetailFields(
  fields: LeadReviewRequestField[],
  options: {
    suppressLabels: Set<string>;
    suppressSourceInMeta: boolean;
  },
): LeadReviewRequestField[] {
  return fields.filter((field) => {
    const key = field.label.toLowerCase();
    if (options.suppressLabels.has(key)) {
      return false;
    }
    if (options.suppressSourceInMeta && key === "source") {
      return false;
    }
    return true;
  });
}

/**
 * Allocates lead review facts to page chrome vs surface sections so each fact
 * appears once per entry-point context. Does not mutate stored facts.
 */
export function buildLeadReviewDisplay(input: LeadReviewDisplayInput): LeadReviewDisplay {
  const { entryPoint, reviewViewModel, lead, customer, serviceAddressContext } = input;
  const primaryName = resolveLeadPrimaryName(input);
  const { scopeLabel, timingLabel, jobsiteLine } = buildContextSegments(input);
  const contextLine = buildLeadReviewContextLine(input);
  const sourceLabel = formatLeadChannel(lead.channel);

  const suppressLabels = new Set<string>();
  if (scopeLabel && reviewViewModel.requestFields.some((f) => f.label === "What they need")) {
    suppressLabels.add("what they need");
  }
  if (timingLabel && reviewViewModel.requestFields.some((f) => f.label === "Timing")) {
    suppressLabels.add("timing");
  }

  const showSurfaceHeader = entryPoint !== "record";
  const showSourceInMeta = showSurfaceHeader;

  let compactHeader: LeadReviewCompactHeader | null = null;
  if (showSurfaceHeader) {
    const compactTitle = scopeLabel || lead.requestType?.trim() || lead.title;
    const subtitleParts = [timingLabel, jobsiteLine].filter(Boolean);
    compactHeader = {
      title: compactTitle,
      subtitle: subtitleParts.length > 0 ? subtitleParts.join(" · ") : null,
      metaLine: showSourceInMeta ? sourceLabel : null,
    };
  }

  const requestDetailFields = filterRequestDetailFields(reviewViewModel.requestFields, {
    suppressLabels,
    suppressSourceInMeta: showSourceInMeta,
  });

  const scopeInDetail = requestDetailFields.some((f) => f.label === "What they need");
  const showScopeFallback = Boolean(
    reviewViewModel.scopeText?.trim() &&
      !scopeInDetail &&
      !suppressLabels.has("what they need"),
  );

  const primaryJobsiteLine = resolveCustomerPrimaryJobsiteLine(serviceAddressContext);
  const differsFromCustomerPrimary = Boolean(
    customer &&
      jobsiteLine &&
      primaryJobsiteLine &&
      !addressesDedupEquivalent(jobsiteLine, primaryJobsiteLine),
  );

  const showAddressResolve = Boolean(
    !customer &&
      !lead.isAddressQuoteReady &&
      jobsiteLine &&
      serviceAddressContext?.customer == null,
  );

  const hasServiceLocation = Boolean(lead.serviceLocationId);
  const needsJobsiteLinkConfirmation = Boolean(
    customer && lead.jobsiteAddressLine?.trim() && !lead.serviceLocationId,
  );
  const siteDetails = {
    showRow: hasServiceLocation,
    showPlaceholder: Boolean(jobsiteLine && !hasServiceLocation),
    showAddressLine: false,
  };

  return {
    pageEyebrow: "Sales",
    primaryName,
    contextLine,
    showSurfaceHeader,
    compactHeader,
    requestDetailFields,
    showScopeFallback,
    contactSection: {
      show: customer == null,
      name: lead.contactName?.trim() || "Unknown contact",
      companyName: lead.companyName?.trim() || null,
      email: lead.email?.trim() || null,
      phone: lead.phone?.trim() || null,
    },
    customerReachabilityLine: customer
      ? buildReachabilityLine(lead.email, lead.phone)
      : null,
    jobsiteSection: {
      jobsiteLine,
      verificationLabel: resolveJobsiteVerificationLabel(lead),
      differsFromCustomerPrimary,
      primaryJobsiteLine,
    },
    addressResolve: {
      show: showAddressResolve,
      placement: "prominent",
    },
    needsJobsiteLinkConfirmation,
    siteDetails,
    siteDetailsShowAddressLine: siteDetails.showAddressLine,
  };
}
