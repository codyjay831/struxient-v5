import type { Prisma } from "@prisma/client";
import { SalesIntakeSource } from "@prisma/client";

const MAX_QUERY_LEN = 200;

export type SalesIntakeListSortParam =
  | "created"
  | "title"
  | "age_asc";

export const SALES_INTAKE_LIST_DEFAULT_SORT: SalesIntakeListSortParam = "created";

const SORT_VALUES: SalesIntakeListSortParam[] = [
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

export function parseSalesIntakeListSearchParams(
  record: Record<string, string | string[] | undefined>,
): { q: string; sort: SalesIntakeListSortParam } {
  const q = firstSearchParam(record.q).slice(0, MAX_QUERY_LEN);
  const rawSort = firstSearchParam(record.sort).toLowerCase();
  const sort: SalesIntakeListSortParam = SORT_VALUES.includes(rawSort as SalesIntakeListSortParam)
    ? (rawSort as SalesIntakeListSortParam)
    : SALES_INTAKE_LIST_DEFAULT_SORT;
  return { q, sort };
}

export function salesIntakeListWhere(
  organizationId: string,
  q: string,
): Prisma.SalesIntakeWhereInput {
  const where: Prisma.SalesIntakeWhereInput = {
    organizationId,
  };

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
          { contactName: { contains: term, mode: "insensitive" } },
          { email: { contains: term, mode: "insensitive" } },
          { phone: { contains: term, mode: "insensitive" } },
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

export function salesIntakeListOrderBy(sort: SalesIntakeListSortParam): Prisma.SalesIntakeOrderByWithRelationInput {
  switch (sort) {
    case "title":
      return { title: "asc" };
    case "age_asc":
      return { createdAt: "asc" };
    case "created":
    default:
      return { createdAt: "desc" };
  }
}

/** Build relative `/sales` query string; omits default sort and empty q. */
export function serializeSalesIntakeListHref(overrides: {
  q?: string;
  sort?: SalesIntakeListSortParam;
}): string {
  const params = new URLSearchParams();
  params.set("tab", "intake");
  const q = (overrides.q ?? "").trim().slice(0, MAX_QUERY_LEN);
  if (q) {
    params.set("q", q);
  }
  const sort = overrides.sort ?? SALES_INTAKE_LIST_DEFAULT_SORT;
  if (sort !== SALES_INTAKE_LIST_DEFAULT_SORT) {
    params.set("sort", sort);
  }
  const qs = params.toString();
  return qs ? `/sales?${qs}` : "/sales?tab=intake";
}
