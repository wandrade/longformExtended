import { describe, expect, it } from "vitest";

import type { TFile } from "obsidian";

import {
  applyCoreTemplateVariables,
  fileNameFromPath,
  statsForScene,
} from "../../src/model/note-utils";
import type {
  Draft,
  DraftWordCounts,
  MultipleSceneDraft,
  SingleSceneDraft,
} from "../../src/model/types";

function makeDraft(
  overrides: Partial<MultipleSceneDraft> = {}
): MultipleSceneDraft {
  return {
    format: "scenes",
    title: "Book",
    titleInFrontmatter: true,
    draftTitle: null,
    vaultPath: "P/Book.md",
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
    ...overrides,
  };
}

function makeSingle(
  overrides: Partial<SingleSceneDraft> = {}
): SingleSceneDraft {
  return {
    format: "single",
    title: "Book",
    titleInFrontmatter: true,
    draftTitle: null,
    vaultPath: "P/Single.md",
    workflow: null,
    ...overrides,
  };
}

function activeFile(path: string): TFile {
  return { path } as TFile;
}

describe("fileNameFromPath", () => {
  it("returns the final path segment without a markdown extension", () => {
    expect(fileNameFromPath("Books/My/Scenes/Scene 1.md")).toBe("Scene 1");
    expect(fileNameFromPath("Scene 1.md")).toBe("Scene 1");
    expect(fileNameFromPath("Books/My/Notes")).toBe("Notes");
  });
});

describe("applyCoreTemplateVariables", () => {
  const now = {
    format: (format = "default") => `[${format}]`,
  };

  it("replaces title, date, and time defaults everywhere", () => {
    expect(
      applyCoreTemplateVariables(
        "# {{title}}\n{{title}}\n{{date}} {{time}}",
        "Thea",
        "YYYY-MM-DD",
        "HH:mm",
        now
      )
    ).toBe("# Thea\nThea\n[YYYY-MM-DD] [HH:mm]");
  });

  it("honors per-placeholder date and time formats", () => {
    expect(
      applyCoreTemplateVariables(
        "{{date:MMMM Do}} at {{time:h:mm A}}",
        "Thea",
        "YYYY-MM-DD",
        "HH:mm",
        now
      )
    ).toBe("[MMMM Do] at [h:mm A]");
  });

  it("leaves unsupported variables untouched", () => {
    expect(
      applyCoreTemplateVariables(
        "{{DATE}} {{title}}",
        "Thea",
        "YYYY-MM-DD",
        "HH:mm",
        now
      )
    ).toBe("{{DATE}} Thea");
  });
});

describe("statsForScene", () => {
  const multi = makeDraft({
    vaultPath: "P/Book.md",
    scenes: [
      { title: "Scene 1", indent: 0 },
      { title: "Scene 2", indent: 0 },
    ],
  });
  const other = makeDraft({ vaultPath: "P/Other.md", title: "Book" });
  const single = makeSingle({ title: "Solo", vaultPath: "P/Single.md" });
  const drafts: Draft[] = [multi, other, single];
  const counts: DraftWordCounts = {
    "P/Book.md": { "Scene 1": 10, "Scene 2": 20 },
    "P/Other.md": { "Scene 1": 5 },
    "P/Single.md": 100,
  };

  it("reports the active scene, draft total, and project total", () => {
    expect(
      statsForScene(
        activeFile("P/Scenes/Scene 2.md"),
        multi,
        drafts,
        counts
      )
    ).toEqual({ scene: 20, draft: 30, project: 35 });
    expect(statsForScene(null, multi, drafts, counts)).toEqual({
      scene: 0,
      draft: 30,
      project: 35,
    });
  });

  it("treats a single-scene draft's count as its only scene", () => {
    expect(statsForScene(null, single, drafts, counts)).toEqual({
      scene: 100,
      draft: 100,
      project: 100,
    });
  });

  it("sums same-title projects and returns null when a draft has no counts", () => {
    const secondSingle = makeSingle({
      title: "Solo",
      vaultPath: "P/Single2.md",
    });
    expect(
      statsForScene(null, single, [...drafts, secondSingle], {
        ...counts,
        "P/Single2.md": 50,
      })
    ).toEqual({ scene: 100, draft: 100, project: 150 });

    expect(statsForScene(null, multi, drafts, {})).toBeNull();
  });

  it("uses a zero scene count when the draft count is not per-scene", () => {
    expect(
      statsForScene(activeFile("P/Scenes/Scene 1.md"), multi, drafts, {
        "P/Book.md": 42,
      })
    ).toEqual({ scene: 0, draft: 42, project: 42 });
  });
});
