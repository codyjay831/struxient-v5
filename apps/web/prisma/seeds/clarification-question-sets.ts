import type { PrismaClient } from "@prisma/client";
import {
  SEED_CLARIFICATION_BINDINGS,
  SEED_CLARIFICATION_QUESTION_SETS,
} from "../../src/lib/clarification/clarification-library";
import { normalizeForMatch } from "../../src/lib/clarification/clarification-matching";

function toTagKey(value: string): string {
  return normalizeForMatch(value).replace(/\s+/g, "-");
}

export async function seedClarificationQuestionSets(
  prisma: PrismaClient,
  organizationId: string,
): Promise<{ setsSeeded: number; questionsSeeded: number; optionsSeeded: number }> {
  let setsSeeded = 0;
  let questionsSeeded = 0;
  let optionsSeeded = 0;

  for (const set of SEED_CLARIFICATION_QUESTION_SETS) {
    const binding = SEED_CLARIFICATION_BINDINGS.find((item) => item.questionSetKey === set.key);
    const targetTagKeys = new Set((binding?.tagKeys ?? []).map(toTagKey));
    const orgTags = await prisma.tag.findMany({
      where: { organizationId, status: "ACTIVE" },
      select: { id: true, name: true, aliases: true },
    });
    const matchingTagIds = orgTags
      .filter((tag) => {
        const keys = [tag.name, ...tag.aliases].map(toTagKey);
        return keys.some((key) => targetTagKeys.has(key));
      })
      .map((tag) => tag.id);

    const row = await prisma.clarificationQuestionSet.upsert({
      where: {
        organizationId_key_version: {
          organizationId,
          key: set.key,
          version: set.version,
        },
      },
      create: {
        organizationId,
        key: set.key,
        version: set.version,
        label: set.label,
        status: set.status,
        description: set.description ?? null,
        aliases: set.aliases,
        keywords: binding?.keywords ?? [],
      },
      update: {
        label: set.label,
        status: set.status,
        description: set.description ?? null,
        aliases: set.aliases,
        keywords: binding?.keywords ?? [],
      },
      select: { id: true },
    });

    await prisma.clarificationQuestionSet.update({
      where: { id: row.id },
      data: {
        tags: { set: [], connect: matchingTagIds.map((id) => ({ id })) },
      },
    });

    await prisma.clarificationQuestion.deleteMany({
      where: { questionSetId: row.id },
    });

    for (const [questionIdx, question] of set.questions.entries()) {
      const createdQuestion = await prisma.clarificationQuestion.create({
        data: {
          questionSetId: row.id,
          key: question.key,
          label: question.label,
          inputType: question.inputType,
          helpText: question.helpText ?? null,
          allowOther: question.allowOther ?? false,
          unit: question.unit ?? null,
          customerFacing: question.customerFacing ?? false,
          sortOrder: questionIdx,
          aliases: question.aliases ?? [],
        },
        select: { id: true },
      });
      questionsSeeded += 1;

      const options = question.options ?? [];
      for (const [optionIdx, option] of options.entries()) {
        await prisma.clarificationOption.create({
          data: {
            questionId: createdQuestion.id,
            key: option.key,
            label: option.label,
            aliases: option.aliases ?? [],
            sortOrder: optionIdx,
          },
        });
        optionsSeeded += 1;
      }
    }
    setsSeeded += 1;
  }

  return { setsSeeded, questionsSeeded, optionsSeeded };
}
