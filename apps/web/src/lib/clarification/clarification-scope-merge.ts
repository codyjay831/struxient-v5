/**
 * Scope Clarification — idempotent scope-text merge.
 *
 * Interim (no-schema) persistence renders answers into existing line scope
 * fields. To keep re-apply idempotent, clarification output is written as a
 * delimited block under a header. Re-applying replaces the prior block instead
 * of stacking duplicates. Pure + unit tested.
 */

export const CLARIFICATION_CUSTOMER_HEADER = "Confirmed scope:";
export const CLARIFICATION_INTERNAL_HEADER = "Scope clarification:";

/**
 * Removes a previously inserted block (its header line plus the contiguous
 * bullet/content lines that follow, up to the next blank line) from `text`.
 */
function removeBlock(text: string, header: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim() === header) {
      i += 1;
      // Skip the block body until a blank line or end of text.
      while (i < lines.length && lines[i].trim() !== "") {
        i += 1;
      }
      // Skip a single trailing blank separator if present.
      if (i < lines.length && lines[i].trim() === "") {
        i += 1;
      }
      continue;
    }
    out.push(lines[i]);
    i += 1;
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Merges a clarification block into existing notes under `header`.
 * Returns null when the result is empty.
 */
export function mergeClarificationBlock(
  existing: string | null | undefined,
  header: string,
  bulletLines: readonly string[],
): string | null {
  const base = removeBlock((existing ?? "").trim(), header);
  const cleanedBullets = bulletLines.map((line) => line.trim()).filter(Boolean);

  if (cleanedBullets.length === 0) {
    return base.length > 0 ? base : null;
  }

  const block = `${header}\n${cleanedBullets.map((line) => `- ${line}`).join("\n")}`;
  if (!base) {
    return block;
  }
  return `${base}\n\n${block}`;
}
