import type {
  OperationalAttentionResolverContext,
  OperationalAttentionResolverInput,
  OperationalAttentionResolverOutput,
} from "./types";

/**
 * Slice 1 orchestration boundary only.
 *
 * Future slices will load or adapt domain records here. For now, callers may
 * pass already-derived items so tests can prove the projection contract without
 * duplicating Workstation queries or changing runtime behavior.
 */
export function resolveOperationalAttentionItems(
  context: OperationalAttentionResolverContext,
  input: OperationalAttentionResolverInput = {},
): OperationalAttentionResolverOutput {
  void context;

  const sourceItems = input.items ?? [];
  const items = input.includeUnreadable
    ? [...sourceItems]
    : sourceItems.filter((item) => item.visibility.canRead);

  return {
    items,
    diagnostics: [],
  };
}
