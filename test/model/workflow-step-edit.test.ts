import { describe, expect, it } from "vitest";

import {
  backfillInstanceIds, removeStepById, reorderStepsById, validateStepEdit,
} from "../../src/model/workflow-step-edit";
import type { SerializedStep } from "../../src/model/types";

const step = (id: string, instanceId?: string, n = 0): SerializedStep => ({
  id, instanceId, optionValues: { n },
});

describe("workflow step edits", () => {
  it("removes by id even when the stored array grew after render", () => {
    const uiId = "scene-1";
    const grown = [step("scene", "scene-0"), step("scene", uiId), step("scene", "scene-2"), step("scene", "scene-3")];
    const next = removeStepById(grown, uiId);
    validateStepEdit(next, grown.length - 1);
    expect(next.map((s) => s.instanceId)).toEqual(["scene-0", "scene-2", "scene-3"]);
  });

  it("refuses a reorder captured from a shorter array than the stored one", () => {
    const grown = [step("scene", "scene-0"), step("scene", "scene-1"), step("scene", "scene-2"), step("scene", "scene-3")];
    expect(() => reorderStepsById(grown, ["scene-2", "scene-0", "scene-1"])).toThrow(/does not cover/);
    const reordered = reorderStepsById(grown.slice(0, 3), ["scene-2", "scene-0", "scene-1"]);
    validateStepEdit(reordered, 3);
    expect(reordered.map((s) => s.instanceId)).toEqual(["scene-2", "scene-0", "scene-1"]);
  });

  it("backfills duplicate legacy step types and keeps the ids stable", () => {
    const legacy = [step("scene", undefined, 1), step("scene", undefined, 2)];
    backfillInstanceIds(legacy);
    expect(legacy.map((s) => s.instanceId)).toEqual(["scene-0", "scene-1"]);
    const reordered = reorderStepsById(legacy, ["scene-1", "scene-0"]);
    validateStepEdit(reordered, 2);
    expect(reordered.map((s) => s.optionValues["n"])).toEqual([2, 1]);
    const removed = removeStepById(reordered, "scene-1");
    validateStepEdit(removed, 1);
    expect(removed.map((s) => s.instanceId)).toEqual(["scene-0"]);
    expect(() => validateStepEdit([legacy[0], undefined as any], 2)).toThrow(/invalid/);
  });
});
