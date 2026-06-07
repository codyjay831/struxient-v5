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
    description: "Tear-off, material, pitch, decking, and ventilation.",
    draft: {
      key: "roofing.replacement",
      label: "Roof replacement clarifications",
      description: "Scope facts for re-roof and tear-off jobs.",
      aliases: ["roof replacement", "re-roof", "reroof", "new roof", "tear off"],
      keywords: ["roof", "shingle", "tear off", "reroof", "decking"],
      questions: [
        {
          key: "roofing.material",
          label: "Roofing material",
          inputType: "single_choice",
          options: [
            { key: "asphalt", label: "Asphalt shingle" },
            { key: "metal", label: "Metal" },
            { key: "tile", label: "Tile" },
            { key: "flat_tpo", label: "Flat / TPO" },
          ],
        },
        {
          key: "roofing.tear_off",
          label: "Full tear-off required",
          inputType: "yes_no_unknown",
        },
        {
          key: "roofing.layers",
          label: "Existing layers to remove",
          inputType: "number",
        },
        {
          key: "roofing.decking_repair",
          label: "Decking replacement needed",
          inputType: "yes_no_unknown",
        },
        {
          key: "roofing.pitch",
          label: "Roof pitch / slope",
          inputType: "single_choice",
          options: [
            { key: "low", label: "Low slope" },
            { key: "standard", label: "Standard pitch" },
            { key: "steep", label: "Steep" },
          ],
        },
        {
          key: "roofing.ventilation",
          label: "Ventilation upgrade included",
          inputType: "yes_no_unknown",
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
          key: "hvac.system_type",
          label: "System type",
          inputType: "single_choice",
          options: [
            { key: "split", label: "Split system" },
            { key: "package", label: "Package unit" },
            { key: "heat_pump", label: "Heat pump" },
            { key: "mini_split", label: "Mini-split" },
          ],
        },
        {
          key: "hvac.capacity",
          label: "Capacity (tons)",
          inputType: "number",
        },
        {
          key: "hvac.ductwork",
          label: "Ductwork modification required",
          inputType: "yes_no_unknown",
        },
        {
          key: "hvac.line_set",
          label: "Refrigerant line set replacement",
          inputType: "yes_no_unknown",
        },
        {
          key: "hvac.electrical_upgrade",
          label: "Electrical upgrade required",
          inputType: "yes_no_unknown",
        },
        {
          key: "hvac.permit",
          label: "Permit required",
          inputType: "yes_no_unknown",
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
          key: "electrical.new_service_size",
          label: "New service size",
          inputType: "single_choice",
          options: [
            { key: "100a", label: "100A" },
            { key: "125a", label: "125A" },
            { key: "200a", label: "200A" },
            { key: "320a", label: "320A" },
          ],
        },
        {
          key: "electrical.existing_service_size",
          label: "Existing service size",
          inputType: "single_choice",
          options: [
            { key: "100a", label: "100A" },
            { key: "125a", label: "125A" },
            { key: "200a", label: "200A" },
          ],
        },
        {
          key: "electrical.service_feed",
          label: "Service feed",
          inputType: "single_choice",
          options: [
            { key: "overhead", label: "Overhead" },
            { key: "underground", label: "Underground" },
          ],
        },
        {
          key: "electrical.trenching",
          label: "Trenching required",
          inputType: "yes_no_unknown",
        },
        {
          key: "electrical.meter_relocation",
          label: "Meter relocation",
          inputType: "yes_no_unknown",
        },
        {
          key: "electrical.utility_coordination",
          label: "Utility coordination needed",
          inputType: "yes_no_unknown",
        },
      ],
    },
  },
];

export function getClarificationTradePreset(id: string): ClarificationTradePreset | null {
  return CLARIFICATION_TRADE_PRESETS.find((preset) => preset.id === id) ?? null;
}
