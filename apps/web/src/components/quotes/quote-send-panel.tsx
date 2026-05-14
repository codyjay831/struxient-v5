"use client";

import { useState, useActionState, useEffect, useRef } from "react";
import { 
  Send, 
  Plus, 
  X, 
  Mail, 
  Clock, 
  Eye, 
  AlertCircle,
  Loader2
} from "lucide-react";
import { 
  sendQuoteWorkspaceAction,
  type QuoteWorkspaceActionState 
} from "@/app/(workspace)/workstation/quote-workspace-actions";
import { 
  workspaceFormControlClass,
  workspaceFormFieldLabelClass,
  workspaceFormPrimaryButtonClass,
  workspaceFormSecondaryButtonClass 
} from "@/components/line-item-templates/line-item-template-form-fields";
import { toast } from "sonner";

export type QuoteSendPanelProps = {
  quoteId: string;
  initialRecipients: { email: string; name?: string }[];
  organizationDisplayName: string;
  shareUrl: string;
  onSuccess: () => void;
  onCancel: () => void;
};

const initialState: QuoteWorkspaceActionState = {};

export function QuoteSendPanel({
  quoteId,
  initialRecipients,
  organizationDisplayName,
  shareUrl,
  onSuccess,
  onCancel,
}: QuoteSendPanelProps) {
  const [recipients, setRecipients] = useState(initialRecipients);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("30");
  const [showPreview, setShowPreview] = useState(false);

  const [state, formAction, isPending] = useActionState(
    sendQuoteWorkspaceAction.bind(null, quoteId),
    initialState
  );

  const handledKeyRef = useRef<unknown>(null);

  useEffect(() => {
    if (state.success && handledKeyRef.current !== state) {
      handledKeyRef.current = state;
      toast.success("Quote sent successfully.");
      onSuccess();
    }
  }, [state, onSuccess]);

  const handleAddRecipient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newEmail.includes("@")) {
      toast.error("Please enter a valid email address.");
      return;
    }
    if (recipients.some(r => r.email.toLowerCase() === newEmail.toLowerCase())) {
      toast.error("This email is already in the list.");
      return;
    }
    setRecipients([...recipients, { email: newEmail, name: newName || undefined }]);
    setNewEmail("");
    setNewName("");
  };

  const handleRemoveRecipient = (email: string) => {
    setRecipients(recipients.filter(r => r.email !== email));
  };

  return (
    <div className="space-y-6 rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Send className="size-4 text-accent" />
          <h3 className="text-sm font-semibold text-foreground">Send Quote</h3>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-foreground-subtle hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <form action={formAction} className="space-y-5">
        {/* Recipients */}
        <div className="space-y-3">
          <label className={workspaceFormFieldLabelClass}>Recipients</label>
          <div className="space-y-2">
            {recipients.length === 0 ? (
              <p className="text-xs text-foreground-muted italic px-1">No recipients added yet.</p>
            ) : (
              recipients.map((r) => (
                <div key={r.email} className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Mail className="size-3 text-foreground-subtle" />
                      <p className="truncate text-xs font-medium text-foreground">
                        {r.name || "No name"}
                      </p>
                    </div>
                    <p className="truncate text-[10px] text-foreground-muted ml-5">
                      {r.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveRecipient(r.email)}
                    className="ml-2 text-foreground-subtle hover:text-danger transition-colors"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="rounded-lg border border-dashed border-border p-3 bg-foreground/[0.01]">
            <p className="text-[10px] font-medium text-foreground-subtle uppercase tracking-wider mb-2">Add Recipient</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                type="text"
                placeholder="Name (optional)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className={workspaceFormControlClass}
              />
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="Email address"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddRecipient(e);
                    }
                  }}
                  className={workspaceFormControlClass}
                />
                <button
                  type="button"
                  onClick={handleAddRecipient}
                  className="inline-flex items-center justify-center rounded-lg bg-foreground/[0.05] px-3 text-foreground-muted hover:bg-foreground/[0.1] hover:text-foreground transition-colors"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            </div>
          </div>
          <input type="hidden" name="recipients" value={JSON.stringify(recipients)} />
        </div>

        {/* Custom Message */}
        <div className="space-y-2">
          <label htmlFor="customMessage" className={workspaceFormFieldLabelClass}>
            Custom Message (optional)
          </label>
          <textarea
            id="customMessage"
            name="customMessage"
            rows={3}
            placeholder="Add a personal note to the customer..."
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            className={workspaceFormControlClass}
          />
        </div>

        {/* Expiry */}
        <div className="space-y-2">
          <label htmlFor="expiresInDays" className={workspaceFormFieldLabelClass}>
            Link Expiry
          </label>
          <div className="flex items-center gap-2">
            <Clock className="size-3.5 text-foreground-subtle" />
            <select
              id="expiresInDays"
              name="expiresInDays"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              className={`${workspaceFormControlClass} w-auto min-w-[140px]`}
            >
              <option value="7">In 7 days</option>
              <option value="14">In 14 days</option>
              <option value="30">In 30 days (recommended)</option>
              <option value="never">Never</option>
            </select>
          </div>
        </div>

        {/* Preview Toggle */}
        <button
          type="button"
          onClick={() => setShowPreview(!showPreview)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
        >
          {showPreview ? <X className="size-3.5" /> : <Eye className="size-3.5" />}
          {showPreview ? "Hide Email Preview" : "Preview Email"}
        </button>

        {/* Email Preview */}
        {showPreview && (
          <div className="rounded-lg border border-border bg-background overflow-hidden shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="bg-foreground/[0.03] border-b border-border px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle mb-2">Email Preview</p>
              <div className="space-y-1 text-xs">
                <p><span className="text-foreground-muted font-medium">To:</span> {recipients.length > 0 ? recipients.map(r => r.email).join(", ") : "(No recipients)"}</p>
                <p><span className="text-foreground-muted font-medium">Subject:</span> Your proposal from {organizationDisplayName}</p>
              </div>
            </div>
            <div className="p-4 space-y-4 text-sm text-foreground leading-relaxed">
              <p>Hi {recipients.length > 0 ? (recipients[0].name || "there") : "there"},</p>
              <p>Your proposal from <strong>{organizationDisplayName}</strong> is ready to review.</p>
              
              {customMessage && (
                <div className="p-3 bg-foreground/[0.02] border-l-2 border-accent text-foreground-muted italic rounded-r-md">
                  {customMessage.split("\n").map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              )}

              <div className="py-2">
                <div className="inline-block bg-accent px-6 py-2.5 rounded-lg font-bold text-accent-contrast shadow-sm opacity-80">
                  View Proposal
                </div>
                <p className="mt-2 text-[10px] text-foreground-subtle break-all">
                  Or copy this link: {shareUrl || "(Link will be generated)"}
                </p>
              </div>

              <p className="text-xs text-foreground-muted border-t border-border pt-4">
                Best regards,<br/>
                {organizationDisplayName}
              </p>
            </div>
          </div>
        )}

        {state.error && (
          <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/5 p-3 text-xs text-danger">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <p>{state.error}</p>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={isPending || recipients.length === 0}
            className={`${workspaceFormPrimaryButtonClass} flex-1`}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 size-3.5 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 size-3.5" />
                Send Quote
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className={workspaceFormSecondaryButtonClass}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
