import { describe, expect, it } from "vitest";

import { TFile, type App } from "obsidian";

import {
  applyDefaultKanbanStatus,
  defaultKanbanStatus,
} from "../../src/model/kanban-status";
import type { MultipleSceneDraft } from "../../src/model/types";

function makeDraft(
  overrides: Partial<MultipleSceneDraft> = {}
): MultipleSceneDraft {
  return {
    format: "scenes",
    title: "Book",
    titleInFrontmatter: true,
    draftTitle: null,
    vaultPath: "Books/My/Book.md",
    workflow: null,
    sceneFolder: "Scenes",
    scenes: [],
    ignoredFiles: [],
    unknownFiles: [],
    sceneTemplate: null,
    plotTemplate: null,
    characterTemplate: null,
    plots: [],
    characters: [],
    sceneDisplayName: "Scenes",
    plotsDisplayName: "Subplots",
    charactersDisplayName: "Characters",
    noteGroups: [],
    timeframeTagName: "timeframe",
    timeFormat: "datetime",
    kanbanColumns: "Planned Draft Reviewed",
    kanbanShowUnassigned: false,
    kanbanSaveWordCounts: true,
    kanbanEnabled: true,
    kanbanIncludePlots: true,
    kanbanOutputPath: "Build/$1_kanban.base",
    timelineEnabled: true,
    timelineOutputPath: "Build/$1_timeline.md",
    plotGridEnabled: true,
    plotGridOutputPath: "Base/$1_plotgrid.base",
    plotGridPlotsDir: "Subplots",
    plotGridCharactersDir: "Characters",
    autocompileMinutes: null,
    ...overrides,
  };
}

function makeWorld(initial: Record<string, unknown> = {}) {
  const frontmatter: Record<string, unknown> = { ...initial };
  let calls = 0;
  const app = {
    fileManager: {
      processFrontMatter: async (
        _file: TFile,
        callback: (data: Record<string, unknown>) => void
      ) => {
        calls += 1;
        callback(frontmatter);
      },
    },
  } as unknown as App;
  const file = Object.assign(new TFile(), {
    path: "Books/My/Scenes/Scene.md",
  });
  return { app, file, frontmatter, calls: () => calls };
}

describe("defaultKanbanStatus", () => {
  it("uses the first configured column", () => {
    expect(
      defaultKanbanStatus(makeDraft({ kanbanColumns: '"To do" Draft Done' }))
    ).toBe("To do");
  });

  it("falls back to the first default column when the setting is empty", () => {
    expect(defaultKanbanStatus(makeDraft({ kanbanColumns: "" }))).toBe(
      "Planned"
    );
  });
});

describe("applyDefaultKanbanStatus", () => {
  it("writes the first configured column to a new note", async () => {
    const world = makeWorld();
    const draft = makeDraft({ kanbanColumns: '"To do" Draft Done' });

    await applyDefaultKanbanStatus(world.app, world.file, draft);

    expect(world.frontmatter).toEqual({ status: "To do" });
    expect(world.calls()).toBe(1);
  });

  it("falls back to the first default column when the setting is empty", async () => {
    const world = makeWorld();
    const draft = makeDraft({ kanbanColumns: "" });

    await applyDefaultKanbanStatus(world.app, world.file, draft);

    expect(world.frontmatter).toEqual({ status: "Planned" });
  });

  it("does nothing when the kanban is disabled", async () => {
    const world = makeWorld();
    const draft = makeDraft({ kanbanEnabled: false });

    await applyDefaultKanbanStatus(world.app, world.file, draft);

    expect(world.frontmatter).toEqual({});
    expect(world.calls()).toBe(0);
  });

  it("does not overwrite an existing non-empty status", async () => {
    const world = makeWorld({ status: "Draft" });
    const draft = makeDraft({ kanbanColumns: "Planned" });

    await applyDefaultKanbanStatus(world.app, world.file, draft);

    expect(world.frontmatter).toEqual({ status: "Draft" });
  });

  it("replaces a blank status", async () => {
    const world = makeWorld({ status: "   " });
    const draft = makeDraft({ kanbanColumns: "Planned" });

    await applyDefaultKanbanStatus(world.app, world.file, draft);

    expect(world.frontmatter).toEqual({ status: "Planned" });
  });
});
