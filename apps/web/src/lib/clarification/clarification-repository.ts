import { ClarificationQuestionSetStatus } from "@prisma/client";
import { db } from "@/lib/db";
import {
  matchQuestionSetsForLine,
  normalizeForMatch,
  type ClarificationSetMatch,
  type LineMatchContext,
} from "./clarification-matching";
import type {
  ClarificationBinding,
  ClarificationQuestionSet,
  ClarificationQuestionSetStatus as ClarificationQuestionSetStatusType,
} from "./clarification-types";

function mapStatus(value: ClarificationQuestionSetStatus): ClarificationQuestionSetStatusType {
  if (value === ClarificationQuestionSetStatus.active) return "active";
  if (value === ClarificationQuestionSetStatus.archived) return "archived";
  if (value === ClarificationQuestionSetStatus.merged) return "merged";
  return "draft";
}

function toTagKey(value: string): string {
  return normalizeForMatch(value).replace(/\s+/g, "-");
}

async function loadSetRows(organizationId: string, includeArchived = true) {
  return db.clarificationQuestionSet.findMany({
    where: {
      organizationId,
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ key: "asc" }, { version: "desc" }],
    include: {
      mergedInto: { select: { key: true } },
      tags: {
        select: {
          name: true,
          aliases: true,
        },
      },
      questions: {
        orderBy: { sortOrder: "asc" },
        include: {
          options: {
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });
}

function mapSetRow(
  row: Awaited<ReturnType<typeof loadSetRows>>[number],
): ClarificationQuestionSet {
  return {
    key: row.key,
    version: row.version,
    label: row.label,
    status: mapStatus(row.status),
    description: row.description ?? undefined,
    aliases: row.aliases,
    mergedIntoKey: row.mergedInto?.key ?? undefined,
    questions: row.questions.map((question) => ({
      key: question.key,
      label: question.label,
      inputType: question.inputType,
      helpText: question.helpText ?? undefined,
      options: question.options.map((option) => ({
        key: option.key,
        label: option.label,
        aliases: option.aliases,
      })),
      aliases: question.aliases,
      allowOther: question.allowOther,
      unit: question.unit ?? undefined,
      customerFacing: question.customerFacing,
    })),
  };
}

function toBindings(
  sets: Awaited<ReturnType<typeof loadSetRows>>,
): ClarificationBinding[] {
  return sets.map((set) => ({
    questionSetKey: set.key,
    tagKeys: set.tags.flatMap((tag) => [tag.name, ...tag.aliases]).map(toTagKey),
    keywords: set.keywords,
  }));
}

export async function listClarificationQuestionSets(
  organizationId: string,
): Promise<ClarificationQuestionSet[]> {
  const rows = await loadSetRows(organizationId);
  return rows.map(mapSetRow);
}

export async function getClarificationQuestionSetByKey(
  organizationId: string,
  key: string,
): Promise<ClarificationQuestionSet | null> {
  const row = await db.clarificationQuestionSet.findFirst({
    where: { organizationId, key, archivedAt: null },
    orderBy: { version: "desc" },
    include: {
      mergedInto: { select: { key: true } },
      tags: { select: { name: true, aliases: true } },
      questions: {
        orderBy: { sortOrder: "asc" },
        include: { options: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
  return row ? mapSetRow(row) : null;
}

export async function selectClarificationQuestionSetsForLine(
  organizationId: string,
  context: LineMatchContext,
  options?: { limit?: number; minScore?: number },
): Promise<ClarificationSetMatch[]> {
  const rows = await loadSetRows(organizationId, false);
  const sets = rows.map(mapSetRow);
  const bindings = toBindings(rows);
  return matchQuestionSetsForLine(context, sets, bindings, options);
}
