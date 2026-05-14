import type {
  QuoteStatus,
  TaskTemplateCategory,
} from "@prisma/client";

/** Plain input for {@link buildQuoteExecutionReviewPreviewModel} */
export type QuoteExecutionReviewTaskInput = {
  id: string;
  title: string;
  stageId: string | null;
  stageName?: string | null;
  category: TaskTemplateCategory;
  providesSignals: string[];
  requiresSignals: string[];
  hardSignal: boolean;
  sortOrder: number;
};

export type QuoteExecutionReviewLineInput = {
  id: string;
  description: string;
  sortOrder: number;
  tasks: QuoteExecutionReviewTaskInput[];
};

export type QuoteExecutionReviewQuoteInput = {
  id: string;
  title: string;
  status: QuoteStatus;
  lines: QuoteExecutionReviewLineInput[];
};

export type QuoteExecutionReviewHandshake = {
  signal: string;
  providerTaskId: string;
  providerTaskTitle: string;
  providerLineDescription: string;
  consumerTaskId: string;
  consumerTaskTitle: string;
  consumerLineDescription: string;
};

export type QuoteExecutionReviewOrphan = {
  signal: string;
  isHard: boolean;
  consumerTaskId: string;
  consumerTaskTitle: string;
  consumerLineDescription: string;
};

export type QuoteExecutionReviewPreviewModel = {
  summary: {
    totalLines: number;
    totalTasks: number;
    providedSignalCount: number;
    requiredSignalCount: number;
    orphanCount: number;
    hardOrphanCount: number;
  };
  handshakes: QuoteExecutionReviewHandshake[];
  orphans: QuoteExecutionReviewOrphan[];
  lineReadiness: {
    lineId: string;
    description: string;
    taskCount: number;
    providesSignals: string[];
    requiresSignals: string[];
  }[];
};

export function buildQuoteExecutionReviewPreviewModel(
  quote: QuoteExecutionReviewQuoteInput,
): QuoteExecutionReviewPreviewModel {
  const allTasks = quote.lines.flatMap((l) => 
    l.tasks.map(t => ({ ...t, lineDescription: l.description, lineId: l.id }))
  );

  const providedSignalsMap = new Map<string, typeof allTasks[number][]>();
  for (const t of allTasks) {
    for (const s of t.providesSignals) {
      if (!providedSignalsMap.has(s)) providedSignalsMap.set(s, []);
      providedSignalsMap.get(s)!.push(t);
    }
  }

  const handshakes: QuoteExecutionReviewHandshake[] = [];
  const orphans: QuoteExecutionReviewOrphan[] = [];

  for (const consumer of allTasks) {
    for (const signal of consumer.requiresSignals) {
      const providers = providedSignalsMap.get(signal);
      if (providers && providers.length > 0) {
        for (const provider of providers) {
          handshakes.push({
            signal,
            providerTaskId: provider.id,
            providerTaskTitle: provider.title,
            providerLineDescription: provider.lineDescription,
            consumerTaskId: consumer.id,
            consumerTaskTitle: consumer.title,
            consumerLineDescription: consumer.lineDescription,
          });
        }
      } else {
        orphans.push({
          signal,
          isHard: consumer.hardSignal,
          consumerTaskId: consumer.id,
          consumerTaskTitle: consumer.title,
          consumerLineDescription: consumer.lineDescription,
        });
      }
    }
  }

  const lineReadiness = quote.lines.map(l => ({
    lineId: l.id,
    description: l.description,
    taskCount: l.tasks.length,
    providesSignals: Array.from(new Set(l.tasks.flatMap(t => t.providesSignals))),
    requiresSignals: Array.from(new Set(l.tasks.flatMap(t => t.requiresSignals))),
  }));

  return {
    summary: {
      totalLines: quote.lines.length,
      totalTasks: allTasks.length,
      providedSignalCount: providedSignalsMap.size,
      requiredSignalCount: new Set(allTasks.flatMap((t) => t.requiresSignals)).size,
      orphanCount: orphans.length,
      hardOrphanCount: orphans.filter(o => o.isHard).length,
    },
    handshakes,
    orphans,
    lineReadiness,
  };
}
