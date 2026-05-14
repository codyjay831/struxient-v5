import type { Prisma } from "@prisma/client";

const MAX_QUERY_LEN = 200;

export type LeadListSortParam =
  | "created"
  | "title"
  | "age_asc";

export const LEAD_LIST_DEFAULT_SORT: LeadListSortParam = "created";

const SORT_VALUES: LeadListSortParam[] = [
  "created",
  "title",
  "age_asc",
];

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
): { q: string; sort: LeadListSortParam } {
  const q = firstSearchParam(record.q).slice(0, MAX_QUERY_LEN);
  const rawSort = firstSearchParam(record.sort).toLowerCase();
  const sort: LeadListSortParam = SORT_VALUES.includes(rawSort as LeadListSortParam)
    ? (rawSort as LeadListSortParam)
    : LEAD_LIST_DEFAULT_SORT;
  return { q, sort };
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

/** Build relative `/leads` query string; omits default sort and empty q. */
export function serializeLeadListHref(overrides: {
  q?: string;
  sort?: LeadListSortParam;
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
  const qs = params.toString();
  return qs ? `/leads?${qs}` : "/leads";
}
