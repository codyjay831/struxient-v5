"use client";

import * as React from "react";
import { useState, useMemo, useRef, useEffect } from "react";
import { X, Check, ChevronsUpDown, AlertCircle, Plus, Sparkles } from "lucide-react";
import { Badge } from "./badge";
import { TagDisplay } from "@/lib/line-item-template-display";

interface TagPickerProps {
  availableTags: TagDisplay[];
  selectedTags: TagDisplay[];
  onChange: (tags: TagDisplay[]) => void;
  onSuggest?: () => Promise<string[]>;
  placeholder?: string;
}

export function TagPicker({
  availableTags,
  selectedTags,
  onChange,
  onSuggest,
  placeholder = "Select tags...",
}: TagPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isSuggesting, setIsSuggesting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredTags = useMemo(() => {
    const search = inputValue.toLowerCase().trim();
    if (!search) return availableTags.filter(t => !selectedTags.some(s => s.id === t.id));
    
    return availableTags.filter(tag => {
      const isSelected = selectedTags.some(s => s.id === tag.id);
      if (isSelected) return false;
      
      const nameMatch = tag.name.toLowerCase().includes(search);
      // In a real app, we'd also search aliases here if they were in TagDisplay
      return nameMatch;
    });
  }, [availableTags, selectedTags, inputValue]);

  const similarTag = useMemo(() => {
    const search = inputValue.toLowerCase().trim();
    if (!search) return null;
    return availableTags.find(t => t.name.toLowerCase() === search);
  }, [availableTags, inputValue]);

  const handleSelect = (tag: TagDisplay) => {
    onChange([...selectedTags, tag]);
    setInputValue("");
    setIsOpen(false);
  };

  const handleRemove = (tagId: string) => {
    onChange(selectedTags.filter(t => t.id !== tagId));
  };

  const handleCreateNew = () => {
    const name = inputValue.trim();
    if (!name) return;
    
    // In this simple version, we just pass back a "new" tag object
    // The parent action will handle creating it in the DB
    const newTag: TagDisplay = {
      id: `new-${Date.now()}`,
      name: name,
      color: null,
    };
    onChange([...selectedTags, newTag]);
    setInputValue("");
    setIsOpen(false);
  };

  const handleSuggest = async () => {
    if (!onSuggest) return;
    setIsSuggesting(true);
    try {
      const suggestedNames = await onSuggest();
      const newTags: TagDisplay[] = suggestedNames.map(name => {
        const existing = availableTags.find(t => t.name.toLowerCase() === name.toLowerCase());
        if (existing) return existing;
        return {
          id: `new-${Date.now()}-${Math.random()}`,
          name: name,
          color: null,
        };
      });
      
      // Filter out tags already selected
      const uniqueNewTags = newTags.filter(nt => !selectedTags.some(s => s.name.toLowerCase() === nt.name.toLowerCase()));
      onChange([...selectedTags, ...uniqueNewTags]);
    } catch (e) {
      console.error("Failed to get suggestions", e);
    } finally {
      setIsSuggesting(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <div
        className="flex min-h-[40px] w-full flex-wrap gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
        onClick={() => setIsOpen(true)}
      >
        {selectedTags.map((tag) => (
          <Badge key={tag.id} variant="default" className="gap-1 pr-1">
            {tag.name}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRemove(tag.id);
              }}
              className="rounded-full outline-none hover:bg-foreground/20"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <input
          className="flex-1 bg-transparent outline-none placeholder:text-foreground-muted"
          placeholder={selectedTags.length === 0 ? placeholder : ""}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && inputValue) {
              e.preventDefault();
              if (filteredTags.length > 0) {
                handleSelect(filteredTags[0]);
              } else if (!similarTag) {
                handleCreateNew();
              }
            }
          }}
        />
        <div className="flex items-center gap-1">
          {onSuggest && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSuggest();
              }}
              disabled={isSuggesting}
              className="p-1 text-foreground-muted hover:text-primary disabled:opacity-50 transition-colors"
              title="Suggest tags with AI"
            >
              <Sparkles className={`h-4 w-4 ${isSuggesting ? 'animate-spin' : ''}`} />
            </button>
          )}
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-surface shadow-md animate-in fade-in slide-in-from-top-1">
          <div className="p-1">
            {filteredTags.length === 0 && !inputValue && (
              <div className="px-2 py-4 text-center text-xs text-foreground-muted">
                No tags found.
              </div>
            )}
            
            {filteredTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-foreground/5"
                onClick={() => handleSelect(tag)}
              >
                <div
                  className="h-2 w-2 rounded-full border border-border"
                  style={{ backgroundColor: tag.color || "#e2e8f0" }}
                />
                {tag.name}
              </button>
            ))}

            {inputValue && !similarTag && (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-primary hover:bg-foreground/5"
                onClick={handleCreateNew}
              >
                <Plus className="h-4 w-4" />
                Create "{inputValue}"
              </button>
            )}

            {similarTag && (
              <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-warning-strong bg-warning/5 border-t border-border mt-1">
                <AlertCircle className="h-3.5 w-3.5" />
                Similar tag "{similarTag.name}" already exists.
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Hidden input to store tag names for form submission if needed */}
      <input type="hidden" name="tags" value={selectedTags.map(t => t.name).join(",")} />
    </div>
  );
}
