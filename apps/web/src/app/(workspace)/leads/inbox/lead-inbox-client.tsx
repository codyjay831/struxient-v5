"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import type { LeadChannel, LeadStatus } from "@prisma/client";
import type {
  LeadContactJson,
  LeadRequestJson,
  LeadSignalsJson,
} from "@/lib/lead/lead-projection";
import {
  User,
  Mail,
  Phone,
  ChevronRight,
  Archive,
  CheckCircle2,
  Search,
  Filter,
  GitMerge,
  Loader2,
  ArrowUpRight,
} from "lucide-react";
import {
  archiveLeadInboxAction,
  createQuoteFromLeadWorkspaceAction,
  loadLeadActiveQuoteWorkSurfaceAction,
  loadLeadServiceAddressContextAction,
} from "@/app/(workspace)/leads/lead-workspace-actions";
import { useRouter } from "next/navigation";
import {
  LeadWorkSurface,
  type LeadWorkSurfaceActiveQuotePayload,
  type LeadWorkSurfaceHandle,
} from "@/components/work-surfaces/lead-work-surface";
import { adaptLeadRow } from "@/lib/lead-work-surface-adapters";
import { patchSerializedLeadRowAfterQuoteStarted } from "@/lib/lead-graduation-lifecycle";
import type { SerializedLeadRow } from "@/lib/serialize-lead-list-row";

export type InboxLeadRow = {
  id: string;
  channel: LeadChannel;
  status: LeadStatus;
  createdAt: Date;
  contact: LeadContactJson;
  request: LeadRequestJson;
  signals: LeadSignalsJson;
};

export type CandidateRow = {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
};

type LeadInboxClientProps = {
  initialOpenLeads: InboxLeadRow[];
  initialRecentLeads: InboxLeadRow[];
  workspaceOpenLeads: SerializedLeadRow[];
  workspaceRecentLeads: SerializedLeadRow[];
  candidates: CandidateRow[];
};

export function LeadInboxClient({
  initialOpenLeads,
  initialRecentLeads,
  workspaceOpenLeads: initialWorkspaceOpenLeads,
  workspaceRecentLeads: initialWorkspaceRecentLeads,
  candidates,
}: LeadInboxClientProps) {
  const router = useRouter();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(
    initialOpenLeads[0]?.id || null,
  );
  const [openLeads, setOpenLeads] = useState(initialOpenLeads);
  const [recentLeads, setRecentLeads] = useState(initialRecentLeads);
  const [workspaceOpenLeads, setWorkspaceOpenLeads] = useState(initialWorkspaceOpenLeads);
  const [workspaceRecentLeads, setWorkspaceRecentLeads] = useState(initialWorkspaceRecentLeads);

  const [sessionGraduatedIds, setSessionGraduatedIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"inbox" | "recent">("inbox");
  const [searchQuery, setSearchQuery] = useState("");
  const [isPromoting, setIsPromoting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const workSurfaceRef = useRef<LeadWorkSurfaceHandle>(null);

  const allInboxLeads = useMemo(() => [...openLeads, ...recentLeads], [openLeads, recentLeads]);
  const allWorkspaceLeads = useMemo(
    () => [...workspaceOpenLeads, ...workspaceRecentLeads],
    [workspaceOpenLeads, workspaceRecentLeads],
  );

  const selectedLead = allInboxLeads.find((l) => l.id === selectedLeadId);
  const selectedWorkspaceLead = allWorkspaceLeads.find((l) => l.id === selectedLeadId);

  const candidateIds = selectedLead?.signals.duplicateCandidateIds ?? [];
  const leadCandidates = candidates.filter((c) => candidateIds.includes(c.id));

  const handleQuoteStarted = useCallback(
    (args: {
      quoteId: string;
      activeQuotePayload: LeadWorkSurfaceActiveQuotePayload | null;
    }) => {
      if (selectedLeadId) {
        setSessionGraduatedIds((prev) => new Set(prev).add(selectedLeadId));
        // Update the status in the lightweight leads list as well
        setOpenLeads((prev) =>
          prev.map((l) => (l.id === selectedLeadId ? { ...l, status: "CONVERTED" } : l)),
        );
        setRecentLeads((prev) =>
          prev.map((l) => (l.id === selectedLeadId ? { ...l, status: "CONVERTED" } : l)),
        );
      }
      setWorkspaceOpenLeads((prev) => {
        const base = prev.find((l) => l.id === selectedLeadId);
        if (!base) return prev;
        return prev.map((l) =>
          l.id === selectedLeadId ? patchSerializedLeadRowAfterQuoteStarted(base, args) : l,
        );
      });
      setWorkspaceRecentLeads((prev) => {
        const base = prev.find((l) => l.id === selectedLeadId);
        if (!base) return prev;
        return prev.map((l) =>
          l.id === selectedLeadId ? patchSerializedLeadRowAfterQuoteStarted(base, args) : l,
        );
      });
    },
    [selectedLeadId],
  );

  const handlePromote = async () => {
    if (!selectedLeadId) return;
    setIsPromoting(true);
    // #region agent log
    fetch('http://127.0.0.1:7937/ingest/24410f3e-b077-4c1d-af62-4457af9c97bc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '564110' },
      body: JSON.stringify({
        sessionId: '564110',
        location: 'lead-inbox-client.tsx:132',
        message: 'Promote clicked',
        data: { id: selectedLeadId },
        timestamp: Date.now(),
        hypothesisId: 'promote-action',
      }),
    }).catch(() => {});
    // #endregion
    try {
      await workSurfaceRef.current?.startQuote();
    } finally {
      setIsPromoting(false);
    }
  };

  const handleArchive = async () => {
    if (!selectedLeadId) return;
    setIsArchiving(true);
    try {
      const result = await archiveLeadInboxAction(selectedLeadId);
      if (result.success) {
        setOpenLeads((prev) => prev.filter((l) => l.id !== selectedLeadId));
        setRecentLeads((prev) => prev.filter((l) => l.id !== selectedLeadId));
        setWorkspaceOpenLeads((prev) => prev.filter((l) => l.id !== selectedLeadId));
        setWorkspaceRecentLeads((prev) => prev.filter((l) => l.id !== selectedLeadId));

        const remaining = allInboxLeads.filter((l) => l.id !== selectedLeadId);
        setSelectedLeadId(remaining[0]?.id ?? null);
        router.refresh();
      } else {
        alert(result.error);
      }
    } finally {
      setIsArchiving(false);
    }
  };

  const filteredLeads = useMemo(() => {
    const baseList = view === "inbox" ? openLeads : recentLeads;

    // Sticky logic: if we are in inbox view but the selected lead was graduated in this session,
    // keep it in the list so the user doesn't lose their place.
    const list = [...baseList];
    if (
      view === "inbox" &&
      selectedLeadId &&
      sessionGraduatedIds.has(selectedLeadId) &&
      !openLeads.find((l) => l.id === selectedLeadId)
    ) {
      const graduatedLead = allInboxLeads.find((l) => l.id === selectedLeadId);
      if (graduatedLead) {
        list.push(graduatedLead);
      }
    }

    const query = searchQuery.toLowerCase();
    return list
      .filter((l) => {
        const name = l.contact.name?.toLowerCase() || "";
        const email = l.contact.email?.toLowerCase() || "";
        return name.includes(query) || email.includes(query);
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [view, openLeads, recentLeads, selectedLead, searchQuery]);

  const { data, linkedQuotes } = useMemo(() => {
    if (!selectedWorkspaceLead) return { data: null, linkedQuotes: [] };
    return adaptLeadRow(selectedWorkspaceLead);
  }, [selectedWorkspaceLead]);

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
        {selectedLead && data ? (
          <>
            <div className="p-6 border-b border-border flex items-center justify-between sticky top-0 bg-surface z-10 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="size-10 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                  <User className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-foreground tracking-tight">
                      {selectedLead.contact.name}
                    </h2>
                    <Link
                      href={`/leads/${selectedLead.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-foreground-subtle hover:text-accent transition-colors"
                      title="Open full lead workspace"
                    >
                      <ArrowUpRight className="size-3.5" />
                    </Link>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-foreground-muted flex items-center gap-1">
                      <Mail className="size-3" />
                      {selectedLead.contact.email || "No email"}
                    </span>
                    <span className="text-xs text-foreground-muted flex items-center gap-1">
                      <Phone className="size-3" />
                      {selectedLead.contact.phone || "No phone"}
                    </span>
                    {selectedWorkspaceLead && (
                      <span
                        className={`text-[0.6rem] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          selectedWorkspaceLead.statusTone === "approved"
                            ? "bg-success/10 text-success"
                            : "bg-foreground/5 text-foreground-subtle"
                        }`}
                      >
                        {selectedWorkspaceLead.statusLabel}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {leadCandidates.length > 0 && (
                  <button
                    onClick={() => setShowMergeDialog(true)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning/10 text-warning hover:bg-warning/20 transition-colors text-xs font-bold"
                  >
                    <GitMerge className="size-4" />
                    Merge ({leadCandidates.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleArchive}
                  disabled={isArchiving}
                  className="p-2 rounded-lg hover:bg-foreground/5 text-foreground-subtle transition-colors disabled:opacity-50"
                  title="Archive"
                >
                  {isArchiving ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <Archive className="size-5" />
                  )}
                </button>
                <div className="w-px h-6 bg-border mx-1" />
                {selectedWorkspaceLead?.progressState !== "QUOTE_IN_PROGRESS" && (
                  <button
                    onClick={handlePromote}
                    disabled={isPromoting}
                    className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-bold text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {isPromoting ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 size-4" />
                    )}
                    Promote to Quote
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <LeadWorkSurface
                key={selectedLeadId}
                ref={workSurfaceRef}
                mode="standard"
                lead={data}
                linkedQuotes={linkedQuotes}
                loadActiveQuoteWorkSurface={() =>
                  loadLeadActiveQuoteWorkSurfaceAction(selectedLeadId!)
                }
                loadServiceAddressContext={() =>
                  loadLeadServiceAddressContextAction(selectedLeadId!)
                }
                onQuoteStarted={handleQuoteStarted}
              />
            </div>
          </>
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

      {/* Merge Dialog */}
      {showMergeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-border">
              <h3 className="text-lg font-bold text-foreground">Merge Lead</h3>
              <p className="text-sm text-foreground-muted mt-1">
                We found existing customers that match this lead&apos;s contact info.
              </p>
            </div>
            <div className="p-4 space-y-2 max-h-[400px] overflow-y-auto">
              {leadCandidates.map(candidate => (
                <button
                  key={candidate.id}
                  className="w-full text-left p-4 rounded-xl border border-border hover:border-accent/40 hover:bg-accent/[0.02] transition-all group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-bold text-foreground group-hover:text-accent transition-colors">{candidate.displayName}</h4>
                    <ChevronRight className="size-4 text-foreground-subtle" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {candidate.email && <p className="text-xs text-foreground-muted">{candidate.email}</p>}
                    {candidate.phone && <p className="text-xs text-foreground-muted">{candidate.phone}</p>}
                  </div>
                </button>
              ))}
            </div>
            <div className="p-4 bg-foreground/[0.02] border-t border-border flex justify-end gap-3">
              <button 
                onClick={() => setShowMergeDialog(false)}
                className="px-4 py-2 text-sm font-bold text-foreground-subtle hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
