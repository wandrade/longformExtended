import { describe, expect, it } from "vitest";

import {
  calculateWorkflow,
  CompileStepKind,
  makeBuiltinStep,
  PLACEHOLDER_MISSING_STEP,
  WorkflowError,
  type CompileStep,
  type Workflow,
} from "../../src/compile/index";

function step(
  id: string,
  kinds: CompileStepKind[]
): CompileStep {
  return makeBuiltinStep({
    id,
    description: {
      name: id,
      description: "",
      availableKinds: kinds,
      options: [],
    },
    compile: (input) => input,
  });
}

const sceneStep = step("scene", [CompileStepKind.Scene]);
const joinStep = step("join", [CompileStepKind.Join]);
const manuscriptStep = step("manuscript", [CompileStepKind.Manuscript]);

function workflow(steps: CompileStep[]): Workflow {
  return { name: "Test", description: "", steps };
}

function validate(steps: CompileStep[], isMultiScene = true) {
  return calculateWorkflow(workflow(steps), isMultiScene);
}

describe("calculateWorkflow", () => {
  it("validates a scene, join, manuscript workflow", () => {
    const [result, kinds] = validate([
      sceneStep,
      sceneStep,
      joinStep,
      manuscriptStep,
    ]);

    expect(result).toEqual({
      error: WorkflowError.Valid,
      stepPosition: 0,
    });
    expect(kinds).toEqual([
      CompileStepKind.Scene,
      CompileStepKind.Scene,
      CompileStepKind.Join,
      CompileStepKind.Manuscript,
    ]);
  });

  it("requires a scene or join first", () => {
    expect(validate([manuscriptStep])).toEqual([
      { error: WorkflowError.BadFirstStep, stepPosition: 0 },
      [],
    ]);
  });

  it("requires a join before manuscript steps", () => {
    expect(validate([sceneStep, manuscriptStep])).toEqual([
      { error: WorkflowError.MissingJoinStep, stepPosition: 1 },
      [CompileStepKind.Scene],
    ]);
  });

  it("rejects scene steps after a join", () => {
    expect(validate([joinStep, sceneStep])).toEqual([
      { error: WorkflowError.ScenesStepPostJoin, stepPosition: 1 },
      [CompileStepKind.Join],
    ]);
    expect(validate([joinStep, joinStep])).toEqual([
      { error: WorkflowError.ScenesStepPostJoin, stepPosition: 1 },
      [CompileStepKind.Join],
    ]);
  });

  it("rejects an unloaded placeholder step", () => {
    expect(validate([sceneStep, PLACEHOLDER_MISSING_STEP])).toEqual([
      { error: WorkflowError.UnloadedStep, stepPosition: 1 },
      [CompileStepKind.Scene],
    ]);
  });

  it("validates single-scene workflows without join steps", () => {
    expect(validate([sceneStep, manuscriptStep], false)).toEqual([
      { error: WorkflowError.Valid, stepPosition: 0 },
      [CompileStepKind.Scene, CompileStepKind.Manuscript],
    ]);
    expect(validate([manuscriptStep, manuscriptStep], false)).toEqual([
      { error: WorkflowError.Valid, stepPosition: 0 },
      [CompileStepKind.Manuscript, CompileStepKind.Manuscript],
    ]);
    expect(validate([joinStep], false)).toEqual([
      { error: WorkflowError.JoinForSingle, stepPosition: 0 },
      [],
    ]);
  });

  it("accepts an empty workflow", () => {
    expect(validate([])).toEqual([
      { error: WorkflowError.Valid, stepPosition: 0 },
      [],
    ]);
  });
});
