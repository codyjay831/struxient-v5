import type { Prisma } from "@prisma/client";
import { QuoteStatus } from "@prisma/client";

const MAX_QUERY_LEN = 200;

export type QuoteListStatusParam =
  | "all"
  | "draft"
  | "sent"
  | "approved"
  | "active"
  | "archived";

export type QuoteListSortParam =
  | "updated"
  | "created"
  | "title"
  | "total_desc"
  | "total_asc";

export const QUOTE_LIST_DEFAULT_SORT: QuoteListSortParam = "updated";

const STATUS_VALUES: QuoteListStatusParam[] = [
  "all",
  "draft",
  "sent",
  "approved",
  "active",
  "archived",
];
const SORT_VALUES: QuoteListSortParam[] = [
  "updated",
  "created",
  "title",
  "total_desc",
  "total_asc",
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

export function parseQuoteListSearchParams(
  record: Record<string, string | string[] | undefined>,
): { q: string; status: QuoteListStatusParam; sort: QuoteListSortParam } {
  const q = firstSearchParam(record.q).slice(0, MAX_QUERY_LEN);
  const rawStatus = firstSearchParam(record.status).toLowerCase();
  const status: QuoteListStatusParam = STATUS_VALUES.includes(rawStatus as QuoteListStatusParam)
    ? (rawStatus as QuoteListStatusParam)
    : "all";
  const rawSort = firstSearchParam(record.sort).toLowerCase();
  const sort: QuoteListSortParam = SORT_VALUES.includes(rawSort as QuoteListSortParam)
    ? (rawSort as QuoteListSortParam)
    : QUOTE_LIST_DEFAULT_SORT;
  return { q, status, sort };
}

export function quoteListWhere(
  organizationId: string,
  status: QuoteListStatusParam,
  q: string,
): Prisma.QuoteWhereInput {
  const where: Prisma.QuoteWhereInput = {
    organizationId,
  };
  if (status === "draft") {
    where.status = QuoteStatus.DRAFT;
  } else if (status === "sent") {
    where.status = QuoteStatus.SENT;
  } else if (status === "approved") {
    where.status = QuoteStatus.APPROVED;
  } else if (status === "active") {
    where.status = { not: QuoteStatus.ARCHIVED };
  } else if (status === "archived") {
    where.status = QuoteStatus.ARCHIVED;
  }

  const term = q.trim();
  if (!term) {
    return where;
  }

  return {
    ...where,
    AND: [
      {
        OR: [
          { title: { contains: term, mode: "insensitive" } },
          { customerDocumentTitle: { contains: term, mode: "insensitive" } },
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
          {
            lead: {
              is: {
                OR: [
                  { contact: { path: ["name"], string_contains: term } },
                  { contact: { path: ["email"], string_contains: term } },
                  { request: { path: ["type"], string_contains: term } },
                  { request: { path: ["scope"], string_contains: term } },
                ],
              },
            },
          },
        ],
      },
    ],
  };
}

export function quoteListOrderBy(sort: QuoteListSortParam): Prisma.QuoteOrderByWithRelationInput {
  switch (sort) {
    case "created":
      return { createdAt: "desc" };
    case "title":
      return { title: "asc" };
    case "total_desc":
      return { totalCents: "desc" };
    case "total_asc":
      return { totalCents: "asc" };
    case "updated":
    default:
      return { updatedAt: "desc" };
  }
}

/** Build relative `/quotes` query string; omits default sort and empty q. */
export function serializeQuotesListHref(overrides: {
  q?: string;
  status?: QuoteListStatusParam;
  sort?: QuoteListSortParam;
}): string {
  const params = new URLSearchParams();
  const q = (overrides.q ?? "").trim().slice(0, MAX_QUERY_LEN);
  if (q) {
    params.set("q", q);
  }
  const status = overrides.status ?? "all";
  if (status !== "all") {
    params.set("status", status);
  }
  const sort = overrides.sort ?? QUOTE_LIST_DEFAULT_SORT;
  if (sort !== QUOTE_LIST_DEFAULT_SORT) {
    params.set("sort", sort);
  }
  const qs = params.toString();
  return qs ? `/quotes?${qs}` : "/quotes";
}
