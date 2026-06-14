export const SETTINGS_SECTIONS = [
  "workstation",
  "customer-intake",
  "appearance",
  "commercial",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const DEFAULT_SETTINGS_SECTION: SettingsSection = "workstation";

export function isSettingsSection(value: string | null | undefined): value is SettingsSection {
  if (!value) return false;
  return (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

export type SettingsSearchEntryType = "setting" | "management";

type SettingsSearchEntryBase = {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  type: SettingsSearchEntryType;
};

export type SettingsSearchSettingEntry = SettingsSearchEntryBase & {
  type: "setting";
  category: SettingsSection;
  targetSection: SettingsSection;
  rowId: string;
};

export type SettingsSearchManagementEntry = SettingsSearchEntryBase & {
  type: "management";
  managementGroup: string;
  targetRoute: string;
};

export type SettingsSearchEntry =
  | SettingsSearchSettingEntry
  | SettingsSearchManagementEntry;

export const SETTINGS_CATEGORY_LABELS: Record<SettingsSection, string> = {
  workstation: "Workstation",
  "customer-intake": "Customer intake",
  appearance: "Appearance",
  commercial: "Sales & relationships",
};

export const SETTINGS_SEARCH_REGISTRY: SettingsSearchEntry[] = [
  {
    id: "show-quick-actions",
    type: "setting",
    title: "Show quick actions",
    description: "Show or hide quick actions in Workstation.",
    keywords: ["quick actions", "workstation", "buttons", "show"],
    category: "workstation",
    targetSection: "workstation",
    rowId: "row-show-quick-actions",
  },
  {
    id: "urgent-threshold",
    type: "setting",
    title: "Urgent threshold",
    description: "Set how many hours count as urgent in Workstation.",
    keywords: ["urgent", "threshold", "hours", "workstation"],
    category: "workstation",
    targetSection: "workstation",
    rowId: "row-urgent-threshold",
  },
  {
    id: "theme",
    type: "setting",
    title: "Theme",
    description: "Switch between light, dark, or system appearance.",
    keywords: ["theme", "appearance", "dark", "light", "system"],
    category: "appearance",
    targetSection: "appearance",
    rowId: "row-theme",
  },
  {
    id: "public-request-enabled",
    type: "setting",
    title: "Accept public requests",
    description: "Control whether customers can submit from your public request page.",
    keywords: ["public request", "intake", "enabled", "pause"],
    category: "customer-intake",
    targetSection: "customer-intake",
    rowId: "row-accept-public-requests",
  },
  {
    id: "commercial-access-note",
    type: "setting",
    title: "Sales & relationships access",
    description:
      "Commercial pages require Office, Admin, Owner, or Viewer; Field/Subcontractor are restricted.",
    keywords: ["sales access", "customers access", "quotes access", "role access"],
    category: "commercial",
    targetSection: "commercial",
    rowId: "row-commercial-access-note",
  },
  {
    id: "manage-public-request",
    type: "management",
    title: "Public request page",
    description: "Edit public request page copy and details.",
    keywords: ["public request", "copy", "intake settings", "form title"],
    managementGroup: "Management",
    targetRoute: "/settings/public-request-settings",
  },
  {
    id: "manage-office-intake",
    type: "management",
    title: "Office intake form",
    description: "Open the office intake form management page.",
    keywords: ["office intake", "lead form", "staff intake"],
    managementGroup: "Management",
    targetRoute: "/settings/intake/office",
  },
  {
    id: "manage-custom-intake-forms",
    type: "management",
    title: "Custom intake forms",
    description: "Manage additional public and custom intake forms.",
    keywords: ["intake forms", "custom forms", "public forms"],
    managementGroup: "Management",
    targetRoute: "/settings/intake-forms",
  },
  {
    id: "manage-business-profile",
    type: "management",
    title: "Business profile",
    description: "Manage company business profile settings.",
    keywords: ["organization", "company account", "business profile"],
    managementGroup: "Management",
    targetRoute: "/settings/organization",
  },
  {
    id: "manage-scope-library",
    type: "management",
    title: "Scope Library",
    description: "Open Scope Library management.",
    keywords: ["scope", "line presets", "quote templates"],
    managementGroup: "Management",
    targetRoute: "/settings/scope-library",
  },
  {
    id: "manage-reusable-tasks",
    type: "management",
    title: "Reusable tasks",
    description: "Manage reusable task templates.",
    keywords: ["task templates", "reusable tasks", "scope library tasks"],
    managementGroup: "Management",
    targetRoute: "/settings/scope-library/tasks",
  },
  {
    id: "manage-stages",
    type: "management",
    title: "Stages",
    description: "Manage execution stages.",
    keywords: ["stages", "workflow stages", "scope library stages"],
    managementGroup: "Management",
    targetRoute: "/settings/scope-library/stages",
  },
  {
    id: "manage-tags",
    type: "management",
    title: "Tags",
    description: "Manage tags used across scope and execution.",
    keywords: ["tags", "scope tags", "classification"],
    managementGroup: "Management",
    targetRoute: "/settings/scope-library/tags",
  },
  {
    id: "manage-clarification",
    type: "management",
    title: "Clarification library",
    description: "Manage clarification question sets.",
    keywords: ["clarification", "question sets", "scope library clarification"],
    managementGroup: "Management",
    targetRoute: "/settings/scope-library/clarification",
  },
];

export const SETTINGS_MANAGEMENT_LINKS = [
  { id: "business-profile", title: "Business profile", href: "/settings/organization" },
  { id: "scope-library", title: "Scope Library", href: "/settings/scope-library" },
  { id: "reusable-tasks", title: "Reusable tasks", href: "/settings/scope-library/tasks" },
  { id: "stages", title: "Stages", href: "/settings/scope-library/stages" },
  { id: "tags", title: "Tags", href: "/settings/scope-library/tags" },
  {
    id: "clarification",
    title: "Clarification library",
    href: "/settings/scope-library/clarification",
  },
] as const;
