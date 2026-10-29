import { beforeEach, describe, expect, it, vi } from "vitest";

import type { App } from "obsidian";

import {
  buildKanban,
  writeKanbanBase,
  writeKanbanWordCounts,
} from "../../src/model/kanban";
import { writePlotGrid } from "../../src/model/plot-grid";
import { refreshGeneratedFiles } from "../../src/model/refresh-generated";
import { buildTimeline, writeTimeline } from "../../src/model/timeline";
import type { MultipleSceneDraft } from "../../src/model/types";

vi.mock("../../src/model/timeline", () => ({
  buildTimeline: vi.fn(),
  writeTimeline: vi.fn(),
}));

vi.mock("../../src/model/kanban", () => ({
  buildKanban: vi.fn(),
  writeKanbanBase: vi.fn(),
  writeKanbanWordCounts: vi.fn(),
}));

vi.mock("../../src/model/plot-grid", () => ({
  writePlotGrid: vi.fn(),
}));

const app = {} as App;

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

beforeEach(() => {
  vi.mocked(buildTimeline).mockReset();
  vi.mocked(buildTimeline).mockResolvedValue(undefined as any);
  vi.mocked(writeTimeline).mockReset();
  vi.mocked(writeTimeline).mockResolvedValue(undefined);
  vi.mocked(buildKanban).mockReset();
  vi.mocked(buildKanban).mockResolvedValue(undefined as any);
  vi.mocked(writeKanbanBase).mockReset();
  vi.mocked(writeKanbanBase).mockResolvedValue(undefined);
  vi.mocked(writeKanbanWordCounts).mockReset();
  vi.mocked(writeKanbanWordCounts).mockResolvedValue(undefined);
  vi.mocked(writePlotGrid).mockReset();
  vi.mocked(writePlotGrid).mockResolvedValue(undefined);
});

describe("refreshGeneratedFiles", () => {
  it("regenerates every output when every flag is enabled", async () => {
    const draft = makeDraft();

    await refreshGeneratedFiles(app, draft);

    expect(buildTimeline).toHaveBeenCalledWith(app, draft);
    expect(writeTimeline).toHaveBeenCalledTimes(1);
    expect(buildKanban).toHaveBeenCalledWith(app, draft);
    expect(writeKanbanBase).toHaveBeenCalledTimes(1);
    expect(writeKanbanWordCounts).toHaveBeenCalledTimes(1);
    expect(writePlotGrid).toHaveBeenCalledWith(app, draft);
  });

  it("runs only the outputs whose own flag is enabled", async () => {
    const draft = makeDraft({ kanbanEnabled: false, plotGridEnabled: false });

    await refreshGeneratedFiles(app, draft);

    expect(buildTimeline).toHaveBeenCalledTimes(1);
    expect(buildKanban).not.toHaveBeenCalled();
    expect(writeKanbanBase).not.toHaveBeenCalled();
    expect(writeKanbanWordCounts).not.toHaveBeenCalled();
    expect(writePlotGrid).not.toHaveBeenCalled();
  });

  it("writes nothing when every output is disabled", async () => {
    const draft = makeDraft({
      timelineEnabled: false,
      kanbanEnabled: false,
      plotGridEnabled: false,
    });

    await refreshGeneratedFiles(app, draft);

    expect(buildTimeline).not.toHaveBeenCalled();
    expect(writeTimeline).not.toHaveBeenCalled();
    expect(buildKanban).not.toHaveBeenCalled();
    expect(writeKanbanBase).not.toHaveBeenCalled();
    expect(writeKanbanWordCounts).not.toHaveBeenCalled();
    expect(writePlotGrid).not.toHaveBeenCalled();
  });
});
