export function canonicalizeElectricUtilityName(name: string): string {
  const raw = name.trim();
  if (!raw) return raw;
  const key = normalizeUtilityNameKey(raw);
  if (
    key === "pge" ||
    key.includes("pacificgasandelectric") ||
    key.includes("pgande")
  ) {
    return "PG&E";
  }
  if (key === "sdge" || key.includes("sandiegogasandelectric")) {
    return "San Diego Gas & Electric";
  }
  if (key === "sce" || key.includes("southerncaliforniaedison")) {
    return "Southern California Edison";
  }
  return raw;
}

export function buildElectricUtilityNameAliases(name: string): string[] {
  const canonical = canonicalizeElectricUtilityName(name);
  const aliases = new Set<string>([name.trim(), canonical.trim()].filter(Boolean));
  if (canonical === "PG&E") {
    aliases.add("PG&E");
    aliases.add("PGE");
    aliases.add("Pacific Gas and Electric");
    aliases.add("Pacific Gas & Electric");
    aliases.add("Pacific Gas and Electric Company");
    aliases.add("Pacific Gas and Electric Company (PG&E)");
    aliases.add("Pacific Gas and Electric (PG&E)");
  }
  if (canonical === "San Diego Gas & Electric") {
    aliases.add("San Diego Gas & Electric");
    aliases.add("San Diego Gas and Electric");
    aliases.add("SDG&E");
    aliases.add("SDGE");
  }
  if (canonical === "Southern California Edison") {
    aliases.add("Southern California Edison");
    aliases.add("SCE");
  }
  return [...aliases];
}

function normalizeUtilityNameKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\b(company|co|inc|corp|corporation|llc|the)\b/g, " ")
    .replace(/\s+/g, "");
}
