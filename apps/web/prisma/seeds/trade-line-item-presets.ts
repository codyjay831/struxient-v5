/**
 * Trade-contractor demo line-item presets.
 *
 * Seeds reusable [LineItemTemplate] rows (with default [LineItemTemplateTask] children)
 * that look like real residential / small-commercial contractor scope across seven trades.
 *
 * Goals:
 *  - Quote line items can represent real contractor scope (Scope Library + apply flow).
 *  - Each line item carries default execution tasks (LineItemTemplateTask).
 *  - Tasks map into the five locked stage containers via the existing
 *    quote-line-default-stage-catalog (Pre-Construction, Engineering & Permits,
 *    Materials, Installation, Final Inspection & Closeout).
 *
 * Pricing notes:
 *  - All prices are demo-safe approximations; not authoritative cost-book values.
 *  - Each row records `costBasis: DEMO_US_AVERAGE` + a price disclaimer in
 *    [LineItemTemplate.defaultInternalNotes] so the staff-facing intent is obvious.
 *
 * Schema notes:
 *  - There is no `trade` column. Trade is stored in
 *    [LineItemTemplate.defaultCustomerPresentationGroup] (used as the proposal
 *    grouping label) so applied lines naturally group by trade in the proposal.
 *  - There is no unit-type enum. Unit type is embedded in the staff-facing
 *    description ("(per fixture)", "(allowance)", etc.) and recorded as
 *    `unitType: <KEY>` in the internal notes for parseable demo intent.
 *  - "Permitted / inspected" is expressed by including PERMIT / INSPECTION
 *    category tasks under the line — there is no boolean column.
 *
 * Idempotency:
 *  - Stable string ids (`dev-trade-<trade>-<slug>`) so repeated `prisma db seed`
 *    runs upsert in place without duplicating rows.
 *  - Child tasks are deleteMany-then-createMany per template (mirrors the
 *    existing seed pattern in prisma/seed.ts for `dev-line-template-seed-with-execution`).
 */

import {
  ExecutionStageKey,
  LineItemTemplateTaskSource,
  Prisma,
  TaskTemplateCategory,
  type PrismaClient,
} from "@prisma/client";

type StageBucketId =
  | "preConstruction"
  | "engineeringPermits"
  | "materials"
  | "installation"
  | "finalInspectionCloseout";

const BUCKET_TO_STAGE_KEY: Record<StageBucketId, ExecutionStageKey> = {
  preConstruction: ExecutionStageKey.pre_install,
  engineeringPermits: ExecutionStageKey.permitting,
  materials: ExecutionStageKey.materials,
  installation: ExecutionStageKey.installation,
  finalInspectionCloseout: ExecutionStageKey.closeout,
};

const BUCKET_LABEL: Record<StageBucketId, string> = {
  preConstruction: "Pre-Construction",
  engineeringPermits: "Engineering & Permits",
  materials: "Materials",
  installation: "Installation",
  finalInspectionCloseout: "Final Inspection & Closeout",
};

type TradeKey =
  | "electrical"
  | "plumbing"
  | "hvac"
  | "framing"
  | "roofing"
  | "drywall"
  | "painting";

const TRADE_LABEL: Record<TradeKey, string> = {
  electrical: "Electrical",
  plumbing: "Plumbing",
  hvac: "HVAC",
  framing: "Framing",
  roofing: "Roofing",
  drywall: "Drywall",
  painting: "Painting",
};

type SeedTask = {
  bucket: StageBucketId;
  category: TaskTemplateCategory;
  title: string;
  instructions: string | null;
};

type SeedLine = {
  /** URL-safe slug, unique within trade. Used to build deterministic template ids. */
  slug: string;
  /** Staff-facing line description (also visible as the Scope Library row title). */
  description: string;
  /** Default qty, decimal string (Decimal column on the template row). */
  defaultQuantity: string;
  /** Default unit price in integer cents. */
  defaultUnitAmountCents: number;
  /** Customer-facing proposal title (kept short and readable). */
  customerScopeTitle: string;
  /** Customer-facing proposal description (one or two sentences). */
  customerScopeDescription: string;
  customerIncludedNotes: string | null;
  customerExcludedNotes: string | null;
  /** Staff-only internal notes; includes costBasis, priceDisclaimer, unitType, assumptions. */
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
      slug: "ev-charger-circuit-l2",
      description: "[dev trade seed] Install Level 2 EV charger circuit (per system)",
      defaultQuantity: "1",
      defaultUnitAmountCents: 185_000,
      customerScopeTitle: "Level 2 EV charger circuit",
      customerScopeDescription:
        "Install a dedicated 240V / 50A branch circuit from the main panel to the EV charger location, including breaker, cable or conduit, and weatherproof termination at the charger.",
      customerIncludedNotes:
        "Includes breaker, wire/conduit, mounting hardware, and basic startup with the customer-supplied charger.",
      customerExcludedNotes:
        "Excludes the charger unit, panel upgrades, trenching, finished wall patching, and any utility coordination.",
      internalNotes: notes({
        unitType: "SYSTEM",
        unitTypeNote: "1 = one charger circuit",
        assumptions:
          "Wire run ≤ 30 ft from panel; existing panel has spare 50A capacity; surface-mounted conduit acceptable.",
        permittingNote: "Permit assumed; jurisdiction may require load calc.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Confirm charger model, mounting location, and panel capacity",
          instructions:
            "Get charger spec sheet from customer; verify spare breaker space and 240V capacity in the existing panel; mark final mounting location with the customer.",
        },
        {
          bucket: "engineeringPermits",
          category: TaskTemplateCategory.PERMIT,
          title: "Pull electrical permit (if required by jurisdiction)",
          instructions:
            "Submit permit application with single-line / load summary; attach panel photos. Skip if jurisdiction allows like-for-like exempt work.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Order breaker, cable/conduit, and weatherproof fittings",
          instructions:
            "50A 2-pole breaker matched to panel make; #6 THHN or appropriate cable per run length; outdoor-rated junction box if exterior.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Run cable/conduit and install breaker",
          instructions:
            "Mount disconnect (if required); pull cable; land conductors at panel and at charger location.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Terminate at charger and energize",
          instructions:
            "Land conductors at charger; verify torque per spec; energize and confirm pilot light / app handshake with customer-supplied charger.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.INSPECTION,
          title: "Schedule and pass final electrical inspection",
          instructions: "Coordinate inspection window if a permit was pulled.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload completion photos and update panel schedule",
          instructions:
            "Photo of new breaker labeled in panel, photo of installed circuit at charger; update panel directory.",
        },
      ],
    },
    {
      slug: "service-panel-upgrade-200a",
      description: "[dev trade seed] Service panel replacement — 200A (per system)",
      defaultQuantity: "1",
      defaultUnitAmountCents: 385_000,
      customerScopeTitle: "200A service panel replacement",
      customerScopeDescription:
        "Replace existing main panel with a new 200A load center, transferring existing branch circuits to new breakers and labeling the panel directory.",
      customerIncludedNotes:
        "Includes new panel, breakers to match existing circuit count, ground/bond verification, and basic panel directory.",
      customerExcludedNotes:
        "Excludes service entrance cable replacement, meter base work, utility disconnect/reconnect coordination beyond standard scheduling, and drywall/finish patching.",
      internalNotes: notes({
        unitType: "SYSTEM",
        assumptions:
          "Existing service entrance and meter base reusable; ≤ 30 existing branch circuits; same panel location.",
        permittingNote:
          "Permit + utility coordination required; inspection always required.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Photo existing panel interior, deadfront, and service entrance",
          instructions:
            "Wide and tight shots; capture panel make/model, breaker count, and any obvious double-taps or defects.",
        },
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.CUSTOMER_COMMUNICATION,
          title: "Confirm power-down window with customer",
          instructions:
            "Coordinate a 4–8 hour outage window; remind customer of refrigerator / medical / network impacts.",
        },
        {
          bucket: "engineeringPermits",
          category: TaskTemplateCategory.PERMIT,
          title: "Pull electrical permit and request utility disconnect",
          instructions:
            "Submit panel-swap permit; schedule utility cut/reset if jurisdiction requires it.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Order panel, breakers, and grounding hardware",
          instructions:
            "Match existing breaker types where possible; include main breaker, ground/bond hardware, and any AFCI/GFCI replacements per current code.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "De-energize, swap panel, and re-terminate branch circuits",
          instructions:
            "Confirm dead with meter; transfer branch circuits one at a time; land neutrals on isolated bar; verify torque.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Energize and verify all circuits operational",
          instructions:
            "Walk the home with customer; verify lighting, outlets, HVAC, and major appliances.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.INSPECTION,
          title: "Pass final inspection and utility reconnect",
          instructions: "Coordinate AHJ inspection; confirm utility tag / sticker.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload final panel photos with directory complete",
          instructions: "Deadfront on, deadfront off, and full panel directory legible.",
        },
      ],
    },
    {
      slug: "recessed-lighting-circuit",
      description: "[dev trade seed] Recessed lighting — circuit + LED fixtures (per fixture)",
      defaultQuantity: "6",
      defaultUnitAmountCents: 18_500,
      customerScopeTitle: "Recessed LED lighting",
      customerScopeDescription:
        "Install new recessed LED downlights on a single switched circuit, including cutting openings, running cable, and trimming each fixture.",
      customerIncludedNotes:
        "Includes fixtures, cable, switch, and basic dimmer. Layout reviewed with customer before cutting.",
      customerExcludedNotes:
        "Excludes ceiling repair beyond clean circular cuts, painting, and structural relocation of joists/HVAC.",
      internalNotes: notes({
        unitType: "FIXTURE",
        unitTypeNote: "price is per recessed can; default qty 6",
        assumptions:
          "Accessible attic above; standard 2x dimmable LED retrofit cans; one switch / one circuit.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Lay out fixture spacing with customer and mark ceiling",
          instructions:
            "Use painter's tape or laser layout; confirm avoidance of joists, HVAC ducts, and existing fixtures.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Order LED downlights, dimmer, and cable",
          instructions:
            "Match color temperature to customer preference (2700K vs 3000K); compatible LED dimmer.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Cut openings and pull cable from switch",
          instructions:
            "Use hole-saw matching trim spec; pull cable through attic to switch box; protect insulation contact (IC) where required.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Install fixtures, switch, and dimmer",
          instructions:
            "Land fixtures, install dimmer, energize, and verify smooth dimming across full range.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload before/after photos",
          instructions: "Lights off and lights on with dimmer at 50% and 100%.",
        },
      ],
    },
    {
      slug: "exterior-gfci-receptacle",
      description: "[dev trade seed] Exterior GFCI / weatherproof receptacle (each)",
      defaultQuantity: "1",
      defaultUnitAmountCents: 24_500,
      customerScopeTitle: "Exterior GFCI receptacle",
      customerScopeDescription:
        "Install a code-compliant exterior GFCI receptacle with an in-use weatherproof cover, fed from the nearest interior circuit.",
      customerIncludedNotes:
        "Includes GFCI device, weatherproof in-use cover, and fishing one short interior cable run.",
      customerExcludedNotes:
        "Excludes exterior wall finish patching, painting, and long cable runs through finished walls.",
      internalNotes: notes({
        unitType: "EACH",
        assumptions:
          "Interior wall directly behind exterior location; ≤ 6 ft cable run; standard wood-frame siding.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Confirm exterior location and feed circuit",
          instructions:
            "Identify nearest interior outlet to extend; confirm exterior height per code (typ. ≥ 12 in).",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Order GFCI device and in-use weatherproof cover",
          instructions: "Bubble-style in-use cover; weather-resistant tamper-resistant GFCI.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Mount box, fish cable, and install device",
          instructions:
            "Cut exterior opening, mount weatherproof box, fish from interior outlet, and seal penetration.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.GENERAL,
          title: "Test GFCI trip and reset",
          instructions: "Verify trip with tester; verify reset; confirm load on protected side.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload installed photo with cover closed",
          instructions: "One photo cover open, one cover closed.",
        },
      ],
    },
    {
      slug: "kitchen-remodel-rough-in",
      description: "[dev trade seed] Kitchen remodel electrical rough-in (per system)",
      defaultQuantity: "1",
      defaultUnitAmountCents: 165_000,
      customerScopeTitle: "Kitchen electrical rough-in",
      customerScopeDescription:
        "Rough-in electrical for a typical kitchen remodel: small-appliance circuits, dishwasher, disposal, microwave, range receptacle, and under-cabinet lighting feed. Trim-out priced separately.",
      customerIncludedNotes:
        "Includes new circuits, boxes, and cable to all major appliance and counter locations per current code.",
      customerExcludedNotes:
        "Excludes finish/trim devices, fixtures, panel upgrades, and any required structural notching/blocking.",
      internalNotes: notes({
        unitType: "SYSTEM",
        assumptions:
          "Walls open / accessible; existing 200A panel with spare capacity; standard 10×12 kitchen footprint.",
        permittingNote:
          "Permit + rough-in inspection required before drywall close-up.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Confirm appliance specs and final layout with customer",
          instructions:
            "Get make/model for range, microwave, dishwasher, disposal, and under-cabinet lighting; confirm receptacle/switch heights with cabinet plan.",
        },
        {
          bucket: "engineeringPermits",
          category: TaskTemplateCategory.PERMIT,
          title: "Pull electrical permit and schedule rough-in inspection",
          instructions:
            "Submit permit; flag rough-in inspection requirement to GC so drywall is not closed early.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Stage cable, boxes, and breakers",
          instructions:
            "Two SABCs, dishwasher / disposal / microwave / range circuits, and any required AFCI breakers.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Run cable and install rough-in boxes",
          instructions:
            "Boxes set to drywall depth; cable secured per code; counter receptacles spaced per code.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Land circuits at panel and label temporarily",
          instructions: "Temporary labels (\"DW\", \"Disp\", \"Microwave\", \"Range\", \"SABC1/2\").",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.INSPECTION,
          title: "Pass rough-in inspection",
          instructions:
            "Coordinate with GC; confirm inspection sticker/photo before drywall is hung.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload rough-in photos for trim-out reference",
          instructions:
            "Wall-by-wall photos with tape measure visible — used by trim crew to locate boxes after drywall.",
        },
      ],
    },
    {
      slug: "dedicated-20a-circuit",
      description: "[dev trade seed] Add dedicated 20A appliance circuit (each)",
      defaultQuantity: "1",
      defaultUnitAmountCents: 38_500,
      customerScopeTitle: "Dedicated 20A circuit",
      customerScopeDescription:
        "Add a dedicated 20A circuit from the main panel to a single appliance location (e.g., freezer, sump pump, window AC, server rack).",
      customerIncludedNotes:
        "Includes breaker, cable run up to 30 ft, single receptacle, and labeled circuit at the panel.",
      customerExcludedNotes:
        "Excludes drywall/finish patching and panel upgrades if no spare capacity exists.",
      internalNotes: notes({
        unitType: "EACH",
        assumptions: "≤ 30 ft cable run; spare breaker space available.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Confirm load and final receptacle location",
          instructions: "Verify appliance amp draw and customer-preferred outlet location.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Order breaker, cable, and device",
          instructions: "20A breaker matched to panel; 12 AWG cable; spec-grade duplex.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Run cable, install device, and land at panel",
          instructions: "Label new breaker in panel directory.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.GENERAL,
          title: "Test under load and confirm with customer",
          instructions: "Plug in target appliance; verify operation under load.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload photo of installed outlet and panel label",
          instructions: null,
        },
      ],
    },
  ],
};

const PLUMBING: TradeBlock = {
  trade: "plumbing",
  lines: [
    {
      slug: "water-heater-50gal-tank",
      description: "[dev trade seed] Replace 50-gal tank water heater (each)",
      defaultQuantity: "1",
      defaultUnitAmountCents: 165_000,
      customerScopeTitle: "50-gal water heater replacement",
      customerScopeDescription:
        "Remove and dispose of the existing 50-gal water heater and install a new equivalent tank unit, including new flex connectors, T&P valve, drip pan (if required), and basic earthquake strapping.",
      customerIncludedNotes:
        "Includes new heater, flex connectors, sediment trap (gas), and code-required strapping. Honeywell or equivalent control.",
      customerExcludedNotes:
        "Excludes upsizing, fuel-type conversion, expansion tank if not currently present, and any drywall/finish patching.",
      internalNotes: notes({
        unitType: "EACH",
        assumptions:
          "Like-for-like swap (gas or electric); existing shutoffs operate; heater accessible; no venting changes.",
        permittingNote: "Permit + inspection required in many jurisdictions.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Confirm fuel type, tank size, and access",
          instructions:
            "Photo existing nameplate, vent type (atmospheric / power-vent), and clearance to walls.",
        },
        {
          bucket: "engineeringPermits",
          category: TaskTemplateCategory.PERMIT,
          title: "Pull plumbing permit if required",
          instructions: "Many jurisdictions require permit + inspection on water heater swaps.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Order water heater and install kit",
          instructions:
            "Heater, flex connectors, gas connector (if gas), T&P discharge pipe, strap kit, drip pan if applicable.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Drain and remove existing heater",
          instructions: "Shut off fuel/power and water; drain via hose; haul old unit.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Set new heater and connect water, fuel, and venting",
          instructions:
            "Set on pan if required; reconnect water; reconnect gas with sediment trap or wire electric; verify vent draft if atmospheric.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.GENERAL,
          title: "Pressure / leak test and verify hot water",
          instructions: "Bleed lines; verify temp at nearest fixture.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.INSPECTION,
          title: "Pass plumbing inspection (if permitted)",
          instructions: "Coordinate inspection window; leave install accessible.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload before/after photos and warranty registration info",
          instructions: null,
        },
      ],
    },
    {
      slug: "bathroom-rough-in-3fix",
      description: "[dev trade seed] 3-fixture bathroom plumbing rough-in (per system)",
      defaultQuantity: "1",
      defaultUnitAmountCents: 280_000,
      customerScopeTitle: "Bathroom plumbing rough-in",
      customerScopeDescription:
        "Rough-in supply and DWV for a standard 3-fixture bathroom (toilet, vanity, tub/shower), terminating at fixture stub-outs ready for tile and drywall close-up.",
      customerIncludedNotes:
        "Includes new supply lines, DWV stack tie-in, vent piping, and stub-outs. Pressure tested.",
      customerExcludedNotes:
        "Excludes fixtures, tile work, slab cutting beyond layout, and any required structural / floor framing changes.",
      internalNotes: notes({
        unitType: "SYSTEM",
        assumptions:
          "Floor and wall framing accessible; existing main stack within reasonable tie-in distance; PEX supply, ABS or PVC waste.",
        permittingNote: "Permit + rough-in inspection required.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Confirm fixture rough-in dimensions with customer/cabinet plan",
          instructions:
            "Verify toilet rough (12\" typ.), vanity supply heights, tub/shower valve height, and drain locations.",
        },
        {
          bucket: "engineeringPermits",
          category: TaskTemplateCategory.PERMIT,
          title: "Pull plumbing permit and schedule rough inspection",
          instructions: "Coordinate rough-in inspection before drywall close-up.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Stage PEX, fittings, DWV pipe, and vent boots",
          instructions:
            "Manifold strategy if applicable; verify trap arm length per code.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Run supply, drain, and vent lines",
          instructions:
            "Set drain heights and slopes; secure supply with talons / clips at proper spacing.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Pressure test supply lines and water test DWV",
          instructions:
            "Air pressure on supply per local code; fill & drain DWV to verify slope and joints.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.INSPECTION,
          title: "Pass rough-in inspection",
          instructions: "Hand off to GC for drywall after passed inspection.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload rough-in photos for trim-out reference",
          instructions:
            "Wall-by-wall photos showing stub-out locations before drywall.",
        },
      ],
    },
    {
      slug: "kitchen-sink-faucet-disposal",
      description: "[dev trade seed] Kitchen sink, faucet, and disposal connections (per fixture)",
      defaultQuantity: "1",
      defaultUnitAmountCents: 38_500,
      customerScopeTitle: "Kitchen sink trim-out",
      customerScopeDescription:
        "Connect customer-supplied kitchen sink, faucet, and garbage disposal to existing supply and drain stub-outs, including new supply lines, P-trap, and dishwasher tie-in.",
      customerIncludedNotes:
        "Includes new supply lines, P-trap, basket strainer, and dishwasher tail piece.",
      customerExcludedNotes:
        "Excludes fixtures themselves (customer-supplied), countertop cut-outs, and electrical for disposal.",
      internalNotes: notes({
        unitType: "FIXTURE",
        unitTypeNote: "1 = one kitchen sink set",
        assumptions:
          "Existing shutoffs operate; standard double-bowl or single-bowl sink with disposal on one side.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Verify sink, faucet, and disposal models on site",
          instructions:
            "Open boxes with customer present; confirm no missing/damaged parts before scheduling.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Stage P-trap, supply lines, and basket strainer",
          instructions: "Match supply line length to existing shutoff height.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Set sink, install faucet, and connect supply / drain",
          instructions:
            "Bed sink per countertop type; mount faucet; connect supplies and P-trap; install disposal and tie in dishwasher discharge.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Energize disposal and run leak test",
          instructions: "Confirm disposal direction; run water for 5+ minutes; check all joints.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload installed photo and confirm operation with customer",
          instructions: null,
        },
      ],
    },
    {
      slug: "toilet-replacement",
      description: "[dev trade seed] Toilet replacement (each)",
      defaultQuantity: "1",
      defaultUnitAmountCents: 29_500,
      customerScopeTitle: "Toilet replacement",
      customerScopeDescription:
        "Remove and dispose of the existing toilet and install a new customer-selected toilet, including new wax ring, supply line, and floor bolts.",
      customerIncludedNotes:
        "Includes new wax ring, supply line, bolts, and basic caulking. Old toilet hauled.",
      customerExcludedNotes:
        "Excludes flange repair, floor repair, and the toilet itself if customer-supplied.",
      internalNotes: notes({
        unitType: "EACH",
        assumptions: "Existing flange in good condition; standard 12\" rough.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Confirm rough dimension and toilet model",
          instructions: "Verify 10\"/12\"/14\" rough and confirm customer model on site.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Order/stage wax ring, supply, and bolts",
          instructions: null,
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Remove old toilet and inspect flange",
          instructions: "Note any flange damage or rocking; flag flange repair as a change order if needed.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Set new toilet and connect supply",
          instructions: "Set on wax ring; level and shim as needed; caulk per code.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.GENERAL,
          title: "Flush test and check for leaks",
          instructions: "Multiple flushes; check supply, base, and tank-to-bowl gasket.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload installed photo",
          instructions: null,
        },
      ],
    },
    {
      slug: "hose-bib-replacement",
      description: "[dev trade seed] Exterior hose bib replacement (each)",
      defaultQuantity: "1",
      defaultUnitAmountCents: 18_500,
      customerScopeTitle: "Exterior hose bib replacement",
      customerScopeDescription:
        "Replace one exterior hose bib (frost-free or standard) at the existing penetration, including soldered or pex connection.",
      customerIncludedNotes:
        "Includes new bib, fittings, and short pipe segment if needed for proper fit.",
      customerExcludedNotes:
        "Excludes opening interior walls, repairing failed shutoff valves, and any siding patch / paint.",
      internalNotes: notes({
        unitType: "EACH",
        assumptions:
          "Interior shutoff operates; existing penetration is reusable; copper or PEX behind the wall.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Locate interior shutoff and confirm pipe material",
          instructions: "Photo shutoff and visible pipe behind the wall before scheduling.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Pick frost-free vs standard bib and order",
          instructions: "Frost-free recommended in cold-climate jurisdictions.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Shut off, remove old bib, and install new",
          instructions:
            "Solder/PEX connection per pipe type; pitch frost-free unit downward toward exterior.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.GENERAL,
          title: "Restore water and leak check",
          instructions: "Run for 5+ minutes; check interior for any seepage at penetration.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload photo of new bib in service",
          instructions: null,
        },
      ],
    },
  ],
};

const HVAC: TradeBlock = {
  trade: "hvac",
  lines: [
    {
      slug: "split-condenser-coil-3ton",
      description: "[dev trade seed] Replace 3-ton split-system condenser + evaporator coil (per system)",
      defaultQuantity: "1",
      defaultUnitAmountCents: 420_000,
      customerScopeTitle: "3-ton AC condenser + coil replacement",
      customerScopeDescription:
        "Replace existing 3-ton outdoor condenser and matched indoor evaporator coil, including new line-set if existing is incompatible, refrigerant charge, and start-up.",
      customerIncludedNotes:
        "Includes condenser, matched coil, line-set adapters or new line-set as required, refrigerant, and basic disconnect replacement.",
      customerExcludedNotes:
        "Excludes furnace/air-handler replacement, duct modifications, electrical service upgrades, and any required pad / mounting changes beyond like-for-like.",
      internalNotes: notes({
        unitType: "SYSTEM",
        assumptions:
          "Existing electrical disconnect, pad, and 240V circuit reusable; like-for-like 3-ton swap; existing thermostat compatible.",
        permittingNote:
          "Most jurisdictions require mechanical permit + inspection on equipment swap.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Verify equipment match and electrical disconnect",
          instructions:
            "Confirm AHRI match for new condenser + coil; verify breaker/disconnect sizing.",
        },
        {
          bucket: "engineeringPermits",
          category: TaskTemplateCategory.PERMIT,
          title: "Pull mechanical permit",
          instructions: "Submit equipment cut sheets and AHRI match.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Order condenser, coil, and refrigerant",
          instructions: "Confirm delivery before scheduling install crew.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Recover refrigerant and remove old condenser/coil",
          instructions: "Recover per EPA; tag scrap appropriately.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Install new condenser, coil, and line-set",
          instructions:
            "Braze with nitrogen purge; set on existing pad or new pad as needed.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Pressure test, evacuate, and charge",
          instructions:
            "Hold pressure; pull deep vacuum; charge per nameplate; verify subcooling/superheat.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.GENERAL,
          title: "Start-up and verify temperature split",
          instructions:
            "Verify supply / return delta T and amp draw; document on commissioning sheet.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.INSPECTION,
          title: "Schedule mechanical inspection",
          instructions: "Coordinate AHJ inspection window.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Register equipment warranty and upload photos",
          instructions:
            "Manufacturer warranty registration must be completed within X days; photo of nameplate.",
        },
      ],
    },
    {
      slug: "mini-split-single-zone",
      description: "[dev trade seed] Single-zone ductless mini-split (per system)",
      defaultQuantity: "1",
      defaultUnitAmountCents: 310_000,
      customerScopeTitle: "Single-zone ductless mini-split",
      customerScopeDescription:
        "Install one outdoor condenser and one wall-mounted indoor head, including line-set, condensate routing, and dedicated electrical disconnect.",
      customerIncludedNotes:
        "Includes outdoor unit, indoor head, line-set up to 25 ft, wall sleeve, and condensate routing to a safe termination.",
      customerExcludedNotes:
        "Excludes new electrical circuit if not present (priced separately by electrical), and decorative line-set covers beyond standard.",
      internalNotes: notes({
        unitType: "SYSTEM",
        assumptions:
          "240V circuit available within reach of condenser; ≤ 25 ft line-set; standard 9k–12k BTU system.",
        permittingNote: "Mechanical + (often) electrical permits required.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Confirm head location, condenser pad, and line-set route",
          instructions:
            "Walk site with customer; mark indoor head location and exterior penetration point.",
        },
        {
          bucket: "engineeringPermits",
          category: TaskTemplateCategory.PERMIT,
          title: "Pull mechanical permit",
          instructions: "Coordinate with electrical permit if a new circuit is required.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Order mini-split kit and accessories",
          instructions: "Wall sleeve, line-set, line-set cover kit, condensate pump if needed.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Mount indoor head, set outdoor unit, and run line-set",
          instructions:
            "Bracket head plumb and level; secure outdoor unit to pad; route line-set with cover.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Pressure test, vacuum, and release factory charge",
          instructions: "Hold pressure overnight if possible; deep vacuum; release charge.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.GENERAL,
          title: "Start-up, condensate test, and customer demo",
          instructions:
            "Confirm cool/heat modes, condensate flow, and walk customer through remote.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Photo install and register warranty",
          instructions: null,
        },
      ],
    },
    {
      slug: "duct-run-modification",
      description: "[dev trade seed] Add or relocate one supply duct run (each)",
      defaultQuantity: "1",
      defaultUnitAmountCents: 38_500,
      customerScopeTitle: "Duct run modification",
      customerScopeDescription:
        "Add or relocate one supply or return run from the existing trunk to a new register/grille location, including new flex or rigid duct, take-off, and boot.",
      customerIncludedNotes:
        "Includes take-off, duct, boot, register/grille, and basic balancing damper.",
      customerExcludedNotes:
        "Excludes structural framing changes, drywall/finish patching, and any blower or system rebalance beyond a single run.",
      internalNotes: notes({
        unitType: "EACH",
        unitTypeNote: "1 = one run",
        assumptions:
          "Accessible attic or crawlspace; existing trunk has spare capacity.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Confirm new register location and trunk tie-in point",
          instructions: "Avoid joists/structure; measure for register sizing.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Order duct, take-off, boot, and register",
          instructions: null,
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Cut new opening and run duct",
          instructions: "Seal joints with mastic; suspend duct per spec.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Install register/grille and balance",
          instructions: "Set damper for target airflow; verify customer comfort.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload before/after photos at attic/crawl access",
          instructions: null,
        },
      ],
    },
    {
      slug: "smart-thermostat-install",
      description: "[dev trade seed] Smart thermostat install (each)",
      defaultQuantity: "1",
      defaultUnitAmountCents: 24_500,
      customerScopeTitle: "Smart thermostat install",
      customerScopeDescription:
        "Replace existing thermostat with a customer-supplied smart thermostat, including C-wire add-on (if needed) and basic Wi-Fi setup.",
      customerIncludedNotes:
        "Includes mounting, wiring, basic Wi-Fi pairing, and walkthrough of primary functions.",
      customerExcludedNotes:
        "Excludes the thermostat itself if customer-supplied, and any HVAC control board changes.",
      internalNotes: notes({
        unitType: "EACH",
        assumptions: "Compatible system; ≤ 1 hr install incl. C-wire adapter if needed.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Verify HVAC control wiring and C-wire availability",
          instructions: "Photo existing thermostat wires before pulling.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Bring C-wire adapter and labels",
          instructions: null,
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Install thermostat and configure",
          instructions: "Set system type; pair to customer Wi-Fi.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.CUSTOMER_COMMUNICATION,
          title: "Walk customer through scheduling and app",
          instructions: "Set basic schedule; confirm app connectivity.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload installed photo and note model/serial",
          instructions: null,
        },
      ],
    },
    {
      slug: "hvac-service-allowance",
      description: "[dev trade seed] HVAC service / diagnostic allowance (allowance)",
      defaultQuantity: "1",
      defaultUnitAmountCents: 25_000,
      customerScopeTitle: "HVAC service & diagnostic",
      customerScopeDescription:
        "Diagnostic visit and minor repair allowance for a single HVAC system. Includes filter check, basic refrigerant top-off (≤ 1 lb if needed), and one minor repair.",
      customerIncludedNotes:
        "Includes diagnostic, basic cleaning, and ≤ 1 hour of minor repair labor under this allowance.",
      customerExcludedNotes:
        "Excludes major component replacement (compressor, blower motor, control board), refrigerant > 1 lb, and any duct work.",
      internalNotes: notes({
        unitType: "ALLOWANCE",
        assumptions:
          "Allowance line; if scope grows beyond allowance, issue change order before proceeding.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Capture customer-reported symptoms",
          instructions:
            "Get specifics: noise / no-cool / short cycle / freeze-up / dates of onset.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Run diagnostic and document findings",
          instructions:
            "Check static pressure, temp split, refrigerant pressures, and safeties.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Perform minor repair within allowance OR generate change order",
          instructions:
            "If allowance fits the fix, proceed. Otherwise pause and write change order with line items.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.CUSTOMER_COMMUNICATION,
          title: "Review findings with customer",
          instructions: "Recommend follow-up scope if any items deferred.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload diagnostic photos and readings",
          instructions: null,
        },
      ],
    },
  ],
};

const FRAMING: TradeBlock = {
  trade: "framing",
  lines: [
    {
      slug: "interior-non-loadbearing-wall",
      description: "[dev trade seed] Frame non-load-bearing interior wall (per linear ft)",
      defaultQuantity: "12",
      defaultUnitAmountCents: 4_200,
      customerScopeTitle: "Non-load-bearing interior wall",
      customerScopeDescription:
        "Frame a new non-load-bearing interior wall with 2x4 plates and studs at 16\" o.c., including top/bottom plates and standard layout. Drywall and finishes priced separately.",
      customerIncludedNotes:
        "Includes plates, studs, fire blocking where required, and standard layout for outlets/switches per electrician markup.",
      customerExcludedNotes:
        "Excludes drywall, doors/openings (priced separately), MEP rough-in, and any structural review.",
      internalNotes: notes({
        unitType: "LINEAR_FT",
        unitTypeNote: "default qty 12 LF",
        assumptions:
          "Confirmed non-load-bearing; level subfloor; standard 8 ft ceiling.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Confirm wall location, length, and door/opening intent",
          instructions:
            "Mark final layout on subfloor with customer; confirm door swing direction if applicable.",
        },
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Verify wall is non-load-bearing",
          instructions:
            "Check above for joist run / bearing; if any doubt, escalate to structural review before framing.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Stage lumber and fasteners",
          instructions: "Plates, studs at 16\" o.c., powder/screw fasteners as appropriate.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Layout plates and frame wall",
          instructions: "Snap chalk line; cut plates; lay out studs; stand wall and tie in.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Verify plumb / level / square and add blocking",
          instructions: "Add blocking for future fixtures and grab bars if requested.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload framed wall photos for next-trade reference",
          instructions: null,
        },
      ],
    },
    {
      slug: "frame-door-opening",
      description: "[dev trade seed] Frame opening for new interior door (each)",
      defaultQuantity: "1",
      defaultUnitAmountCents: 38_500,
      customerScopeTitle: "New interior door rough opening",
      customerScopeDescription:
        "Frame a rough opening for a new interior door in an existing non-load-bearing wall, including header, king/jack studs, and cripples as needed.",
      customerIncludedNotes:
        "Includes RO sized to customer-provided door spec; rough opening only — door, jamb, and trim priced separately.",
      customerExcludedNotes:
        "Excludes drywall patching, MEP relocation if existing wires/pipes are in the way, and any structural review for load-bearing walls.",
      internalNotes: notes({
        unitType: "OPENING",
        unitTypeNote: "1 = one rough opening",
        assumptions:
          "Non-load-bearing wall; standard 30\"–36\" door; no MEP in wall section being cut.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Confirm door size, swing, and final RO dimensions",
          instructions:
            "Confirm customer's door make/model spec sheet; mark RO with king/jack stud locations.",
        },
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Scan for hidden MEP in wall section",
          instructions: "Look for outlets, switches, plumbing access; relocate as needed.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Stage lumber for header, king, jack, and cripples",
          instructions: null,
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Cut wall section and frame opening",
          instructions: "Cut studs, install header, set king/jack/cripples; verify level/plumb.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload framed RO photo with measurements visible",
          instructions: "Tape measure visible across rough opening width and height.",
        },
      ],
    },
    {
      slug: "soffit-or-chase",
      description: "[dev trade seed] Build soffit or chase framing (per linear ft)",
      defaultQuantity: "8",
      defaultUnitAmountCents: 5_800,
      customerScopeTitle: "Soffit or chase framing",
      customerScopeDescription:
        "Frame a soffit or vertical chase to enclose existing duct, plumbing, or electrical, ready for drywall.",
      customerIncludedNotes:
        "Includes soffit/chase framing only; access panels per customer request.",
      customerExcludedNotes: "Excludes drywall, paint, and any MEP relocation.",
      internalNotes: notes({
        unitType: "LINEAR_FT",
        unitTypeNote: "default qty 8 LF",
        assumptions:
          "Standard 12\"–16\" soffit depth; access to attic/ceiling for fastening.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Confirm soffit dimensions and access panel needs",
          instructions: "Mark layout on ceiling/wall; confirm access panel locations.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Stage lumber and fasteners",
          instructions: null,
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Frame soffit or chase",
          instructions: "Tie into existing structure; verify level/plumb; box around obstructions.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Install blocking for access panels",
          instructions: null,
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload framing photo before drywall",
          instructions: null,
        },
      ],
    },
    {
      slug: "wall-framing-repair",
      description: "[dev trade seed] Repair damaged wall framing (allowance)",
      defaultQuantity: "1",
      defaultUnitAmountCents: 32_500,
      customerScopeTitle: "Wall framing repair",
      customerScopeDescription:
        "Repair damaged wall framing (rot, termite, water, impact) within a single wall section, sistering or replacing studs/plates as required.",
      customerIncludedNotes:
        "Includes labor and lumber for repair within the allowance; one wall section.",
      customerExcludedNotes:
        "Excludes drywall, paint, finish flooring, MEP work, and structural engineering review.",
      internalNotes: notes({
        unitType: "ALLOWANCE",
        assumptions:
          "Single wall section; ≤ 4 stud bays; if scope grows, issue change order.",
        permittingNote:
          "If structural review is required, escalate before proceeding.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Photo damaged framing in place before demo",
          instructions: "Capture extent of rot/damage; flag any structural concerns.",
        },
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Decide sister vs replace",
          instructions: "Sister where adjacent framing is sound; replace where damage is severe.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Stage lumber and fasteners",
          instructions: null,
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Demo damaged framing and install repair",
          instructions:
            "Cut out damaged sections; sister or replace; verify wall remains plumb.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload before/after photos",
          instructions: null,
        },
      ],
    },
    {
      slug: "small-deck-or-landing",
      description: "[dev trade seed] Small deck / landing framing (per sq ft)",
      defaultQuantity: "32",
      defaultUnitAmountCents: 1_800,
      customerScopeTitle: "Small deck / landing framing",
      customerScopeDescription:
        "Frame a small deck or exterior landing using pressure-treated lumber, including footings, posts, beams, joists, and ledger as required. Decking and railings priced separately.",
      customerIncludedNotes:
        "Includes pressure-treated framing, joist hangers, ledger flashing, and standard hardware.",
      customerExcludedNotes:
        "Excludes decking, railings, stairs beyond a single landing step, and any required permit fees beyond standard.",
      internalNotes: notes({
        unitType: "SQ_FT",
        unitTypeNote: "default qty 32 sq ft",
        assumptions:
          "≤ 30\" above grade (no rail required in many jurisdictions); soil bearing acceptable for standard footings.",
        permittingNote:
          "Permit may be required even for small decks depending on jurisdiction and height.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Confirm dimensions, height, and ledger location",
          instructions: "Mark footings; confirm ledger attachment to existing structure.",
        },
        {
          bucket: "engineeringPermits",
          category: TaskTemplateCategory.PERMIT,
          title: "Pull building permit if required",
          instructions:
            "Check height/area thresholds; submit framing plan if required by AHJ.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Stage PT lumber, hangers, and concrete",
          instructions: null,
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Set footings and posts",
          instructions: "Plumb and tie posts to footings per code.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Install ledger, beams, and joists",
          instructions:
            "Flash ledger; install joists at proper spacing; verify level / square.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.INSPECTION,
          title: "Pass framing inspection (if permitted)",
          instructions: null,
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload framing photos",
          instructions: null,
        },
      ],
    },
  ],
};

const ROOFING: TradeBlock = {
  trade: "roofing",
  lines: [
    {
      slug: "shingle-section-replace",
      description: "[dev trade seed] Replace asphalt shingle roof section (per square)",
      defaultQuantity: "4",
      defaultUnitAmountCents: 38_500,
      customerScopeTitle: "Asphalt shingle section replacement",
      customerScopeDescription:
        "Tear off and replace a defined asphalt shingle roof section, including new underlayment, starter, ridge, and matched architectural shingles.",
      customerIncludedNotes:
        "Includes tear-off of existing layer, synthetic underlayment, starter strip, ridge, and architectural shingles. Color matched as closely as possible.",
      customerExcludedNotes:
        "Excludes deck replacement beyond a small allowance, full-roof tear-off, gutter work, and any chimney / skylight rebuild.",
      internalNotes: notes({
        unitType: "SQUARE",
        unitTypeNote: "1 square = 100 sq ft; default qty 4 squares",
        assumptions:
          "Single layer existing; deck in serviceable condition; safe ground access; standard 6/12 pitch.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Inspect roof, confirm safe access, and review weather window",
          instructions:
            "Walk roof if safe; document deck condition; confirm no rain forecast for install window.",
        },
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.CUSTOMER_COMMUNICATION,
          title: "Confirm shingle color and edge details with customer",
          instructions: "Show physical sample; confirm drip edge color too.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Order shingles, underlayment, ridge, and flashing",
          instructions: null,
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Set ground protection and tear off existing section",
          instructions: "Protect plants and AC unit; haul tear-off debris.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Install underlayment, starter, shingles, and ridge",
          instructions: "Pattern shingles to existing if blending into adjacent section.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.GENERAL,
          title: "Magnetic sweep and final cleanup",
          instructions: "Sweep yard / driveway for nails; dispose of debris properly.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload before/after roof photos",
          instructions: null,
        },
      ],
    },
    {
      slug: "leak-flashing-repair",
      description: "[dev trade seed] Roof leak / flashing repair (allowance)",
      defaultQuantity: "1",
      defaultUnitAmountCents: 47_500,
      customerScopeTitle: "Roof leak / flashing repair",
      customerScopeDescription:
        "Investigate reported leak and perform targeted repair (flashing reset, sealant, replacement of failed shingles, or pipe boot replacement).",
      customerIncludedNotes:
        "Includes diagnostic, materials, and labor for one isolated leak repair under this allowance.",
      customerExcludedNotes:
        "Excludes interior drywall / ceiling repair and full-roof replacement.",
      internalNotes: notes({
        unitType: "ALLOWANCE",
        assumptions:
          "Single leak area; safe access; if leak source is multi-point, issue change order.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Diagnose leak source from interior + exterior",
          instructions:
            "Photo interior staining; locate likely entry point on roof; document.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Bring flashing, sealant, shingle bundle, and pipe boots",
          instructions: null,
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Perform repair within allowance OR generate change order",
          instructions:
            "If single-point fix fits allowance, proceed. Otherwise pause and write change order.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.GENERAL,
          title: "Water test repaired area",
          instructions: "Hose-test repaired area when safe; confirm no recurrence.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload before/after photos with leak source noted",
          instructions: null,
        },
      ],
    },
    {
      slug: "roof-vent-or-pipe-boot",
      description: "[dev trade seed] Roof vent or pipe boot install (each)",
      defaultQuantity: "1",
      defaultUnitAmountCents: 18_500,
      customerScopeTitle: "Roof vent / pipe boot",
      customerScopeDescription:
        "Install or replace a roof vent or pipe boot at an existing penetration, including underlayment touch-up and new flashing.",
      customerIncludedNotes:
        "Includes vent or boot, flashing, sealant, and shingle integration.",
      customerExcludedNotes:
        "Excludes new attic ventilation engineering and any structural changes.",
      internalNotes: notes({
        unitType: "EACH",
        assumptions: "Existing penetration reusable; safe roof access.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Confirm vent / boot type and exact location",
          instructions: null,
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Stage vent / boot, flashing, and sealant",
          instructions: null,
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Remove existing component and install new with proper flashing",
          instructions: "Lap shingles correctly; seal as needed; avoid relying on sealant alone.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload installed photo from above and below",
          instructions: null,
        },
      ],
    },
    {
      slug: "fascia-drip-edge-replace",
      description: "[dev trade seed] Fascia / drip edge replacement (per linear ft)",
      defaultQuantity: "22",
      defaultUnitAmountCents: 1_400,
      customerScopeTitle: "Fascia / drip edge replacement",
      customerScopeDescription:
        "Remove and replace damaged fascia and / or drip edge along a defined run, including any required shingle lift and underlayment touch-up.",
      customerIncludedNotes:
        "Includes fascia board, drip edge, and basic shingle / underlayment touch-up at the edge.",
      customerExcludedNotes:
        "Excludes paint of new fascia (priced separately by painting), gutter work, and structural sub-fascia replacement.",
      internalNotes: notes({
        unitType: "LINEAR_FT",
        unitTypeNote: "default qty 22 LF",
        assumptions: "Sub-fascia sound; gutters can be safely lifted off and reset.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Inspect fascia and confirm scope length",
          instructions: "Probe sub-fascia for rot; flag any sub-fascia replacement.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Order fascia board, drip edge, and fasteners",
          instructions: null,
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Lift gutters / shingles, replace fascia and drip edge",
          instructions: "Reset gutters; lap shingles back onto new drip edge correctly.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload before/after photos along the run",
          instructions: null,
        },
      ],
    },
    {
      slug: "full-tearoff-reroof",
      description: "[dev trade seed] Full tear-off and re-roof (per square)",
      defaultQuantity: "24",
      defaultUnitAmountCents: 56_500,
      customerScopeTitle: "Full asphalt re-roof",
      customerScopeDescription:
        "Full tear-off of existing roof and installation of new architectural asphalt shingles, including underlayment, starter, ridge, valleys, and standard flashings.",
      customerIncludedNotes:
        "Includes tear-off, synthetic underlayment, ice & water shield at eaves/valleys per code, drip edge, ridge vent if applicable, and architectural shingles with manufacturer warranty.",
      customerExcludedNotes:
        "Excludes deck replacement beyond a small per-sheet allowance, chimney rebuild, gutter replacement, and skylight replacement.",
      internalNotes: notes({
        unitType: "SQUARE",
        unitTypeNote: "1 square = 100 sq ft; default qty 24 squares",
        assumptions:
          "Single layer existing; standard pitch (≤ 8/12); deck OSB or plywood in serviceable condition.",
        permittingNote: "Permit + final inspection typically required.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Roof inspection and customer color/material confirmation",
          instructions:
            "Confirm shingle line, color, ridge style; review deck and any obvious defects.",
        },
        {
          bucket: "engineeringPermits",
          category: TaskTemplateCategory.PERMIT,
          title: "Pull roofing permit",
          instructions: null,
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Order full materials package and dumpster",
          instructions:
            "Shingles, underlayment, ice & water, drip edge, ridge cap, vents, dumpster, and pallet placement plan.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Site protection and tear-off",
          instructions:
            "Tarp landscape; protect AC unit and vents; tear off to deck.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Deck repair allowance and dry-in",
          instructions:
            "Replace damaged sheathing per allowance; install ice & water and underlayment same day to avoid weather exposure.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Install shingles, flashings, and ridge",
          instructions: "Per manufacturer warranty requirements.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.GENERAL,
          title: "Magnetic sweep, dumpster removal, and walkthrough",
          instructions: null,
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.INSPECTION,
          title: "Schedule and pass final roofing inspection",
          instructions: null,
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload final roof photos and warranty registration confirmation",
          instructions: null,
        },
      ],
    },
  ],
};

const DRYWALL: TradeBlock = {
  trade: "drywall",
  lines: [
    {
      slug: "hang-and-finish",
      description: "[dev trade seed] Hang and finish drywall — Level 4 (per sq ft)",
      defaultQuantity: "480",
      defaultUnitAmountCents: 325,
      customerScopeTitle: "Hang and finish drywall",
      customerScopeDescription:
        "Hang 1/2\" drywall and tape, mud, and finish to Level 4, ready for primer and paint.",
      customerIncludedNotes:
        "Includes 1/2\" drywall, tape, mud, corner bead, and Level 4 finish on walls and ceilings within scope.",
      customerExcludedNotes:
        "Excludes prime/paint, texture beyond Level 4, and any wall framing.",
      internalNotes: notes({
        unitType: "SQ_FT",
        unitTypeNote: "default qty 480 sq ft",
        assumptions:
          "Standard 8 ft ceilings; minimal cuts/openings; no abatement.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Confirm scope, finish level, and any moisture-resistant areas",
          instructions: "Walk site; mark wet areas requiring greenboard / cement board.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Order drywall, mud, tape, and corner bead",
          instructions: null,
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Hang drywall",
          instructions: "Stagger seams; secure per code; back-block as needed.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Tape, mud, and finish to Level 4",
          instructions: "Three-coat finish; sand between coats; verify smooth finish.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.GENERAL,
          title: "Final inspection with raking light",
          instructions: "Use raking light to catch defects before primer.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload finished photos prior to paint",
          instructions: null,
        },
      ],
    },
    {
      slug: "patch-repair-allowance",
      description: "[dev trade seed] Drywall patch repair (allowance, ≤ 4 sq ft)",
      defaultQuantity: "1",
      defaultUnitAmountCents: 18_500,
      customerScopeTitle: "Drywall patch repair",
      customerScopeDescription:
        "Patch and finish drywall damage up to 4 sq ft total area, including any associated tape, mud, and Level 4 finish.",
      customerIncludedNotes:
        "Includes patching, finishing, and basic blending. Multiple small holes within total area allowance.",
      customerExcludedNotes:
        "Excludes painting and texture matching beyond a smooth-wall blend.",
      internalNotes: notes({
        unitType: "ALLOWANCE",
        unitTypeNote: "≤ 4 sq ft cumulative",
        assumptions: "Standard 1/2\" drywall; no plumbing/electrical entanglements.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Photograph damage and confirm allowance fits",
          instructions: "If beyond allowance, write change order before starting.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Bring patch material, tape, and joint compound",
          instructions: null,
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Cut, patch, and finish",
          instructions: "Three-coat blend; allow proper dry between coats.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload before/after photos",
          instructions: null,
        },
      ],
    },
    {
      slug: "texture-match",
      description: "[dev trade seed] Texture matching (per patch area)",
      defaultQuantity: "1",
      defaultUnitAmountCents: 14_500,
      customerScopeTitle: "Texture matching",
      customerScopeDescription:
        "Match existing wall or ceiling texture (knockdown, orange peel, smooth) on a single repaired area.",
      customerIncludedNotes:
        "Includes texture matching on one localized patch area; primer-ready.",
      customerExcludedNotes:
        "Excludes whole-wall re-texture and any paint.",
      internalNotes: notes({
        unitType: "EACH",
        unitTypeNote: "1 = one patch area",
        assumptions: "Existing texture is identifiable and reproducible.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Photo and identify existing texture style",
          instructions: "Confirm: smooth, orange peel, knockdown, or specialty.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Bring matching texture material",
          instructions: null,
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Apply and feather texture",
          instructions: "Match existing pattern; feather edges to blend.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload after photo with raking light if possible",
          instructions: null,
        },
      ],
    },
    {
      slug: "skim-coat-ceiling",
      description: "[dev trade seed] Skim-coat ceiling for smooth finish (per sq ft)",
      defaultQuantity: "240",
      defaultUnitAmountCents: 475,
      customerScopeTitle: "Smooth-coat ceiling",
      customerScopeDescription:
        "Skim coat existing textured (e.g., popcorn) ceiling to a smooth finish ready for primer and paint. Popcorn removal scoped separately if required.",
      customerIncludedNotes:
        "Includes two skim coats and Level 5 finish ready for primer.",
      customerExcludedNotes:
        "Excludes popcorn removal, asbestos testing/abatement (required if home pre-1980), and paint.",
      internalNotes: notes({
        unitType: "SQ_FT",
        unitTypeNote: "default qty 240 sq ft",
        assumptions:
          "Texture removal already complete; ceiling structurally sound.",
        permittingNote:
          "If pre-1980 home and any popcorn remains, asbestos testing should be scoped first.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Verify popcorn removal complete and ceiling sound",
          instructions:
            "Skim coat is not a substitute for damaged ceiling repair; flag any sagging.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Stage skim-coat compound and primer",
          instructions: null,
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Apply two skim coats with sanding",
          instructions: "Allow dry between coats; sand to Level 5 smoothness.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.GENERAL,
          title: "Raking light inspection",
          instructions: null,
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload finished ceiling photo",
          instructions: null,
        },
      ],
    },
    {
      slug: "corner-bead-accent",
      description: "[dev trade seed] Corner bead / accent edging (per linear ft)",
      defaultQuantity: "8",
      defaultUnitAmountCents: 1_200,
      customerScopeTitle: "Corner bead / accent edging",
      customerScopeDescription:
        "Install corner bead or accent edging on an exposed corner, including taping and finishing.",
      customerIncludedNotes:
        "Includes bead, mud, tape, and Level 4 finish.",
      customerExcludedNotes: "Excludes paint and any framing.",
      internalNotes: notes({
        unitType: "LINEAR_FT",
        unitTypeNote: "default qty 8 LF",
        assumptions: "Standard 90-degree outside corner.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Confirm bead style with customer",
          instructions: "Square / bullnose / decorative profile.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Stage bead and mud",
          instructions: null,
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Install bead and finish to Level 4",
          instructions: null,
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload installed corner photo",
          instructions: null,
        },
      ],
    },
  ],
};

const PAINTING: TradeBlock = {
  trade: "painting",
  lines: [
    {
      slug: "interior-room-repaint",
      description: "[dev trade seed] Interior room repaint — walls + ceiling (per room)",
      defaultQuantity: "3",
      defaultUnitAmountCents: 38_500,
      customerScopeTitle: "Interior room repaint",
      customerScopeDescription:
        "Prep, prime as needed, and repaint walls and ceiling of a standard interior room with two finish coats.",
      customerIncludedNotes:
        "Includes patch of small dings, prime over patches, and two finish coats. Customer-supplied or contractor-supplied paint per agreement.",
      customerExcludedNotes:
        "Excludes wallpaper removal, lead-paint abatement, major drywall repair, and trim/door painting (priced separately).",
      internalNotes: notes({
        unitType: "ROOM",
        unitTypeNote: "default qty 3 rooms",
        assumptions:
          "Standard 10×12 room; 8 ft ceilings; one accent color or all-walls one color.",
        permittingNote:
          "If pre-1978 home, lead paint disclosure / RRP rules may apply.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Confirm color, sheen, and any accent walls with customer",
          instructions: "Sample on wall in room lighting before full coat.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Stage paint, primer, drop cloths, and tape",
          instructions: null,
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Mask, patch, and prime",
          instructions: "Patch nail pops and small dings; prime patches.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Apply two finish coats",
          instructions: "Allow proper recoat time per product spec.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.GENERAL,
          title: "Walkthrough and touch-up",
          instructions: "Catch any holidays / drips; touch up.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload before/after photos",
          instructions: null,
        },
      ],
    },
    {
      slug: "exterior-siding-paint",
      description: "[dev trade seed] Exterior siding paint (per sq ft)",
      defaultQuantity: "1200",
      defaultUnitAmountCents: 275,
      customerScopeTitle: "Exterior siding paint",
      customerScopeDescription:
        "Pressure-wash, scrape and prime as needed, caulk gaps, and apply two finish coats of exterior paint to siding.",
      customerIncludedNotes:
        "Includes pressure-wash, scrape, spot-prime, caulk, and two finish coats. Trim painting priced separately.",
      customerExcludedNotes:
        "Excludes lead abatement (pre-1978 homes), siding repair beyond minor caulk, and roof/gutter work.",
      internalNotes: notes({
        unitType: "SQ_FT",
        unitTypeNote: "default qty 1200 sq ft",
        assumptions:
          "Wood, fiber-cement, or stucco siding; safe ladder access; weather window of 3 dry days.",
        permittingNote:
          "If pre-1978 home, RRP rules may apply for any sanding/scraping.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Confirm color, sheen, and trim color combinations",
          instructions: "Confirm body / trim / accent colors.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Order paint, primer, caulk, and masking",
          instructions: null,
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Pressure-wash and allow to dry",
          instructions: "Wait 24–48 hours before paint depending on substrate.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Scrape, spot-prime, and caulk",
          instructions: "Scrape failing paint; spot-prime bare wood; caulk seams.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Apply two finish coats",
          instructions: "Per manufacturer recoat times; avoid direct sun on wet paint.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.GENERAL,
          title: "Walkthrough and touch-up",
          instructions: null,
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload exterior before/after photos",
          instructions: null,
        },
      ],
    },
    {
      slug: "cabinet-refinish",
      description: "[dev trade seed] Cabinet refinish (per door / drawer face)",
      defaultQuantity: "16",
      defaultUnitAmountCents: 8_500,
      customerScopeTitle: "Cabinet refinish",
      customerScopeDescription:
        "Sand, prime, and finish-coat cabinet doors, drawer faces, and frames in place or in-shop.",
      customerIncludedNotes:
        "Includes label, remove, sand, prime, and two-coat finish on each door/drawer. Frames painted in place.",
      customerExcludedNotes:
        "Excludes hardware replacement, door replacement, and lead abatement.",
      internalNotes: notes({
        unitType: "DOOR",
        unitTypeNote: "1 = one door or drawer face; default qty 16",
        assumptions:
          "Standard wood / MDF doors; no specialty finishes (lacquer, glaze).",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Label and remove doors / drawer faces",
          instructions: "Label each piece for reinstall; bag hardware.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Order primer, finish paint, and sandpaper",
          instructions: "Bonding primer recommended for slick existing finishes.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Sand, prime, and finish doors",
          instructions: "Two finish coats; allow proper dry between.",
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Paint frames in place",
          instructions: "Mask cabinet boxes and adjacent surfaces; brush + roll frames.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.GENERAL,
          title: "Reinstall doors and adjust hardware",
          instructions: "Verify alignment; adjust hinges as needed.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload before/after photos",
          instructions: null,
        },
      ],
    },
    {
      slug: "trim-baseboard-paint",
      description: "[dev trade seed] Trim / baseboard paint (per linear ft)",
      defaultQuantity: "60",
      defaultUnitAmountCents: 400,
      customerScopeTitle: "Trim / baseboard paint",
      customerScopeDescription:
        "Caulk, prime as needed, and apply two finish coats of paint to existing baseboard, casing, or other trim.",
      customerIncludedNotes:
        "Includes caulk at gaps, spot prime, and two finish coats.",
      customerExcludedNotes:
        "Excludes trim replacement and any wall painting.",
      internalNotes: notes({
        unitType: "LINEAR_FT",
        unitTypeNote: "default qty 60 LF",
        assumptions: "Existing trim sound; semi-gloss / satin finish.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Confirm trim color and sheen",
          instructions: null,
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Stage paint, caulk, and masking",
          instructions: null,
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Mask, caulk, and prime as needed",
          instructions: null,
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Apply two finish coats",
          instructions: null,
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload before/after photos",
          instructions: null,
        },
      ],
    },
    {
      slug: "touchup-spotpaint-allowance",
      description: "[dev trade seed] Drywall touch-up + spot paint (allowance)",
      defaultQuantity: "1",
      defaultUnitAmountCents: 14_500,
      customerScopeTitle: "Touch-up + spot paint",
      customerScopeDescription:
        "Allowance for minor touch-up of drywall dings and spot painting in customer-supplied existing color.",
      customerIncludedNotes:
        "Includes minor patching, spot prime, and spot paint within the allowance.",
      customerExcludedNotes:
        "Excludes whole-wall re-paint, color matching beyond customer-supplied paint, and any major drywall repair.",
      internalNotes: notes({
        unitType: "ALLOWANCE",
        assumptions:
          "Customer supplies existing-color paint; touch-ups within ≤ 2 hours total.",
      }),
      tasks: [
        {
          bucket: "preConstruction",
          category: TaskTemplateCategory.GENERAL,
          title: "Walk site with customer to identify touch-up spots",
          instructions: "Mark each spot with low-tack tape.",
        },
        {
          bucket: "materials",
          category: TaskTemplateCategory.MATERIAL,
          title: "Verify customer paint and bring patch material",
          instructions: null,
        },
        {
          bucket: "installation",
          category: TaskTemplateCategory.GENERAL,
          title: "Patch and spot paint within allowance",
          instructions:
            "If scope grows beyond allowance, write change order before continuing.",
        },
        {
          bucket: "finalInspectionCloseout",
          category: TaskTemplateCategory.PHOTO_EVIDENCE,
          title: "Upload after photos and confirm with customer",
          instructions: null,
        },
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
 *
 * Pattern matches the existing seed in prisma/seed.ts:
 *   1. deleteMany child tasks for the template id (no-op if template is new)
 *   2. upsert the [LineItemTemplate] row
 *   3. createMany child [LineItemTemplateTask] rows in original order
 */
export async function seedTradeLineItemPresets(
  prisma: PrismaClient,
  organizationId: string,
): Promise<SeedTradeLineItemPresetsResult> {
  const stageDistribution: Record<StageBucketId, number> = {
    preConstruction: 0,
    engineeringPermits: 0,
    materials: 0,
    installation: 0,
    finalInspectionCloseout: 0,
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

      // Per-stage running sortOrder so tasks within a stage stay in declared order.
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
          stageKey: BUCKET_TO_STAGE_KEY[t.bucket],
          category: t.category,
          instructions: t.instructions,
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
