/**
 * Trade-contractor demo line-item presets.
 *
 * Seeds reusable [LineItemTemplate] rows (with default [LineItemTemplateTask] children)
 * that look like real residential / small-commercial contractor scope across ten+ trades.
 *
 * Goals:
 *  - Quote line items can represent real contractor scope (Scope Library + apply flow).
 *  - Each line item carries default execution tasks (LineItemTemplateTask).
 *  - Tasks map onto per-org Stage rows via legacy keys.
 *
 * Idempotency:
 *  - Stable string ids (`dev-trade-<trade>-<slug>`) so repeated `prisma db seed`
 *    runs upsert in place without duplicating rows.
 */

import {
  LineItemTemplateTaskSource,
  Prisma,
  TaskTemplateCategory,
  type PrismaClient,
} from "@prisma/client";

type StageBucketId =
  | "preConstruction"
  | "permitting"
  | "mobilization"
  | "sitePrep"
  | "roughIn"
  | "inspection"
  | "finishes"
  | "walkthrough"
  | "closeout";

const BUCKET_TO_LEGACY_ID: Record<StageBucketId, number> = {
  preConstruction: 0,
  permitting: 1,
  mobilization: 2,
  sitePrep: 3,
  roughIn: 4,
  inspection: 5,
  finishes: 6,
  walkthrough: 7,
  closeout: 8,
};

const BUCKET_LABEL: Record<StageBucketId, string> = {
  preConstruction: "Pre-Construction",
  permitting: "Permitting",
  mobilization: "Mobilization",
  sitePrep: "Site Prep",
  roughIn: "Rough-In",
  inspection: "Inspection",
  finishes: "Finishes",
  walkthrough: "Walkthrough",
  closeout: "Closeout",
};

type TradeKey =
  | "electrical"
  | "plumbing"
  | "hvac"
  | "framing"
  | "roofing"
  | "drywall"
  | "painting"
  | "solar"
  | "windows"
  | "siding"
  | "landscaping"
  | "kitchenBath";

const TRADE_LABEL: Record<TradeKey, string> = {
  electrical: "Electrical",
  plumbing: "Plumbing",
  hvac: "HVAC",
  framing: "Framing",
  roofing: "Roofing",
  drywall: "Drywall",
  painting: "Painting",
  solar: "Solar & Storage",
  windows: "Windows & Doors",
  siding: "Siding & Exterior",
  landscaping: "Landscaping & Outdoor",
  kitchenBath: "Kitchen & Bath",
};

type SeedTask = {
  bucket: StageBucketId;
  category: TaskTemplateCategory;
  title: string;
  instructions: string | null;
  providesSignals?: string[];
  requiresSignals?: string[];
  hardSignal?: boolean;
};

type SeedLine = {
  slug: string;
  description: string;
  defaultQuantity: string;
  defaultUnitAmountCents: number;
  customerScopeTitle: string;
  customerScopeDescription: string;
  customerIncludedNotes: string | null;
  customerExcludedNotes: string | null;
  internalNotes: string;
  tasks: SeedTask[];
};

type TradeBlock = {
  trade: TradeKey;
  lines: SeedLine[];
};

const PRICE_DISCLAIMER =
  "Seed/demo pricing only; verify local labor, material, permit, and overhead.";

function notes(parts: {
  unitType:
    | "EACH"
    | "SQ_FT"
    | "LINEAR_FT"
    | "FIXTURE"
    | "OPENING"
    | "SYSTEM"
    | "ALLOWANCE"
    | "HOUR"
    | "ROOM"
    | "DOOR"
    | "SQUARE";
  unitTypeNote?: string;
  assumptions?: string;
  permittingNote?: string;
}): string {
  const lines: string[] = [
    "costBasis: DEMO_US_AVERAGE",
    `priceDisclaimer: ${PRICE_DISCLAIMER}`,
    `unitType: ${parts.unitType}${parts.unitTypeNote ? ` (${parts.unitTypeNote})` : ""}`,
  ];
  if (parts.assumptions) {
    lines.push(`assumptions: ${parts.assumptions}`);
  }
  if (parts.permittingNote) {
    lines.push(`permitting: ${parts.permittingNote}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Trade data
// ---------------------------------------------------------------------------

const ELECTRICAL: TradeBlock = {
  trade: "electrical",
  lines: [
    {
      slug: "service-panel-upgrade-200a",
      description: "[Hero] 200A Service Upgrade (Smart System)",
      defaultQuantity: "1",
      defaultUnitAmountCents: 485_000,
      customerScopeTitle: "200A Service Panel Upgrade",
      customerScopeDescription:
        "Complete replacement of existing electrical service with a new 200A main breaker load center, including new grounding system and utility coordination.",
      customerIncludedNotes:
        "Includes new 200A panel, all new branch breakers, grounding electrode system (rods/water bond), and labeling.",
      customerExcludedNotes:
        "Excludes utility fees, structural changes to meter location, and drywall patching.",
      internalNotes: notes({
        unitType: "SYSTEM",
        assumptions: "Existing service entrance cable is 200A rated; meter base is reusable.",
        permittingNote: "Permit and Utility disconnect/reconnect required.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Perform Load Calculation & Site Survey",
          instructions: "Document existing loads; verify service entrance wire gauge; photo meter base.",
          providesSignals: ["load-calc-complete"],
        },
        {
          bucket: "permitting",
          category: TaskTemplateCategory.PERMIT,
          title: "Submit Permit Application",
          instructions: "Attach load calc and single-line diagram.",
          requiresSignals: ["load-calc-complete"],
          providesSignals: ["permit-applied"],
        },
        {
          bucket: "permitting",
          category: TaskTemplateCategory.PERMIT,
          title: "Receive Approved Permit",
          instructions: "Upload permit PDF to job attachments.",
          requiresSignals: ["permit-applied"],
          providesSignals: ["permit-in-hand"],
        },
        {
          bucket: "mobilization",
          category: TaskTemplateCategory.MATERIAL,
          title: "Inventory Main Panel & Breakers",
          instructions: "Ensure all AFCI/GFCI breakers required by current code are staged.",
          providesSignals: ["materials-staged"],
        },
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.SCHEDULING,
          title: "Coordinate Utility Disconnect/Reconnect",
          instructions: "Call utility with permit number to schedule the 'cut and reconnect' window.",
          requiresSignals: ["permit-in-hand"],
          providesSignals: ["utility-scheduled"],
        },
        {
          bucket: "finishes",
          category: TaskTemplateCategory.GENERAL,
          title: "Main Panel Swap & Grounding",
          instructions: "Install new 200A bus; verify grounding electrode conductor (GEC) to water/gas/rod.",
          requiresSignals: ["utility-scheduled", "materials-staged"],
          providesSignals: ["panel-mounted"],
        },
        {
          bucket: "finishes",
          category: TaskTemplateCategory.GENERAL,
          title: "Re-terminate & Label Branch Circuits",
          instructions: "Land neutrals/grounds; torque to spec; label directory clearly.",
          requiresSignals: ["panel-mounted"],
          providesSignals: ["circuits-terminated"],
        },
        {
          bucket: "inspection",
          category: TaskTemplateCategory.INSPECTION,
          title: "Pass Rough/Final Electrical Inspection",
          instructions: "Meet inspector on site; ensure deadfront is off for inspection.",
          requiresSignals: ["circuits-terminated"],
          providesSignals: ["inspection-passed"],
        },
        {
          bucket: "closeout",
          category: TaskTemplateCategory.GENERAL,
          title: "Utility Meter Tag & Re-seal",
          instructions: "Confirm utility has re-sealed meter and restored power.",
          requiresSignals: ["inspection-passed"],
          providesSignals: ["power-restored"],
        },
        {
          bucket: "closeout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Final Completion Photos & Directory",
          instructions: "Photo of labeled directory and finished panel area.",
          requiresSignals: ["power-restored"],
        },
      ],
    },
    {
      slug: "recessed-lighting-circuit",
      description: "Recessed lighting — circuit + LED fixtures (per fixture)",
      defaultQuantity: "6",
      defaultUnitAmountCents: 18_500,
      customerScopeTitle: "Recessed LED lighting",
      customerScopeDescription: "Install new recessed LED downlights on a single switched circuit.",
      customerIncludedNotes: "Includes fixtures, cable, switch, and basic dimmer.",
      customerExcludedNotes: "Excludes ceiling repair and painting.",
      internalNotes: notes({ unitType: "FIXTURE" }),
      tasks: [
        { bucket: "preConstruction", category: TaskTemplateCategory.GENERAL, title: "Layout fixture spacing", instructions: "Mark ceiling with customer." },
        { bucket: "mobilization", category: TaskTemplateCategory.MATERIAL, title: "Order LED downlights", instructions: null },
        { bucket: "finishes", category: TaskTemplateCategory.GENERAL, title: "Cut openings and pull cable", instructions: null },
        { bucket: "finishes", category: TaskTemplateCategory.GENERAL, title: "Install fixtures and dimmer", instructions: null },
      ],
    },
    {
      slug: "kitchen-remodel-rough-in",
      description: "Kitchen remodel electrical rough-in",
      defaultQuantity: "1",
      defaultUnitAmountCents: 165_000,
      customerScopeTitle: "Kitchen electrical rough-in",
      customerScopeDescription: "Rough-in electrical for a typical kitchen remodel.",
      customerIncludedNotes: "Includes new circuits, boxes, and cable.",
      customerExcludedNotes: "Excludes finish devices and fixtures.",
      internalNotes: notes({ unitType: "SYSTEM", permittingNote: "Permit required." }),
      tasks: [
        { bucket: "preConstruction", category: TaskTemplateCategory.GENERAL, title: "Confirm appliance specs", instructions: null },
        { bucket: "permitting", category: TaskTemplateCategory.PERMIT, title: "Pull electrical permit", instructions: null },
        { bucket: "roughIn", category: TaskTemplateCategory.GENERAL, title: "Run cable and install boxes", instructions: null },
        { bucket: "inspection", category: TaskTemplateCategory.INSPECTION, title: "Pass rough-in inspection", instructions: null },
      ],
    },
  ],
};

const PLUMBING: TradeBlock = {
  trade: "plumbing",
  lines: [
    {
      slug: "water-heater-50gal-tank",
      description: "Replace 50-gal tank water heater",
      defaultQuantity: "1",
      defaultUnitAmountCents: 165_000,
      customerScopeTitle: "50-gal water heater replacement",
      customerScopeDescription: "Remove and dispose of existing unit and install new 50-gal tank.",
      customerIncludedNotes: "Includes new heater, flex connectors, and earthquake strapping.",
      customerExcludedNotes: "Excludes fuel-type conversion.",
      internalNotes: notes({ unitType: "EACH", permittingNote: "Permit required." }),
      tasks: [
        { bucket: "preConstruction", category: TaskTemplateCategory.GENERAL, title: "Confirm fuel type and access", instructions: null },
        { bucket: "permitting", category: TaskTemplateCategory.PERMIT, title: "Pull plumbing permit", instructions: null },
        { bucket: "mobilization", category: TaskTemplateCategory.MATERIAL, title: "Order water heater", instructions: null },
        { bucket: "finishes", category: TaskTemplateCategory.GENERAL, title: "Swap heater and connect", instructions: null },
        { bucket: "inspection", category: TaskTemplateCategory.INSPECTION, title: "Pass plumbing inspection", instructions: null },
      ],
    },
    {
      slug: "kitchen-sink-faucet-disposal",
      description: "Kitchen sink, faucet, and disposal connections",
      defaultQuantity: "1",
      defaultUnitAmountCents: 38_500,
      customerScopeTitle: "Kitchen sink trim-out",
      customerScopeDescription: "Connect customer-supplied kitchen sink, faucet, and garbage disposal.",
      customerIncludedNotes: "Includes new supply lines, P-trap, and dishwasher tie-in.",
      customerExcludedNotes: "Excludes fixtures (customer-supplied).",
      internalNotes: notes({ unitType: "FIXTURE" }),
      tasks: [
        { bucket: "mobilization", category: TaskTemplateCategory.MATERIAL, title: "Stage P-trap and supply lines", instructions: null },
        { bucket: "finishes", category: TaskTemplateCategory.GENERAL, title: "Set sink and install faucet", instructions: null },
        { bucket: "finishes", category: TaskTemplateCategory.GENERAL, title: "Connect disposal and leak test", instructions: null },
      ],
    },
  ],
};

const HVAC: TradeBlock = {
  trade: "hvac",
  lines: [
    {
      slug: "split-condenser-coil-3ton",
      description: "Replace 3-ton split-system AC",
      defaultQuantity: "1",
      defaultUnitAmountCents: 420_000,
      customerScopeTitle: "3-ton AC replacement",
      customerScopeDescription: "Replace outdoor condenser and indoor evaporator coil.",
      customerIncludedNotes: "Includes equipment, refrigerant, and startup.",
      customerExcludedNotes: "Excludes furnace replacement.",
      internalNotes: notes({ unitType: "SYSTEM", permittingNote: "Mechanical permit required." }),
      tasks: [
        { bucket: "permitting", category: TaskTemplateCategory.PERMIT, title: "Pull mechanical permit", instructions: null },
        { bucket: "mobilization", category: TaskTemplateCategory.MATERIAL, title: "Order equipment", instructions: null },
        { bucket: "finishes", category: TaskTemplateCategory.GENERAL, title: "Install condenser and coil", instructions: null },
        { bucket: "walkthrough", category: TaskTemplateCategory.GENERAL, title: "Start-up and commissioning", instructions: null },
        { bucket: "inspection", category: TaskTemplateCategory.INSPECTION, title: "Pass mechanical inspection", instructions: null },
      ],
    },
    {
      slug: "duct-run-modification",
      description: "Add or relocate one supply duct run",
      defaultQuantity: "1",
      defaultUnitAmountCents: 38_500,
      customerScopeTitle: "Duct run modification",
      customerScopeDescription: "Add or relocate one supply or return run from the existing trunk.",
      customerIncludedNotes: "Includes take-off, duct, boot, and register.",
      customerExcludedNotes: "Excludes structural framing changes.",
      internalNotes: notes({ unitType: "EACH" }),
      tasks: [
        { bucket: "mobilization", category: TaskTemplateCategory.MATERIAL, title: "Order duct and boot", instructions: null },
        { bucket: "finishes", category: TaskTemplateCategory.GENERAL, title: "Cut opening and run duct", instructions: null },
        { bucket: "finishes", category: TaskTemplateCategory.GENERAL, title: "Install register and balance", instructions: null },
      ],
    },
  ],
};

const ROOFING: TradeBlock = {
  trade: "roofing",
  lines: [
    {
      slug: "full-tearoff-reroof",
      description: "[Hero] Full Tear-off & Re-roof (Smart System)",
      defaultQuantity: "24",
      defaultUnitAmountCents: 56_500,
      customerScopeTitle: "Full Architectural Re-roof",
      customerScopeDescription: "Complete removal of existing roofing and installation of new architectural shingles.",
      customerIncludedNotes: "Includes tear-off, underlayment, ice & water shield, and shingles.",
      customerExcludedNotes: "Excludes gutter replacement.",
      internalNotes: notes({ unitType: "SQUARE", permittingNote: "Permit required." }),
      tasks: [
        { bucket: "preConstruction", category: TaskTemplateCategory.GENERAL, title: "Roof Inspection", instructions: null, providesSignals: ["roof-inspection-complete"] },
        { bucket: "permitting", category: TaskTemplateCategory.PERMIT, title: "Pull Roofing Permit", instructions: null, requiresSignals: ["roof-inspection-complete"], providesSignals: ["roof-permit-in-hand"] },
        { bucket: "mobilization", category: TaskTemplateCategory.MATERIAL, title: "Order Materials", instructions: null, requiresSignals: ["roof-permit-in-hand"], providesSignals: ["roof-materials-ready"] },
        { bucket: "sitePrep", category: TaskTemplateCategory.GENERAL, title: "Tear-off", instructions: null, requiresSignals: ["roof-materials-ready"], providesSignals: ["roof-torn-off"] },
        { bucket: "roughIn", category: TaskTemplateCategory.GENERAL, title: "Dry-in", instructions: null, requiresSignals: ["roof-torn-off"], providesSignals: ["roof-prepped"] },
        { bucket: "finishes", category: TaskTemplateCategory.GENERAL, title: "Install Shingles", instructions: null, requiresSignals: ["roof-prepped"], providesSignals: ["roof-shingled"] },
        { bucket: "inspection", category: TaskTemplateCategory.INSPECTION, title: "Pass Final Inspection", instructions: null, requiresSignals: ["roof-shingled"], providesSignals: ["roof-inspection-passed"] },
        { bucket: "closeout", category: TaskTemplateCategory.GENERAL, title: "Site Cleanup", instructions: null, requiresSignals: ["roof-inspection-passed"] },
      ],
    },
    {
      slug: "skylight-install-fixed",
      description: "Install fixed skylight (each)",
      defaultQuantity: "1",
      defaultUnitAmountCents: 125_000,
      customerScopeTitle: "Fixed skylight installation",
      customerScopeDescription: "Install one new fixed skylight, including roof penetration and flashing.",
      customerIncludedNotes: "Includes skylight unit and flashing kit.",
      customerExcludedNotes: "Excludes interior drywall and paint.",
      internalNotes: notes({ unitType: "EACH" }),
      tasks: [
        { bucket: "mobilization", category: TaskTemplateCategory.MATERIAL, title: "Order skylight and flashing", instructions: null },
        { bucket: "roughIn", category: TaskTemplateCategory.GENERAL, title: "Install skylight", instructions: "Requires roof-prepped signal.", requiresSignals: ["roof-prepped"], providesSignals: ["skylight-installed"] },
        { bucket: "roughIn", category: TaskTemplateCategory.GENERAL, title: "Frame light well", instructions: null, requiresSignals: ["skylight-installed"] },
      ],
    },
  ],
};

const SOLAR: TradeBlock = {
  trade: "solar",
  lines: [
    {
      slug: "solar-pv-6kw",
      description: "6kW Residential Solar System",
      defaultQuantity: "1",
      defaultUnitAmountCents: 1_850_000,
      customerScopeTitle: "6kW Solar PV System",
      customerScopeDescription: "Design and installation of a 6kW solar system with 15 panels.",
      customerIncludedNotes: "Includes panels, inverter, racking, and utility interconnection.",
      customerExcludedNotes: "Excludes roof repair.",
      internalNotes: notes({ unitType: "SYSTEM", permittingNote: "Solar permit required." }),
      tasks: [
        { bucket: "preConstruction", category: TaskTemplateCategory.GENERAL, title: "Solar Site Assessment", instructions: null },
        { bucket: "permitting", category: TaskTemplateCategory.PERMIT, title: "Submit Interconnection & Permit", instructions: null },
        { bucket: "mobilization", category: TaskTemplateCategory.MATERIAL, title: "Order Solar Package", instructions: null },
        { bucket: "finishes", category: TaskTemplateCategory.GENERAL, title: "Install Racking & Panels", instructions: "Requires roof-prepped signal if re-roofing.", requiresSignals: ["roof-prepped"] },
        { bucket: "finishes", category: TaskTemplateCategory.GENERAL, title: "Electrical Tie-in", instructions: "Requires power-ready signal if panel upgrade.", requiresSignals: ["power-restored"] },
        { bucket: "inspection", category: TaskTemplateCategory.INSPECTION, title: "Pass Solar Inspection", instructions: null },
      ],
    },
  ],
};

const WINDOWS: TradeBlock = {
  trade: "windows",
  lines: [
    {
      slug: "window-replace-retrofit",
      description: "Retrofit Window Replacement (each)",
      defaultQuantity: "10",
      defaultUnitAmountCents: 85_000,
      customerScopeTitle: "Replacement Windows",
      customerScopeDescription: "Remove existing sashes and install new vinyl retrofit windows.",
      customerIncludedNotes: "Includes windows, installation, and exterior caulking.",
      customerExcludedNotes: "Excludes interior trim painting.",
      internalNotes: notes({ unitType: "OPENING" }),
      tasks: [
        { bucket: "preConstruction", category: TaskTemplateCategory.GENERAL, title: "Final Field Measurements", instructions: null },
        { bucket: "mobilization", category: TaskTemplateCategory.MATERIAL, title: "Order Windows", instructions: "Lead time typically 4-6 weeks." },
        { bucket: "finishes", category: TaskTemplateCategory.GENERAL, title: "Install Windows", instructions: null },
        { bucket: "closeout", category: TaskTemplateCategory.PHOTO_EVIDENCE, title: "Completion Photos", instructions: null },
      ],
    },
  ],
};

const SIDING: TradeBlock = {
  trade: "siding",
  lines: [
    {
      slug: "hardie-plank-siding",
      description: "James Hardie Fiber Cement Siding (per sq ft)",
      defaultQuantity: "1500",
      defaultUnitAmountCents: 1_450,
      customerScopeTitle: "Fiber Cement Siding",
      customerScopeDescription: "Install new HardiePlank lap siding over synthetic house wrap.",
      customerIncludedNotes: "Includes siding, house wrap, and color-matched trim.",
      customerExcludedNotes: "Excludes lead abatement.",
      internalNotes: notes({ unitType: "SQ_FT" }),
      tasks: [
        { bucket: "sitePrep", category: TaskTemplateCategory.GENERAL, title: "Tear-off & Wall Inspection", instructions: null },
        { bucket: "roughIn", category: TaskTemplateCategory.GENERAL, title: "Install House Wrap & Flashing", instructions: null },
        { bucket: "finishes", category: TaskTemplateCategory.GENERAL, title: "Install Hardie Siding", instructions: null },
        { bucket: "closeout", category: TaskTemplateCategory.GENERAL, title: "Final Cleanup", instructions: null },
      ],
    },
  ],
};

const FRAMING: TradeBlock = {
  trade: "framing",
  lines: [
    {
      slug: "interior-wall-framing",
      description: "Interior Non-load-bearing Wall (per LF)",
      defaultQuantity: "20",
      defaultUnitAmountCents: 4_500,
      customerScopeTitle: "Interior Wall Framing",
      customerScopeDescription: "Frame new interior walls with 2x4 SPF studs.",
      customerIncludedNotes: "Includes lumber, fasteners, and layout.",
      customerExcludedNotes: "Excludes drywall.",
      internalNotes: notes({ unitType: "LINEAR_FT" }),
      tasks: [
        { bucket: "preConstruction", category: TaskTemplateCategory.GENERAL, title: "Layout Plates", instructions: null },
        { bucket: "roughIn", category: TaskTemplateCategory.GENERAL, title: "Frame Walls", instructions: null },
        { bucket: "roughIn", category: TaskTemplateCategory.GENERAL, title: "Fire Blocking", instructions: null },
      ],
    },
  ],
};

const DRYWALL: TradeBlock = {
  trade: "drywall",
  lines: [
    {
      slug: "hang-tape-finish-l4",
      description: "Drywall Hang & Finish - Level 4",
      defaultQuantity: "1000",
      defaultUnitAmountCents: 350,
      customerScopeTitle: "Drywall Installation",
      customerScopeDescription: "Hang and finish drywall to a smooth Level 4 finish.",
      customerIncludedNotes: "Includes 1/2\" drywall, tape, and mud.",
      customerExcludedNotes: "Excludes painting.",
      internalNotes: notes({ unitType: "SQ_FT" }),
      tasks: [
        { bucket: "roughIn", category: TaskTemplateCategory.GENERAL, title: "Hang Drywall", instructions: null },
        { bucket: "finishes", category: TaskTemplateCategory.GENERAL, title: "Tape & Mud (3 coats)", instructions: null },
        { bucket: "finishes", category: TaskTemplateCategory.GENERAL, title: "Sanding", instructions: null },
      ],
    },
  ],
};

const PAINTING: TradeBlock = {
  trade: "painting",
  lines: [
    {
      slug: "interior-repaint-2coat",
      description: "Interior Repaint - 2 Coats",
      defaultQuantity: "2000",
      defaultUnitAmountCents: 225,
      customerScopeTitle: "Interior Painting",
      customerScopeDescription: "Prep and paint interior walls with two coats of premium latex.",
      customerIncludedNotes: "Includes minor patching and paint.",
      customerExcludedNotes: "Excludes ceiling painting.",
      internalNotes: notes({ unitType: "SQ_FT" }),
      tasks: [
        { bucket: "sitePrep", category: TaskTemplateCategory.GENERAL, title: "Masking & Protection", instructions: null },
        { bucket: "finishes", category: TaskTemplateCategory.GENERAL, title: "Apply Finish Coats", instructions: null },
        { bucket: "walkthrough", category: TaskTemplateCategory.GENERAL, title: "Touch-ups", instructions: null },
      ],
    },
  ],
};

const LANDSCAPING: TradeBlock = {
  trade: "landscaping",
  lines: [
    {
      slug: "paver-patio-install",
      description: "Interlocking Paver Patio (per sq ft)",
      defaultQuantity: "300",
      defaultUnitAmountCents: 2_200,
      customerScopeTitle: "Paver Patio",
      customerScopeDescription: "Excavate and install a new paver patio with gravel base.",
      customerIncludedNotes: "Includes pavers, base rock, sand, and edge restraint.",
      customerExcludedNotes: "Excludes irrigation relocation.",
      internalNotes: notes({ unitType: "SQ_FT" }),
      tasks: [
        { bucket: "sitePrep", category: TaskTemplateCategory.GENERAL, title: "Excavation & Subgrade", instructions: null },
        { bucket: "roughIn", category: TaskTemplateCategory.GENERAL, title: "Base Rock & Compaction", instructions: null },
        { bucket: "finishes", category: TaskTemplateCategory.GENERAL, title: "Set Pavers & Poly Sand", instructions: null },
      ],
    },
  ],
};

const KITCHEN_BATH: TradeBlock = {
  trade: "kitchenBath",
  lines: [
    {
      slug: "cabinet-install-kitchen",
      description: "Kitchen Cabinet Installation (per cabinet)",
      defaultQuantity: "15",
      defaultUnitAmountCents: 12_500,
      customerScopeTitle: "Cabinet Installation",
      customerScopeDescription: "Install customer-supplied kitchen cabinets, plumb and level.",
      customerIncludedNotes: "Includes installation and hardware mounting.",
      customerExcludedNotes: "Excludes countertops.",
      internalNotes: notes({ unitType: "EACH" }),
      tasks: [
        { bucket: "preConstruction", category: TaskTemplateCategory.GENERAL, title: "Verify Cabinet Layout", instructions: null },
        { bucket: "finishes", category: TaskTemplateCategory.GENERAL, title: "Mount Upper Cabinets", instructions: null },
        { bucket: "finishes", category: TaskTemplateCategory.GENERAL, title: "Mount Base Cabinets", instructions: null },
        { bucket: "finishes", category: TaskTemplateCategory.GENERAL, title: "Install Trim & Fillers", instructions: null },
      ],
    },
  ],
};

const ALL_TRADE_BLOCKS: readonly TradeBlock[] = [
  ELECTRICAL,
  PLUMBING,
  HVAC,
  FRAMING,
  ROOFING,
  DRYWALL,
  PAINTING,
  SOLAR,
  WINDOWS,
  SIDING,
  LANDSCAPING,
  KITCHEN_BATH,
];

// ---------------------------------------------------------------------------
// Seed runner
// ---------------------------------------------------------------------------

function templateIdFor(trade: TradeKey, slug: string): string {
  return `dev-trade-${trade}-${slug}`;
}

export type SeedTradeLineItemPresetsResult = {
  tradesSeeded: number;
  lineItemsSeeded: number;
  tasksSeeded: number;
  /** Counts of tasks per locked stage container (using the five-bucket labels). */
  stageDistribution: Record<StageBucketId, number>;
};

/**
 * Idempotent upsert of all trade-contractor demo presets and their default
 * execution tasks for the given organization.
 */
export async function seedTradeLineItemPresets(
  prisma: PrismaClient,
  organizationId: string,
): Promise<SeedTradeLineItemPresetsResult> {
  const stageDistribution: Record<StageBucketId, number> = {
    preConstruction: 0,
    permitting: 0,
    mobilization: 0,
    sitePrep: 0,
    roughIn: 0,
    inspection: 0,
    finishes: 0,
    walkthrough: 0,
    closeout: 0,
  };

  let lineItemsSeeded = 0;
  let tasksSeeded = 0;

  for (const block of ALL_TRADE_BLOCKS) {
    const tradeLabel = TRADE_LABEL[block.trade];

    for (const line of block.lines) {
      const templateId = templateIdFor(block.trade, line.slug);

      await prisma.lineItemTemplateTask.deleteMany({
        where: { lineItemTemplateId: templateId },
      });

      await prisma.lineItemTemplate.upsert({
        where: { id: templateId },
        update: {
          organizationId,
          description: line.description,
          defaultQuantity: new Prisma.Decimal(line.defaultQuantity),
          defaultUnitAmountCents: line.defaultUnitAmountCents,
          defaultInternalNotes: line.internalNotes,
          defaultCustomerScopeTitle: line.customerScopeTitle,
          defaultCustomerScopeDescription: line.customerScopeDescription,
          defaultCustomerIncludedNotes: line.customerIncludedNotes,
          defaultCustomerExcludedNotes: line.customerExcludedNotes,
          defaultCustomerPresentationGroup: tradeLabel,
          archivedAt: null,
        },
        create: {
          id: templateId,
          organizationId,
          description: line.description,
          defaultQuantity: new Prisma.Decimal(line.defaultQuantity),
          defaultUnitAmountCents: line.defaultUnitAmountCents,
          defaultInternalNotes: line.internalNotes,
          defaultCustomerScopeTitle: line.customerScopeTitle,
          defaultCustomerScopeDescription: line.customerScopeDescription,
          defaultCustomerIncludedNotes: line.customerIncludedNotes,
          defaultCustomerExcludedNotes: line.customerExcludedNotes,
          defaultCustomerPresentationGroup: tradeLabel,
        },
      });

      const sortCursor: Partial<Record<StageBucketId, number>> = {};

      const taskRows = line.tasks.map((t) => {
        const sort = sortCursor[t.bucket] ?? 0;
        sortCursor[t.bucket] = sort + 1;
        stageDistribution[t.bucket] += 1;
        return {
          lineItemTemplateId: templateId,
          sourceType: LineItemTemplateTaskSource.CUSTOM,
          sourceTaskTemplateId: null,
          title: t.title,
          stageId: `legacy-${organizationId}-${BUCKET_TO_LEGACY_ID[t.bucket]}`,
          category: t.category,
          instructions: t.instructions,
          providesSignals: t.providesSignals || [],
          requiresSignals: t.requiresSignals || [],
          hardSignal: t.hardSignal || false,
          sortOrder: sort,
        };
      });

      if (taskRows.length > 0) {
        await prisma.lineItemTemplateTask.createMany({ data: taskRows });
      }

      lineItemsSeeded += 1;
      tasksSeeded += taskRows.length;
    }
  }

  return {
    tradesSeeded: ALL_TRADE_BLOCKS.length,
    lineItemsSeeded,
    tasksSeeded,
    stageDistribution,
  };
}

/** Friendly labels for the five locked stage containers (for log output). */
export const QUOTE_LINE_LOCKED_STAGE_LABELS: Readonly<Record<StageBucketId, string>> =
  BUCKET_LABEL;
