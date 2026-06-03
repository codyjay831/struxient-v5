"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import type {
  LeadContactJson,
  LeadRequestJson,
  LeadSignalsJson,
} from "@/lib/lead/lead-projection";
import {
  Archive,
  CheckCircle2,
  Search,
  Loader2,
  Mail,
} from "lucide-react";
import {
  loadLeadCommercialSurfaceAction,
} from "@/app/(workspace)/leads/lead-workspace-actions";
import { LeadCommercialSurface } from "@/components/work-surfaces/lead-commercial-surface";
import { type LeadCommercialSurfacePayload } from "@/lib/lead-commercial-surface/loader";

export type InboxLeadRow = {
  id: string;
  channel: string;
  status: string;
  createdAt: Date;
  contact: LeadContactJson;
  request: LeadRequestJson;
  signals: LeadSignalsJson;
};

type LeadInboxClientProps = {
  initialOpenLeads: InboxLeadRow[];
  initialRecentLeads: InboxLeadRow[];
};

export function LeadInboxClient({
  initialOpenLeads,
  initialRecentLeads,
}: LeadInboxClientProps) {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(
    initialOpenLeads[0]?.id || null,
  );
  const [openLeads] = useState(initialOpenLeads);
  const [recentLeads] = useState(initialRecentLeads);

  const [view, setView] = useState<"inbox" | "recent">("inbox");
  const [searchQuery, setSearchQuery] = useState("");
  const [payload, setPayload] = useState<LeadCommercialSurfacePayload | null>(null);
  const [isLoadingPayload, setIsLoadingPayload] = useState(false);
  const router = useRouter();

  const reloadSurface = useCallback(async () => {
    if (!selectedLeadId) return;
    const result = await loadLeadCommercialSurfaceAction(selectedLeadId);
    if (result.ok) {
      setPayload(result.payload);
    } else {
      console.error(result.error);
    }
  }, [selectedLeadId]);

  const handleMutationSuccess = useCallback(() => {
    void reloadSurface();
    router.refresh();
  }, [reloadSurface, router]);

  const allInboxLeads = useMemo(() => [...openLeads, ...recentLeads], [openLeads, recentLeads]);
  
  const selectedLead = allInboxLeads.find((l) => l.id === selectedLeadId);

  useEffect(() => {
    let active = true;

    if (!selectedLeadId) {
      Promise.resolve().then(() => {
        if (active) {
          setPayload(null);
          setIsLoadingPayload(false);
        }
      });
      return;
    }

    Promise.resolve().then(() => {
      if (active) setIsLoadingPayload(true);
    });
    
    loadLeadCommercialSurfaceAction(selectedLeadId).then((result) => {
      if (!active) return;
      if (result.ok) {
        setPayload(result.payload);
      } else {
        console.error(result.error);
        setPayload(null);
      }
      setIsLoadingPayload(false);
    });

    return () => {
      active = false;
    };
  }, [selectedLeadId]);

  const filteredLeads = useMemo(() => {
    const list = view === "inbox" ? openLeads : recentLeads;
    const query = searchQuery.toLowerCase();
    return list
      .filter((l) => {
        const name = l.contact.name?.toLowerCase() || "";
        const email = l.contact.email?.toLowerCase() || "";
        return name.includes(query) || email.includes(query);
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [view, openLeads, recentLeads, searchQuery]);

  return (
    <div className="flex-1 flex overflow-hidden bg-foreground/[0.02]">
      {/* Sidebar List */}
      <div className="w-full sm:w-[400px] border-r border-border bg-surface flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-foreground-subtle" />
            <input
              type="text"
              placeholder="Search leads..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-foreground/[0.03] border-none rounded-lg text-sm focus:ring-2 focus:ring-accent/20"
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex bg-foreground/[0.03] p-0.5 rounded-lg">
              <button
                onClick={() => setView("inbox")}
                className={`px-3 py-1 rounded-md text-[0.65rem] font-bold transition-all ${
                  view === "inbox"
                    ? "bg-surface text-foreground shadow-sm"
                    : "text-foreground-subtle hover:text-foreground"
                }`}
              >
                Inbox ({openLeads.length})
              </button>
              <button
                onClick={() => setView("recent")}
                className={`px-3 py-1 rounded-md text-[0.65rem] font-bold transition-all ${
                  view === "recent"
                    ? "bg-surface text-foreground shadow-sm"
                    : "text-foreground-subtle hover:text-foreground"
                }`}
              >
                Recent
              </button>
            </div>
            <span className="text-[0.6rem] font-bold text-foreground-subtle uppercase tracking-widest">
              {filteredLeads.length} Leads
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredLeads.map((lead) => {
            const contact = lead.contact;
            const request = lead.request;
            const isSelected = selectedLeadId === lead.id;

            return (
              <button
                key={lead.id}
                onClick={() => setSelectedLeadId(lead.id)}
                className={`w-full text-left p-4 border-b border-border transition-all hover:bg-foreground/[0.01] ${
                  isSelected ? "bg-accent/[0.03] border-l-4 border-l-accent" : "border-l-4 border-l-transparent"
                }`}
              >
                <div className="flex items-start justify-between mb-1">
                  <h3 className={`text-sm font-bold truncate ${isSelected ? "text-accent" : "text-foreground"}`}>
                    {contact.name || "Unknown Lead"}
                  </h3>
                  <span className="text-[0.65rem] text-foreground-subtle whitespace-nowrap ml-2">
                    {formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-xs text-foreground-muted line-clamp-1 mb-2">
                  {request.scope || "No details provided"}
                </p>
                <div className="flex items-center gap-3">
                  {lead.status === "CONVERTED" ? (
                    <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-[0.6rem] font-bold text-success uppercase">
                      <CheckCircle2 className="mr-1 size-2.5" />
                      Graduated
                    </span>
                  ) : lead.status === "ARCHIVED" ? (
                    <span className="inline-flex items-center rounded-full bg-foreground/5 px-2 py-0.5 text-[0.6rem] font-bold text-foreground-subtle uppercase">
                      <Archive className="mr-1 size-2.5" />
                      Archived
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-foreground/5 px-2 py-0.5 text-[0.6rem] font-bold text-foreground-subtle uppercase">
                      {lead.channel}
                    </span>
                  )}
                  {lead.status === "NEW" && (
                    <span className="size-1.5 rounded-full bg-accent animate-pulse" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content / Side Panel */}
      <div className="flex-1 flex flex-col overflow-hidden bg-surface">
        {isLoadingPayload ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="size-8 animate-spin text-accent/20" />
          </div>
        ) : selectedLead && payload ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <LeadCommercialSurface
              key={selectedLeadId}
              payload={payload}
              entryPoint="record"
              onMutationSuccess={handleMutationSuccess}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
            <div className="size-16 rounded-full bg-foreground/5 flex items-center justify-center text-foreground-subtle mb-6">
              <Mail className="size-8" />
            </div>
            <h3 className="text-lg font-bold text-foreground">Select a lead to triage</h3>
            <p className="text-sm text-foreground-muted mt-2 max-w-xs">
              Choose a lead from the list on the left to view details and take action.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
