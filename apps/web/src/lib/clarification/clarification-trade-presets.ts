/**
 * Starter clarification set templates for common trades.
 * Plain data — loaded into the inline draft editor, fully editable before save.
 */

import type { ClarificationDraftPayload } from "./clarification-draft-validation";

export type ClarificationTradePreset = {
  id: string;
  label: string;
  description: string;
  draft: ClarificationDraftPayload & {
    description: string;
    aliases: string[];
    keywords: string[];
  };
};

export const CLARIFICATION_TRADE_PRESETS: ClarificationTradePreset[] = [
  {
    id: "roofing",
    label: "Roofing",
    description: "Scope facts for roof size, tear-off, decking, vents, and ordering needs.",
    draft: {
      key: "roofing.replacement",
      label: "Roof replacement scope facts",
      description: "Enter roofing visit facts once and derive quote scope plus ordering needs.",
      aliases: ["roof replacement", "re-roof", "reroof", "new roof", "tear off"],
      keywords: ["roof", "shingle", "tear off", "reroof", "decking", "ridge vent"],
      questions: [
        {
          key: "roofing.replacement.system_type",
          label: "Roof system type",
          inputType: "single_choice",
          customerFacing: true,
          options: [
            { key: "asphalt_shingle", label: "Asphalt shingle" },
            { key: "metal", label: "Metal" },
            { key: "tile", label: "Tile" },
            { key: "flat_tpo", label: "Flat / TPO" },
          ],
        },
        {
          key: "roofing.replacement.squares",
          label: "Roof area",
          inputType: "number",
          unit: "sq",
          customerFacing: true,
          helpText: "Enter total roof squares (1 square = 100 sq ft).",
        },
        {
          key: "roofing.replacement.waste_percent",
          label: "Waste factor",
          inputType: "number",
          unit: "%",
          customerFacing: false,
          helpText: "Used for bundle and underlayment estimation.",
        },
        {
          key: "roofing.replacement.tear_off_required",
          label: "Full tear-off required",
          inputType: "yes_no_unknown",
          customerFacing: true,
        },
        {
          key: "roofing.replacement.tear_off_layers",
          label: "Existing layers to remove",
          inputType: "number",
          unit: "layer",
          customerFacing: true,
        },
        {
          key: "roofing.replacement.pitch_access",
          label: "Pitch / access difficulty",
          inputType: "single_choice",
          customerFacing: false,
          options: [
            { key: "low", label: "Low slope" },
            { key: "standard", label: "Standard pitch" },
            { key: "steep", label: "Steep" },
            { key: "limited_access", label: "Limited access" },
          ],
        },
        {
          key: "roofing.replacement.sheathing_replacement_expected",
          label: "Sheathing replacement expected",
          inputType: "yes_no_unknown",
          customerFacing: true,
        },
        {
          key: "roofing.replacement.sheathing_sheets",
          label: "Sheathing sheets",
          inputType: "number",
          unit: "sheet",
          customerFacing: false,
        },
        {
          key: "roofing.replacement.ridge_vent_lf",
          label: "Ridge vent",
          inputType: "number",
          unit: "lf",
          customerFacing: false,
        },
        {
          key: "roofing.replacement.box_vents_count",
          label: "Box vents",
          inputType: "number",
          unit: "count",
          customerFacing: false,
        },
        {
          key: "roofing.replacement.pipe_boots_count",
          label: "Pipe boots",
          inputType: "number",
          unit: "count",
          customerFacing: false,
        },
        {
          key: "roofing.replacement.drip_edge_lf",
          label: "Drip edge",
          inputType: "number",
          unit: "lf",
          customerFacing: false,
        },
        {
          key: "roofing.replacement.ice_water_shield_required",
          label: "Ice & water shield required",
          inputType: "yes_no_unknown",
          customerFacing: true,
        },
        {
          key: "roofing.replacement.dumpster_required",
          label: "Dumpster required",
          inputType: "yes_no_unknown",
          customerFacing: false,
        },
        {
          key: "roofing.replacement.permit_required",
          label: "Permit required",
          inputType: "yes_no_unknown",
          customerFacing: false,
        },
        {
          key: "roofing.replacement.site_access_notes",
          label: "Site / access / ordering notes",
          inputType: "notes",
          customerFacing: false,
        },
      ],
    },
  },
  {
    id: "hvac",
    label: "HVAC",
    description: "System type, capacity, ductwork, and electrical needs.",
    draft: {
      key: "hvac.replacement",
      label: "HVAC replacement clarifications",
      description: "Equipment and install scope for HVAC change-outs.",
      aliases: ["hvac replacement", "ac replacement", "furnace replacement", "heat pump"],
      keywords: ["hvac", "ac", "furnace", "heat pump", "mini split", "duct"],
      questions: [
        {
          key: "hvac.replacement.system_type",
          label: "System type",
          inputType: "single_choice",
          customerFacing: true,
          options: [
            { key: "split", label: "Split system" },
            { key: "package", label: "Package unit" },
            { key: "heat_pump", label: "Heat pump" },
            { key: "mini_split", label: "Mini-split" },
          ],
        },
        {
          key: "hvac.replacement.capacity_tons",
          label: "Capacity (tons)",
          inputType: "number",
          unit: "ton",
          customerFacing: true,
        },
        {
          key: "hvac.replacement.ductwork_modification_required",
          label: "Ductwork modification required",
          inputType: "yes_no_unknown",
          customerFacing: false,
        },
        {
          key: "hvac.replacement.line_set_replacement",
          label: "Refrigerant line set replacement",
          inputType: "yes_no_unknown",
          customerFacing: false,
        },
        {
          key: "hvac.replacement.electrical_upgrade_required",
          label: "Electrical upgrade required",
          inputType: "yes_no_unknown",
          customerFacing: false,
        },
        {
          key: "hvac.replacement.permit_required",
          label: "Permit required",
          inputType: "yes_no_unknown",
          customerFacing: false,
        },
      ],
    },
  },
  {
    id: "electrical",
    label: "Electrical",
    description: "Service size, feed type, trenching, and utility coordination.",
    draft: {
      key: "electrical.service_upgrade",
      label: "Electrical service upgrade clarifications",
      description: "Panel and service change scope facts.",
      aliases: [
        "service upgrade",
        "panel upgrade",
        "200 amp upgrade",
        "meter main upgrade",
      ],
      keywords: ["service upgrade", "panel", "msp", "meter", "200a"],
      questions: [
        {
          key: "electrical.service_upgrade.new_service_size",
          label: "New service size",
          inputType: "single_choice",
          customerFacing: true,
          options: [
            { key: "100a", label: "100A" },
            { key: "125a", label: "125A" },
            { key: "200a", label: "200A" },
            { key: "320a", label: "320A" },
          ],
        },
        {
          key: "electrical.service_upgrade.existing_service_size",
          label: "Existing service size",
          inputType: "single_choice",
          customerFacing: false,
          options: [
            { key: "100a", label: "100A" },
            { key: "125a", label: "125A" },
            { key: "200a", label: "200A" },
          ],
        },
        {
          key: "electrical.service_upgrade.service_feed",
          label: "Service feed",
          inputType: "single_choice",
          customerFacing: true,
          options: [
            { key: "overhead", label: "Overhead" },
            { key: "underground", label: "Underground" },
          ],
        },
        {
          key: "electrical.service_upgrade.trenching_required",
          label: "Trenching required",
          inputType: "yes_no_unknown",
          customerFacing: true,
        },
        {
          key: "electrical.service_upgrade.meter_relocation",
          label: "Meter relocation",
          inputType: "yes_no_unknown",
          customerFacing: true,
        },
        {
          key: "electrical.service_upgrade.utility_coordination_needed",
          label: "Utility coordination needed",
          inputType: "yes_no_unknown",
          customerFacing: false,
        },
      ],
    },
  },
];

export function getClarificationTradePreset(id: string): ClarificationTradePreset | null {
  return CLARIFICATION_TRADE_PRESETS.find((preset) => preset.id === id) ?? null;
}
