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

export type SettingsManagementLink = {
  id: string;
  title: string;
  href: string;
};

export type SettingsManagementGroup = {
  id: "company-setup" | "operations-setup";
  title: string;
  links: readonly SettingsManagementLink[];
};

export const SETTINGS_MANAGEMENT_GROUPS = [
  {
    id: "company-setup",
    title: "Company setup",
    links: [
      { id: "billing", title: "Billing", href: "/settings/billing" },
      { id: "business-profile", title: "Business profile", href: "/settings/organization" },
      { id: "team", title: "Team", href: "/settings/team" },
      { id: "field-access", title: "Field access", href: "/settings/field-access" },
    ],
  },
  {
    id: "operations-setup",
    title: "Operations setup",
    links: [
      { id: "scope-library", title: "Scope Library", href: "/settings/scope-library" },
      { id: "reusable-tasks", title: "Reusable tasks", href: "/settings/scope-library/tasks" },
      { id: "stages", title: "Stages", href: "/settings/scope-library/stages" },
      { id: "tags", title: "Tags", href: "/settings/scope-library/tags" },
      {
        id: "clarification",
        title: "Clarification library",
        href: "/settings/scope-library/clarification",
      },
    ],
  },
] as const satisfies readonly SettingsManagementGroup[];

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
    managementGroup: "Workspace",
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
    description: "Open Customer intake settings for public and staff intake setup.",
    keywords: ["intake", "customer intake", "public request", "lead intake", "forms"],
    managementGroup: "Workspace",
    targetRoute: "/settings/intake",
  },
  {
    id: "manage-public-request",
    type: "management",
    title: "Customer request page",
    description: "Edit request page title, intro, warning, submit text, and live/paused status.",
    keywords: ["public request", "copy", "intake settings", "form title", "availability"],
    managementGroup: "Workspace",
    targetRoute: "/settings/intake/public",
  },
  {
    id: "manage-office-intake",
    type: "management",
    title: "Staff intake",
    description: "Manage staff intake fields at /leads/new.",
    keywords: ["office intake", "internal intake", "lead form", "staff intake", "new lead"],
    managementGroup: "Workspace",
    targetRoute: "/settings/intake/staff",
  },
  {
    id: "manage-custom-intake-forms",
    type: "management",
    title: "Customer request links",
    description:
      "Manage your main customer request link and optional additional links for campaigns or service lines.",
    keywords: ["customer request links", "specialized links", "public forms", "campaign forms"],
    managementGroup: "Workspace",
    targetRoute: "/settings/intake/specialized",
  },
  {
    id: "manage-billing",
    type: "management",
    title: "Billing",
    description: "Manage subscription and AI usage settings.",
    keywords: ["billing", "subscription", "stripe", "plan", "ai usage"],
    managementGroup: "Company setup",
    targetRoute: "/settings/billing",
  },
  {
    id: "manage-business-profile",
    type: "management",
    title: "Business profile",
    description: "Manage company business profile settings.",
    keywords: ["organization", "company account", "business profile", "trades"],
    managementGroup: "Company setup",
    targetRoute: "/settings/organization",
  },
  {
    id: "manage-team",
    type: "management",
    title: "Team",
    description: "Invite teammates and manage member roles.",
    keywords: ["team", "invite", "teammate", "users", "roles", "members"],
    managementGroup: "Company setup",
    targetRoute: "/settings/team",
  },
  {
    id: "invite-teammate",
    type: "management",
    title: "Invite teammate",
    description: "Send an invitation to join your organization.",
    keywords: ["invite", "invitation", "teammate", "add user", "new member"],
    managementGroup: "Company setup",
    targetRoute: "/settings/team",
  },
  {
    id: "manage-field-access",
    type: "management",
    title: "Field access",
    description: "Manage crews and subcontractor job visibility.",
    keywords: ["crew", "subcontractor", "field visibility", "job access", "field access"],
    managementGroup: "Company setup",
    targetRoute: "/settings/field-access",
  },
  {
    id: "manage-scope-library",
    type: "management",
    title: "Scope Library",
    description: "Open Scope Library management.",
    keywords: ["scope", "line presets", "quote templates"],
    managementGroup: "Operations setup",
    targetRoute: "/settings/scope-library",
  },
  {
    id: "manage-reusable-tasks",
    type: "management",
    title: "Reusable tasks",
    description: "Manage reusable task templates.",
    keywords: ["task templates", "reusable tasks", "scope library tasks"],
    managementGroup: "Operations setup",
    targetRoute: "/settings/scope-library/tasks",
  },
  {
    id: "manage-stages",
    type: "management",
    title: "Stages",
    description: "Manage execution stages.",
    keywords: ["stages", "workflow stages", "scope library stages"],
    managementGroup: "Operations setup",
    targetRoute: "/settings/scope-library/stages",
  },
  {
    id: "manage-tags",
    type: "management",
    title: "Tags",
    description: "Manage tags used across scope and execution.",
    keywords: ["tags", "scope tags", "classification"],
    managementGroup: "Operations setup",
    targetRoute: "/settings/scope-library/tags",
  },
  {
    id: "manage-clarification",
    type: "management",
    title: "Clarification library",
    description: "Manage clarification question sets.",
    keywords: ["clarification", "question sets", "scope library clarification"],
    managementGroup: "Operations setup",
    targetRoute: "/settings/scope-library/clarification",
  },
];
