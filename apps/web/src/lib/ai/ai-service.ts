import { TaskTemplateCategory } from "@prisma/client";
import { z } from "zod";

/**
 * AI Service for Execution Planning
 * 
 * This service interfaces with an LLM (Gemini/Claude) to generate
 * realistic execution plans based on commercial line item descriptions.
 */

const GeneratedTaskSchema = z.object({
  title: z.string(),
  category: z.nativeEnum(TaskTemplateCategory),
  instructions: z.string().optional(),
  providesSignals: z.array(z.string()),
  requiresSignals: z.array(z.string()),
  checklist: z.array(z.string()),
  resources: z.array(z.object({
    name: z.string(),
    quantity: z.number(),
    isEquipment: z.boolean(),
  })),
});

const GeneratedExecutionPlanSchema = z.object({
  tasks: z.array(GeneratedTaskSchema),
});

export type GeneratedTask = z.infer<typeof GeneratedTaskSchema>;
export type GeneratedExecutionPlan = z.infer<typeof GeneratedExecutionPlanSchema>;

export class AIService {
  /**
   * Generates a realistic execution plan for a given line item.
   * 
   * In a production environment, this would call an LLM with a detailed prompt.
   * For now, it uses a sophisticated simulation to demonstrate the flow.
   */
  static async generateExecutionPlan(
    description: string,
    context?: {
      trade?: string;
      organizationName?: string;
    }
  ): Promise<GeneratedExecutionPlan> {
    // TODO: Implement actual LLM call (Gemini/Claude)
    // For now, we simulate the delay and return a structured response
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const d = description.toLowerCase();
    
    // Simple simulation logic to return varied results
    if (d.includes("roof") || d.includes("shingle")) {
      return {
        tasks: [
          {
            title: "Material Delivery & Roof Loading",
            category: TaskTemplateCategory.MATERIAL,
            instructions: "Ensure shingles are distributed across the ridge for weight balance.",
            providesSignals: ["materials-on-site"],
            requiresSignals: [],
            checklist: ["Verify shingle color matches order", "Check for driveway protection"],
            resources: [
              { name: "Conveyor Truck", quantity: 1, isEquipment: true },
              { name: "Roofing Brackets", quantity: 12, isEquipment: true }
            ]
          },
          {
            title: "Tear-off & Deck Inspection",
            category: TaskTemplateCategory.GENERAL,
            instructions: "Remove existing shingles down to the wood deck. Report any rot immediately.",
            providesSignals: ["demo-complete"],
            requiresSignals: ["materials-on-site"],
            checklist: ["Remove all old felt", "Inspect plywood for soft spots", "Sweep deck clean"],
            resources: [
              { name: "Dump Trailer", quantity: 1, isEquipment: true },
              { name: "Shingle Tear-off Tool", quantity: 4, isEquipment: true }
            ]
          },
          {
            title: "Dry-in & Flashing",
            category: TaskTemplateCategory.GENERAL,
            instructions: "Install ice & water shield in valleys and synthetic underlayment elsewhere.",
            providesSignals: ["roof-dried-in"],
            requiresSignals: ["demo-complete"],
            checklist: ["Install drip edge", "Flash chimney", "Step flashing on side walls"],
            resources: [
              { name: "Pneumatic Cap Stapler", quantity: 2, isEquipment: true }
            ]
          }
        ]
      };
    }

    if (d.includes("paint") || d.includes("stain")) {
      return {
        tasks: [
          {
            title: "Surface Prep & Masking",
            category: TaskTemplateCategory.GENERAL,
            instructions: "Cover all furniture and floors. Scrape loose paint.",
            providesSignals: ["prep-complete"],
            requiresSignals: [],
            checklist: ["Move furniture to center of room", "Tape off baseboards", "Patch small holes"],
            resources: [
              { name: "Drop Cloths", quantity: 10, isEquipment: true },
              { name: "HEPA Vacuum", quantity: 1, isEquipment: true }
            ]
          },
          {
            title: "Prime & First Coat",
            category: TaskTemplateCategory.GENERAL,
            instructions: "Apply primer to patched areas first.",
            providesSignals: ["first-coat-complete"],
            requiresSignals: ["prep-complete"],
            checklist: ["Cut in corners", "Roll main surfaces", "Check for drips"],
            resources: [
              { name: "Airless Sprayer (Optional)", quantity: 1, isEquipment: true },
              { name: "Extension Ladder", quantity: 2, isEquipment: true }
            ]
          }
        ]
      };
    }

    // Default generic fallback
    return {
      tasks: [
        {
          title: `Setup for ${description}`,
          category: TaskTemplateCategory.GENERAL,
          providesSignals: ["setup-complete"],
          requiresSignals: [],
          checklist: ["Safety briefing", "Mobilize tools"],
          resources: []
        },
        {
          title: `Execute ${description}`,
          category: TaskTemplateCategory.GENERAL,
          providesSignals: ["execution-complete"],
          requiresSignals: ["setup-complete"],
          checklist: ["Perform work per specs", "Quality check"],
          resources: []
        }
      ]
    };
  }
}
