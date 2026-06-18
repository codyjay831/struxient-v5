import type { Prisma } from "@prisma/client";

const MAX_QUERY_LEN = 200;

export type LeadListSortParam =
  | "created"
  | "title_asc"
  | "age_asc"
  | "updated";
export type LeadListPipelineParam = "needs_action" | "waiting" | "scheduled" | "awarded" | "closed" | "all";

export const LEAD_LIST_DEFAULT_SORT: LeadListSortParam = "created";
export const LEAD_LIST_DEFAULT_PIPELINE: LeadListPipelineParam = "needs_action";

const SORT_VALUES: LeadListSortParam[] = [
  "created",
  "title_asc",
  "age_asc",
  "updated",
];
const PIPELINE_VALUES: LeadListPipelineParam[] = ["needs_action", "waiting", "scheduled", "awarded", "closed", "all"];

function firstSearchParam(value: string | string[] | undefined): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
    return value[0].trim();
  }
  return "";
}

export function parseLeadListSearchParams(
  record: Record<string, string | string[] | undefined>,
): { q: string; sort: LeadListSortParam; pipeline: LeadListPipelineParam } {
  const q = firstSearchParam(record.q).slice(0, MAX_QUERY_LEN);
  const rawSort = firstSearchParam(record.sort).toLowerCase();
  const rawPipeline = firstSearchParam(record.pipeline).toLowerCase();
  const sort: LeadListSortParam = SORT_VALUES.includes(rawSort as LeadListSortParam)
    ? (rawSort as LeadListSortParam)
    : LEAD_LIST_DEFAULT_SORT;
  const pipeline: LeadListPipelineParam = PIPELINE_VALUES.includes(rawPipeline as LeadListPipelineParam)
    ? (rawPipeline as LeadListPipelineParam)
    : LEAD_LIST_DEFAULT_PIPELINE;
  return { q, sort, pipeline };
}

export function leadListWhere(
  organizationId: string,
  q: string,
): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {
    organizationId,
  };

  const term = q.trim();
  if (!term) {
    return where;
  }

  /**
   * Lead identity fields (name, email, phone, request type) live inside JSONB
   * columns (`contact`, `request`). Use Postgres' `string_contains` filter on
   * each well-known JSON path so search still hits org-local rows. The `mode`
   * option is not supported on JSON path filters, so case-insensitive matching
   * is approximated by lowercasing both sides via `string_contains`.
   */
  const lowered = term.toLowerCase();

  return {
    ...where,
    AND: [
      {
        OR: [
          { contact: { path: ["name"], string_contains: term } },
          { contact: { path: ["email"], string_contains: term } },
          { contact: { path: ["phone"], string_contains: term } },
          { request: { path: ["type"], string_contains: term } },
          { request: { path: ["scope"], string_contains: term } },
          { contact: { path: ["name"], string_contains: lowered } },
          { contact: { path: ["email"], string_contains: lowered } },
          { request: { path: ["type"], string_contains: lowered } },
          { title: { contains: term, mode: "insensitive" } },
          {
            customer: {
              is: {
                OR: [
                  { displayName: { contains: term, mode: "insensitive" } },
                  { companyName: { contains: term, mode: "insensitive" } },
                ],
              },
            },
          },
        ],
      },
    ],
  };
}

export function leadListOrderBy(sort: LeadListSortParam): Prisma.LeadOrderByWithRelationInput {
  switch (sort) {
    case "title_asc":
      return { title: "asc" };
    case "age_asc":
      return { createdAt: "asc" };
    case "updated":
      return { updatedAt: "desc" };
    case "created":
    default:
      return { createdAt: "desc" };
  }
}

export function leadRowMatchesPipeline(
  pipeline: LeadListPipelineParam,
  conditionCode: string,
): boolean {
  switch (pipeline) {
    case "needs_action":
      return (
        conditionCode === "NEEDS_INTAKE_DETAILS" ||
        conditionCode === "CUSTOMER_MATCH_NEEDS_REVIEW" ||
        conditionCode === "NEEDS_SALES_VISIT" ||
        conditionCode === "READY_TO_QUOTE" ||
        conditionCode === "QUOTE_DRAFT_IN_PROGRESS" ||
        conditionCode === "QUOTE_READY_TO_SEND" ||
        conditionCode === "CUSTOMER_REQUESTED_CHANGES" ||
        conditionCode === "FOLLOW_UP_VISIT_REQUIRED" ||
        conditionCode === "REVISION_DRAFT_IN_PROGRESS" ||
        conditionCode === "REVISION_READY_TO_SEND"
      );
    case "waiting":
      return conditionCode === "WAITING_ON_CUSTOMER" || conditionCode === "PAUSED";
    case "scheduled":
      return conditionCode === "SALES_VISIT_SCHEDULED";
    case "awarded":
      return conditionCode === "JOB_ACTIVE" || conditionCode === "APPROVED_READY_FOR_JOB";
    case "closed":
      return conditionCode === "LOST";
    case "all":
    default:
      return true;
  }
}

/** Build relative `/leads` query string; omits default sort and empty q. */
export function serializeLeadListHref(overrides: {
  q?: string;
  sort?: LeadListSortParam;
  pipeline?: LeadListPipelineParam;
}): string {
  const params = new URLSearchParams();
  const q = (overrides.q ?? "").trim().slice(0, MAX_QUERY_LEN);
  if (q) {
    params.set("q", q);
  }
  const sort = overrides.sort ?? LEAD_LIST_DEFAULT_SORT;
  if (sort !== LEAD_LIST_DEFAULT_SORT) {
    params.set("sort", sort);
  }
  const pipeline = overrides.pipeline ?? LEAD_LIST_DEFAULT_PIPELINE;
  if (pipeline !== LEAD_LIST_DEFAULT_PIPELINE) {
    params.set("pipeline", pipeline);
  }
  const qs = params.toString();
  return qs ? `/leads?${qs}` : "/leads";
}
