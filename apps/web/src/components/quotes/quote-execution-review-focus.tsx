"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ExecutionReviewTaskFocus = {
  lineId: string;
  taskId: string;
  nonce: number;
};

type QuoteExecutionReviewFocusContextValue = {
  focus: ExecutionReviewTaskFocus | null;
  focusTask: (lineId: string, taskId: string) => void;
  clearFocus: () => void;
};

const QuoteExecutionReviewFocusContext =
  createContext<QuoteExecutionReviewFocusContextValue | null>(null);

export function QuoteExecutionReviewFocusProvider({ children }: { children: ReactNode }) {
  const [focus, setFocus] = useState<ExecutionReviewTaskFocus | null>(null);

  const focusTask = useCallback((lineId: string, taskId: string) => {
    const lineElement = document.getElementById(`execution-line-${lineId}`);
    lineElement?.scrollIntoView({ behavior: "smooth", block: "start" });

    setFocus({
      lineId,
      taskId,
      nonce: Date.now(),
    });

    window.setTimeout(() => {
      const taskElement = document.getElementById(`execution-task-${taskId}`);
      taskElement?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 150);
  }, []);

  const clearFocus = useCallback(() => {
    setFocus(null);
  }, []);

  const value = useMemo(
    () => ({ focus, focusTask, clearFocus }),
    [focus, focusTask, clearFocus],
  );

  return (
    <QuoteExecutionReviewFocusContext.Provider value={value}>
      {children}
    </QuoteExecutionReviewFocusContext.Provider>
  );
}

export function useQuoteExecutionReviewFocus(): QuoteExecutionReviewFocusContextValue {
  const context = useContext(QuoteExecutionReviewFocusContext);
  if (!context) {
    throw new Error(
      "useQuoteExecutionReviewFocus must be used within QuoteExecutionReviewFocusProvider.",
    );
  }
  return context;
}

export function useQuoteExecutionReviewFocusOptional():
  | QuoteExecutionReviewFocusContextValue
  | null {
  return useContext(QuoteExecutionReviewFocusContext);
}
