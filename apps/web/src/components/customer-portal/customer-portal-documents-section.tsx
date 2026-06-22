"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { CustomerProjectPortalDocument } from "@/lib/customer-portal/presenter";
import {
  completeCustomerPortalUploadAction,
  prepareCustomerPortalUploadAction,
} from "@/app/portal/portal-actions";

export function CustomerPortalDocumentsSection({
  accessId,
  documents,
}: {
  accessId: string;
  documents: CustomerProjectPortalDocument["documents"];
}) {
  if (documents.length === 0) {
    return <p className="text-sm text-foreground-muted">No documents are needed from you right now.</p>;
  }

  return (
    <ul className="space-y-3">
      {documents.map((doc) => (
        <li key={doc.id} className="rounded-lg border border-border px-3 py-3 text-sm">
          <p className="font-medium text-foreground">{doc.title}</p>
          {doc.downloadPath ? (
            <a
              href={doc.downloadPath}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm text-primary underline-offset-4 hover:underline"
            >
              View document
            </a>
          ) : null}
          {doc.canUpload ? <UploadSlot accessId={accessId} visibleResourceId={doc.id} title={doc.title} /> : null}
        </li>
      ))}
    </ul>
  );
}

function UploadSlot({
  accessId,
  visibleResourceId,
  title,
}: {
  accessId: string;
  visibleResourceId: string;
  title: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleFile(file: File) {
    setFeedback(null);
    const prep = await prepareCustomerPortalUploadAction(
      accessId,
      visibleResourceId,
      file.name,
      file.type,
      file.size,
    );
    if (!prep.ok) {
      setFeedback(prep.error);
      return;
    }

    if (prep.storageProvider === "local") {
      const body = new FormData();
      body.append("file", file);
      const uploadResponse = await fetch(prep.uploadUrl, { method: "POST", body });
      if (!uploadResponse.ok) {
        setFeedback("Upload failed. Please try again.");
        return;
      }
    } else {
      const uploadResponse = await fetch(prep.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadResponse.ok) {
        setFeedback("Upload failed. Please try again.");
        return;
      }
    }

    const complete = await completeCustomerPortalUploadAction(
      accessId,
      visibleResourceId,
      prep.attachmentId,
    );
    setFeedback(complete.ok ? `${title} uploaded for review.` : complete.error ?? "Upload failed.");
  }

  return (
    <div className="mt-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          startTransition(() => handleFile(file));
        }}
      />
      <Button
        type="button"
        variant="primary"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
      >
        {pending ? "Uploading…" : "Upload file"}
      </Button>
      {feedback ? (
        <p className="mt-2 text-xs text-foreground-muted" role="status">
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
