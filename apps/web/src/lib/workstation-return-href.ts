/**
 * Helpers for preserving Workstation return context when navigating away from
 * a signal card. Appends `?from=workstation&section={section}` so destination
 * pages can surface a "Back to Workstation" link without redesigning those
 * pages or adding persistence.
 *
 * Only use for internal app hrefs. Never apply to external URLs.
 */

/**
 * Appends `?from=workstation&section={section}` to an internal href so the
 * destination page can detect the return context and surface a back link.
 *
 * @example
 *   buildWorkstationHref("/leads", "investigate")
 *   // → "/sales?from=workstation&section=investigate"
 */
export function buildWorkstationHref(href: string, section: string): string {
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}from=workstation&section=${encodeURIComponent(section)}`;
}

/**
 * Builds a Workstation URL with a selected item.
 */
export function buildWorkstationSelectHref(
  id: string,
  kind: string,
  currentParams?: URLSearchParams,
): string {
  const params = new URLSearchParams(currentParams?.toString());
  params.set("selectedId", id);
  params.set("selectedKind", kind);
  return `?${params.toString()}`;
}

/**
 * Returns the anchor URL to jump back to a Workstation section, used in
 * "← Back to Workstation" links on destination pages.
 *
 * @example
 *   workstationReturnHref("investigate") // → "/workstation#investigate"
 */
export function workstationReturnHref(section: string): string {
  return `/workstation#${section}`;
}
