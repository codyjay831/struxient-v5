/**
 * Simple in-process queue for non-critical side effects.
 * Ensures the main transaction completes quickly and isn't blocked by
 * notifications or other secondary tasks.
 */

type SideEffect = () => Promise<void>;

const queue: SideEffect[] = [];
let isProcessing = false;

async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  while (queue.length > 0) {
    const effect = queue.shift();
    if (effect) {
      try {
        await effect();
      } catch (e) {
        // In a real app, we'd log this to Sentry or similar.
        // For now, we just log to console to avoid crashing the worker.
        console.error("[LocalQueue] Side effect failed:", e);
      }
    }
  }

  isProcessing = false;
}

export function enqueueSideEffect(effect: SideEffect) {
  queue.push(effect);
  // Fire and forget the processing loop
  void processQueue();
}
