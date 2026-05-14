/**
 * Task Resource / Equipment Definition
 * 
 * Used in partsRequiredJson to track equipment, tools, and materials
 * needed for a specific task.
 */

export type TaskResource = {
  id: string;
  name: string;
  quantity: number;
  unit?: string;
  /** True if this is a reusable tool/equipment (e.g. Scissor Lift), false if it's a consumable part (e.g. 10ft Pipe). */
  isEquipment?: boolean;
};

export type TaskResourceRequirement = {
  resources: TaskResource[];
};
