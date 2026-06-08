import type { Prisma } from "@prisma/client";

const MAX_QUERY_LEN = 200;

export type LeadListSortParam =
  | "created"
  | "title"
  | "age_asc";
export type LeadListPipelineParam = "active" | "awarded" | "closed";

export const LEAD_LIST_DEFAULT_SORT: LeadListSortParam = "created";
export const LEAD_LIST_DEFAULT_PIPELINE: LeadListPipelineParam = "active";

const SORT_VALUES: LeadListSortParam[] = [
  "created",
  "title",
  "age_asc",
];
const PIPELINE_VALUES: LeadListPipelineParam[] = ["active", "awarded", "closed"];

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
    case "title":
      /** `title` is a derived field — fall back to creation order for stability. */
      return { createdAt: "desc" };
    case "age_asc":
      return { createdAt: "asc" };
    case "created":
    default:
      return { createdAt: "desc" };
  }
}

export function leadRowMatchesPipeline(
  pipeline: LeadListPipelineParam,
  progressState: string,
): boolean {
  switch (pipeline) {
    case "awarded":
      return progressState === "JOB_ACTIVE";
    case "closed":
      return progressState === "CLOSED_NOT_A_FIT" || progressState === "ARCHIVED";
    case "active":
    default:
      return (
        progressState !== "JOB_ACTIVE" &&
        progressState !== "CLOSED_NOT_A_FIT" &&
        progressState !== "ARCHIVED"
      );
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
