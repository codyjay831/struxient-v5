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
    type: "management",
    title: "Accept customer requests",
    description: "Control whether customers can submit from your public request page.",
    keywords: ["public request", "intake", "enabled", "pause", "availability"],
    managementGroup: "Management",
    targetRoute: "/settings/intake/public",
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
    id: "manage-customer-intake",
    type: "management",
    title: "Customer intake",
    description: "Open the customer intake control center for public and internal intake setup.",
    keywords: ["intake", "customer intake", "public request", "lead intake", "forms"],
    managementGroup: "Management",
    targetRoute: "/settings/intake",
  },
  {
    id: "manage-public-request",
    type: "management",
    title: "Public page copy & availability",
    description: "Edit public request page title, intro, warning, submit text, and live/paused status.",
    keywords: ["public request", "copy", "intake settings", "form title", "availability"],
    managementGroup: "Management",
    targetRoute: "/settings/intake/public",
  },
  {
    id: "manage-office-intake",
    type: "management",
    title: "Staff intake fields",
    description: "Manage staff intake fields at /leads/new.",
    keywords: ["office intake", "internal intake", "lead form", "staff intake", "new lead"],
    managementGroup: "Management",
    targetRoute: "/settings/intake/staff",
  },
  {
    id: "manage-custom-intake-forms",
    type: "management",
    title: "Specialized customer forms",
    description: "Manage optional additional public customer intake forms and slugs.",
    keywords: ["intake forms", "specialized forms", "public forms", "campaign forms"],
    managementGroup: "Management",
    targetRoute: "/settings/intake/specialized",
  },
  {
    id: "manage-business-profile",
    type: "management",
    title: "Business profile",
    description: "Manage company business profile settings.",
    keywords: ["organization", "company account", "business profile", "trades"],
    managementGroup: "Management",
    targetRoute: "/settings/organization",
  },
  {
    id: "manage-team",
    type: "management",
    title: "Team",
    description: "Invite teammates and manage member roles.",
    keywords: ["team", "invite", "teammate", "users", "roles", "members"],
    managementGroup: "Management",
    targetRoute: "/settings/team",
  },
  {
    id: "invite-teammate",
    type: "management",
    title: "Invite teammate",
    description: "Send an invitation to join your organization.",
    keywords: ["invite", "invitation", "teammate", "add user", "new member"],
    managementGroup: "Management",
    targetRoute: "/settings/team",
  },
  {
    id: "manage-field-access",
    type: "management",
    title: "Field access",
    description: "Manage crews and subcontractor job visibility.",
    keywords: ["crew", "subcontractor", "field visibility", "job access", "field access"],
    managementGroup: "Management",
    targetRoute: "/settings/field-access",
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
  { id: "billing", title: "Billing", href: "/settings/billing" },
  { id: "business-profile", title: "Business profile", href: "/settings/organization" },
  { id: "team", title: "Team", href: "/settings/team" },
  { id: "field-access", title: "Field access", href: "/settings/field-access" },
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
