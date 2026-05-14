"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { X, Upload, FileText, Loader2 } from "lucide-react";

export type FileWithStatus = {
  file: File;
  id: string;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
  attachmentId?: string;
};

export function MultiFilePicker({
  onFilesSelected,
  maxFiles = 5,
  maxSizeMB = 10,
}: {
  onFilesSelected: (files: File[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
}) {
  const [files, setFiles] = useState<FileWithStatus[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    const newFiles: FileWithStatus[] = selectedFiles
      .slice(0, maxFiles - files.length)
      .map((file) => ({
        file,
        id: Math.random().toString(36).substring(2, 11),
        status: "pending",
      }));

    const updatedFiles = [...files, ...newFiles];
    setFiles(updatedFiles);
    onFilesSelected(updatedFiles.map(f => f.file));
    
    // Reset input so same file can be selected again if removed
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = (id: string) => {
    const updatedFiles = files.filter((f) => f.id !== id);
    setFiles(updatedFiles);
    onFilesSelected(updatedFiles.map(f => f.file));
  };

  const isImage = (type: string) => type.startsWith("image/");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {files.map((f) => (
          <div
            key={f.id}
            className="group relative flex size-20 items-center justify-center rounded-xl border border-border bg-surface overflow-hidden"
          >
            {isImage(f.file.type) ? (
              <Image
                src={URL.createObjectURL(f.file)}
                alt={f.file.name}
                width={80}
                height={80}
                unoptimized
                className="size-full object-cover opacity-60 group-hover:opacity-40 transition-opacity"
              />
            ) : (
              <FileText className="size-8 text-foreground-subtle opacity-60 group-hover:opacity-40 transition-opacity" />
            )}
            
            <button
              type="button"
              onClick={() => removeFile(f.id)}
              className="absolute right-1 top-1 rounded-full bg-foreground/10 p-1 text-foreground hover:bg-foreground/20 transition-colors"
            >
              <X className="size-3" />
            </button>

            {f.status === "uploading" && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/40">
                <Loader2 className="size-5 animate-spin text-accent" />
              </div>
            )}
            
            {f.status === "error" && (
              <div className="absolute inset-x-0 bottom-0 bg-danger/80 px-1 py-0.5 text-[8px] text-white text-center truncate">
                {f.error || "Error"}
              </div>
            )}
          </div>
        ))}

        {files.length < maxFiles && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex size-20 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-foreground/[0.02] text-foreground-subtle hover:border-accent hover:bg-accent/[0.02] hover:text-accent transition-all"
          >
            <Upload className="size-5 mb-1" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Add</span>
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      {files.length > 0 && (
        <p className="text-[10px] text-foreground-subtle italic">
          {files.length} of {maxFiles} files selected. Max {maxSizeMB}MB per file.
        </p>
      )}
    </div>
  );
}
