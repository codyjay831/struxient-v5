import { CoverageConfidence, type PrismaClient } from "@prisma/client";

type UtilityCoverageDb = Pick<PrismaClient, "utilityCoverage">;

export type UtilityCoverageLocation = {
  postalCode: string;
  city: string;
  state: string;
  county: string | null;
};

export type UtilityCoverageMatch = {
  utilityId: string;
  coverageType: "ZIP" | "CITY" | "COUNTY";
  coverageValue: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
  confidence: CoverageConfidence;
};

export async function findUtilityCoverageMatches(
  db: UtilityCoverageDb,
  params: {
    organizationId: string;
    location: UtilityCoverageLocation;
    utilityId?: string;
    electricOnly?: boolean;
  },
): Promise<UtilityCoverageMatch[]> {
  const rows = await db.utilityCoverage.findMany({
    where: {
      organizationId: params.organizationId,
      utilityId: params.utilityId,
      isActive: true,
      utility: params.electricOnly
        ? {
            isActive: true,
            utilityType: "ELECTRIC",
          }
        : undefined,
      OR: [
        {
          coverageType: "ZIP",
          coverageValue: params.location.postalCode,
          state: params.location.state,
        },
        {
          coverageType: "CITY",
          coverageValue: params.location.city,
          state: params.location.state,
        },
        ...(params.location.county
          ? [
              {
                coverageType: "COUNTY" as const,
                coverageValue: params.location.county,
                state: params.location.state,
              },
            ]
          : []),
      ],
    },
    select: {
      utilityId: true,
      coverageType: true,
      coverageValue: true,
      sourceTitle: true,
      sourceUrl: true,
      confidence: true,
    },
  });

  return rows
    .map((row) => ({
      utilityId: row.utilityId,
      coverageType: row.coverageType,
      coverageValue: row.coverageValue,
      sourceTitle: row.sourceTitle,
      sourceUrl: row.sourceUrl,
      confidence: row.confidence,
    }))
    .sort((left, right) => {
      const byType = coverageTypePriority(left.coverageType) - coverageTypePriority(right.coverageType);
      if (byType !== 0) return byType;
      return coverageConfidencePriority(right.confidence) - coverageConfidencePriority(left.confidence);
    });
}

export function pickBestCoverageMatch(matches: UtilityCoverageMatch[]): UtilityCoverageMatch | null {
  return matches[0] ?? null;
}

function coverageTypePriority(value: "ZIP" | "CITY" | "COUNTY"): number {
  if (value === "ZIP") return 0;
  if (value === "CITY") return 1;
  return 2;
}

function coverageConfidencePriority(value: CoverageConfidence): number {
  if (value === "HIGH") return 3;
  if (value === "MEDIUM") return 2;
  return 1;
}
