import type { SerializedStep } from "./types";

/**
 * Gives every legacy step the same stable id `deserializeWorkflow` derives by
 * position, so later edits can address it by id instead of by index.
 */
export function backfillInstanceIds(steps: SerializedStep[]): void {
  steps.forEach((step, index) => {
    if (!step.instanceId) {
      step.instanceId = `${step.id}-${index}`;
    }
  });
}

export function removeStepById(
  steps: SerializedStep[],
  instanceId: string
): SerializedStep[] {
  const index = steps.findIndex((step) => step.instanceId === instanceId);
  if (index < 0) {
    throw new Error(`No compile step with instance id "${instanceId}".`);
  }
  return steps.filter((_, position) => position !== index);
}

export function reorderStepsById(
  steps: SerializedStep[],
  order: string[]
): SerializedStep[] {
  if (order.length !== steps.length) {
    throw new Error("Step reorder does not cover the stored steps.");
  }
  const byId = new Map<string, SerializedStep>();
  for (const step of steps) byId.set(step.instanceId, step);
  if (new Set(order).size !== order.length || order.some((id) => !byId.has(id))) {
    throw new Error("Step reorder references an unknown or duplicate step.");
  }
  return order.map((id) => byId.get(id));
}

/** Refuses holes, `undefined` entries, duplicate ids, or a wrong length. */
export function validateStepEdit(
  steps: SerializedStep[],
  expectedLength: number
): void {
  if (steps.length !== expectedLength) {
    throw new Error("Step edit changed the step count unexpectedly.");
  }
  const ids = new Set<string>();
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (!step || typeof step !== "object" || typeof step.instanceId !== "string") {
      throw new Error("Step edit produced an invalid array.");
    }
    if (ids.has(step.instanceId)) {
      throw new Error("Step edit produced duplicate instance ids.");
    }
    ids.add(step.instanceId);
  }
}
