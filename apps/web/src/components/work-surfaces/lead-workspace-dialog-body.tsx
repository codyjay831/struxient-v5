"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { loadLeadCommercialSurfaceAction } from "@/app/(workspace)/leads/lead-workspace-actions";
import { LeadCommercialSurface } from "@/components/work-surfaces/lead-commercial-surface";
import { type LeadCommercialSurfacePayload } from "@/lib/lead-commercial-surface/loader";

export type LeadWorkspaceDialogBodyProps = {
  leadId: string;
  onClose: () => void;
};

export function LeadWorkspaceDialogBody({
  leadId,
  onClose,
}: LeadWorkspaceDialogBodyProps) {
  const router = useRouter();
  const [payload, setPayload] = useState<LeadCommercialSurfacePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const reloadSurface = useCallback(async () => {
    const result = await loadLeadCommercialSurfaceAction(leadId);
    if (result.ok) {
      setPayload(result.payload);
    } else {
      console.error(result.error);
    }
  }, [leadId]);

  const handleMutationSuccess = useCallback(() => {
    void reloadSurface();
    router.refresh();
  }, [reloadSurface, router]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) setIsLoading(true);
    });
    loadLeadCommercialSurfaceAction(leadId).then((result) => {
      if (!active) return;
      if (result.ok) {
        setPayload(result.payload);
      } else {
        console.error(result.error);
      }
      setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [leadId]);

  return (
    <div className="flex max-h-[88vh] flex-col min-h-[400px]">
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-8 animate-spin text-accent/20" />
        </div>
      ) : payload ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <LeadCommercialSurface
            payload={payload}
            entryPoint="sales_modal"
            onMutationSuccess={handleMutationSuccess}
            onClose={onClose}
          />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-12 text-center">
          <p className="text-sm text-foreground-muted">Failed to load opportunity details.</p>
        </div>
      )}
    </div>
  );
}
