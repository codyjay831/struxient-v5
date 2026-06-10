"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  applyQuoteLineExecutionAIProposalAction,
  assessQuoteLineExecutionContextAction,
  generateQuoteLineExecutionAIProposalAction,
} from "@/app/(workspace)/quotes/quote-line-execution-actions";
import type {
  ExecutionContextAssessment,
  ExecutionPlanningContextBucket,
  ExecutionPlanningContextManifest,
  ExecutionPlanningContextSourceFlags,
  QuoteLineExecutionRevalidateScope,
} from "@/app/(workspace)/quotes/quote-line-execution-types";
import { workspaceFormSecondaryButtonClass } from "@/components/line-item-templates/line-item-template-form-fields";
import { AILibraryProposalReviewPanel } from "@/components/scope-library/ai-library-proposal-review-panel";
import type { AILibraryProposal } from "@/lib/ai/library-proposal-schema";
import type { AILibraryProposalGenerationMeta } from "@/lib/ai/ai-execution-plan-generation";
import { getStagesForAiExecutionPlanning } from "@/lib/ai/ai-execution-plan-corrections";
import { getAiActionErrorMessage } from "@/lib/ai/ai-provider-errors";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

const secondaryButtonClass = workspaceFormSecondaryButtonClass;
const aiExecutionContextPreflightEnabled =
  process.env.NEXT_PUBLIC_AI_EXECUTION_CONTEXT_PREFLIGHT === "1";

type DraftTaskChoice = { id: string; title: string };

export function QuoteLineExecutionAiDrawer({
  quoteId,
  lineItemId,
  lineLabel,
  tasks,
  stages,
  revalidateScope = "quote",
  initialPlanningContext = "",
  planningContext: controlledPlanningContext,
  onPlanningContextChange,
  open,
  onClose,
}: {
  quoteId: string;
  lineItemId: string;
  lineLabel?: string;
  tasks: readonly DraftTaskChoice[];
  stages: { id: string; name: string }[];
  revalidateScope?: QuoteLineExecutionRevalidateScope;
  initialPlanningContext?: string;
  planningContext?: string;
  onPlanningContextChange?: (value: string) => void;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [internalPlanningContext, setInternalPlanningContext] = useState(initialPlanningContext);
  const planningContext = controlledPlanningContext ?? internalPlanningContext;
  const setPlanningContext = onPlanningContextChange ?? setInternalPlanningContext;

  const [aiProposal, setAiProposal] = useState<AILibraryProposal | null>(null);
  const [aiProposalGeneration, setAiProposalGeneration] =
    useState<AILibraryProposalGenerationMeta | null>(null);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [isAiRegenerating, setIsAiRegenerating] = useState(false);
  const [isAiAssessing, setIsAiAssessing] = useState(false);
  const [aiContextAssessment, setAiContextAssessment] =
    useState<ExecutionContextAssessment | null>(null);
  const [aiContextManifest, setAiContextManifest] =
    useState<ExecutionPlanningContextManifest | null>(null);
  const [aiContextPreview, setAiContextPreview] = useState("");
  const [contextSourceFlags, setContextSourceFlags] = useState<ExecutionPlanningContextSourceFlags>({
    includeReusableExecutionGuidance: true,
    includeJobTechnicalDetails: false,
    includeSiteAccessSchedule: false,
    includeCustomerProposal: false,
    includeBackground: false,
    includePriorMissingContext: true,
    includeSiteDetailsFacts: true,
  });
  const [contextItemOverrides, setContextItemOverrides] = useState<
    Record<string, { include?: boolean; bucket?: ExecutionPlanningContextBucket }>
  >({});
  const aiAssessRequestSeqRef = useRef(0);
  const [keepTaskIds, setKeepTaskIds] = useState<string[]>([]);

  const closeDrawer = () => {
    setAiProposal(null);
    setAiProposalGeneration(null);
    setAiContextAssessment(null);
    setAiContextManifest(null);
    setAiContextPreview("");
    setIsAiAssessing(false);
    aiAssessRequestSeqRef.current += 1;
    setKeepTaskIds([]);
    setContextItemOverrides({});
    onClose();
  };

  const assessAiContext = async (nextPlanningContext: string) => {
    const seq = aiAssessRequestSeqRef.current + 1;
    aiAssessRequestSeqRef.current = seq;
    setIsAiAssessing(true);
    try {
      const result = await assessQuoteLineExecutionContextAction(quoteId, lineItemId, {
        userInstructions: nextPlanningContext,
        priorMissingContext: aiProposal?.missingContext,
        sourceFlags: contextSourceFlags,
        itemOverrides: contextItemOverrides,
      });
      if (aiAssessRequestSeqRef.current !== seq) {
        return;
      }
      if (result.error) {
        toast.warning(result.error);
        return;
      }
      setAiContextAssessment(result.assessment ?? null);
      setAiContextManifest(result.contextManifest ?? null);
      setAiContextPreview(result.contextPreview ?? "");
    } catch (error) {
      if (aiAssessRequestSeqRef.current !== seq) {
        return;
      }
      console.error(error);
      toast.warning(getAiActionErrorMessage(error, "Failed to assess execution context."));
    } finally {
      if (aiAssessRequestSeqRef.current === seq) {
        setIsAiAssessing(false);
      }
    }
  };

  const generateAiProposal = async (nextPlanningContext: string) => {
    setIsAiGenerating(true);
    try {
      const result = await generateQuoteLineExecutionAIProposalAction(quoteId, lineItemId, {
        userInstructions: nextPlanningContext,
        priorMissingContext: aiProposal?.missingContext,
        sourceFlags: contextSourceFlags,
        itemOverrides: contextItemOverrides,
      });
      if (result.error) {
        toast.error(result.error);
        setAiProposal(null);
        setAiProposalGeneration(null);
        return;
      }
      if (!result.proposal) {
        toast.error("AI returned no execution plan. Try again.");
        setAiProposal(null);
        setAiProposalGeneration(null);
        return;
      }
      setAiProposal(result.proposal);
      setAiProposalGeneration(result.generation ?? null);
      setAiContextManifest(result.contextManifest ?? null);
      setAiContextPreview(result.contextPreview ?? "");
    } catch (error) {
      console.error(error);
      toast.error(getAiActionErrorMessage(error, "Failed to generate AI proposal."));
      setAiProposal(null);
      setAiProposalGeneration(null);
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleApplyAiProposal = async (
    approvedProposal: AILibraryProposal,
    options?: { applyMode?: "append" | "replace"; keepTaskIds?: string[] },
  ) => {
    const result = await applyQuoteLineExecutionAIProposalAction(
      quoteId,
      lineItemId,
      approvedProposal,
      aiProposalGeneration ?? undefined,
      {
        mode: "replace",
        keepTaskIds: options?.keepTaskIds ?? keepTaskIds,
        revalidateScope,
      },
    );
    if (result.error) {
      throw new Error(result.error);
    }
    if (result.warnings?.length) {
      result.warnings.forEach((warning) => toast.warning(warning));
    }
    router.refresh();
  };

  if (!open) {
    return null;
  }

  return (
    <AILibraryProposalReviewPanel
      proposal={aiProposal}
      generation={aiProposalGeneration ?? undefined}
      contextAssessment={aiExecutionContextPreflightEnabled ? aiContextAssessment : null}
      contextManifest={aiContextManifest}
      contextPreview={aiContextPreview}
      contextSourceFlags={contextSourceFlags}
      onContextSourceFlagsChange={setContextSourceFlags}
      contextItemOverrides={contextItemOverrides}
      onContextItemOverridesChange={setContextItemOverrides}
      stages={getStagesForAiExecutionPlanning(stages)}
      lineLabel={lineLabel}
      planningContext={planningContext}
      onPlanningContextChange={setPlanningContext}
      isGenerating={isAiGenerating}
      isAssessing={isAiAssessing}
      isRegenerating={isAiRegenerating}
      onAssessContext={async ({ planningContext: nextPlanningContext }) => {
        setPlanningContext(nextPlanningContext);
        await assessAiContext(nextPlanningContext);
      }}
      onGenerate={async ({ planningContext: nextPlanningContext }) => {
        setPlanningContext(nextPlanningContext);
        await generateAiProposal(nextPlanningContext);
      }}
      onRegenerate={async ({ planningContext: nextPlanningContext }) => {
        setIsAiRegenerating(true);
        try {
          setPlanningContext(nextPlanningContext);
          await generateAiProposal(nextPlanningContext);
        } finally {
          setIsAiRegenerating(false);
        }
      }}
      applyMode="replace"
      existingDraftTasks={[...tasks]}
      selectedKeepTaskIds={keepTaskIds}
      onSelectedKeepTaskIdsChange={setKeepTaskIds}
      onClose={closeDrawer}
      onApply={handleApplyAiProposal}
    />
  );
}

/** Line-level trigger that opens the AI execution drawer immediately. */
export function QuoteLineExecutionAiDrawerButton({
  quoteId,
  lineItemId,
  lineLabel,
  tasks,
  stages,
  revalidateScope = "quote",
  initialPlanningContext = "",
}: {
  quoteId: string;
  lineItemId: string;
  lineLabel?: string;
  tasks: readonly DraftTaskChoice[];
  stages: { id: string; name: string }[];
  revalidateScope?: QuoteLineExecutionRevalidateScope;
  initialPlanningContext?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={secondaryButtonClass}
        onClick={() => setOpen(true)}
        aria-expanded={open}
      >
        <Sparkles className="size-4" />
        {tasks.length === 0 ? "Plan with AI" : "Refine with AI"}
      </button>
      <QuoteLineExecutionAiDrawer
        quoteId={quoteId}
        lineItemId={lineItemId}
        lineLabel={lineLabel}
        tasks={tasks}
        stages={stages}
        revalidateScope={revalidateScope}
        initialPlanningContext={initialPlanningContext}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
