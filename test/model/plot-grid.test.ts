import { describe, expect, it } from "vitest";

import type { App, TFile } from "obsidian";

import {
  comparePlotGridRows,
  describePlotGridDirectoryConflict,
  ensurePlotGridData,
  isPlotGridPath,
  PLOT_GRID_CHARACTER_LABEL_PREFIX,
  PLOT_GRID_PLOT_LABEL_PREFIX,
  plotGridAllColumns,
  plotGridColumns,
  plotGridDefaultLevelValue,
  plotGridDirectoryConflicts,
  plotGridLevels,
  plotGridLevelViewOptions,
  plotGridDirectories,
  plotGridDirectoryConflictMessage,
  plotGridDeepestColumns,
  plotGridIndents,
  plotGridLevelOptions,
  plotGridNodesAtLevel,
  plotGridRowFiles,
  plotGridRowGroup,
  plotGridRowLabel,
  plotGridRowProperty,
  renderPlotGridBase,
  resolvePlotGridDirectories,
  resolvePlotGridDirectory,
  isInsidePlotGridDirectory,
  slugPlotGridSegment,
  writePlotGrid,
} from "src/model/plot-grid";
import type { MultipleSceneDraft } from "src/model/types";

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
    ignoredFiles: null,
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
    plotGridOutputPath: "",
    plotGridPlotsDir: "Bible/Plots",
    plotGridCharactersDir: "Bible/Characters",
    ...overrides,
  };
}

type FakeWorld = {
  app: App;
  frontmatter: Map<string, Record<string, unknown>>;
  writes: string[];
  generated: Map<string, string>;
};

function makeWorld(
  files: string[],
  projectPath = "Books/My/Book.md"
): FakeWorld {
  const frontmatter = new Map<string, Record<string, unknown>>();
  for (const file of files) {
    frontmatter.set(file, {});
  }
  const writes: string[] = [];
  const generated = new Map<string, string>();

  const getMarkdownFiles = () =>
    Array.from(frontmatter.keys()).map((path) => ({ path } as TFile));

  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => {
        if (path === projectPath) {
          return { parent: { path: "Books/My" } };
        }
        if (generated.has(path)) {
          return { path };
        }
        return null;
      },
      getMarkdownFiles,
      createFolder: async (): Promise<void> => undefined,
      adapter: {
        exists: async (path: string) =>
          generated.has(path) ||
          Array.from(generated.keys()).some((key) =>
            key.startsWith(`${path}/`)
          ),
        read: async (path: string) => generated.get(path) ?? "",
        write: async (path: string, contents: string) => {
          generated.set(path, contents);
        },
      },
    },
    metadataCache: {
      getFileCache: (file: { path: string }) => ({
        frontmatter: frontmatter.get(file.path),
      }),
    },
    fileManager: {
      processFrontMatter: async (
        file: { path: string },
        callback: (data: Record<string, unknown>) => void
      ) => {
        const current = frontmatter.get(file.path) ?? {};
        const next = { ...current };
        callback(next);
        frontmatter.set(file.path, next);
        writes.push(file.path);
      },
    },
  } as unknown as App;

  return { app, frontmatter, writes, generated };
}

const HIERARCHY = [
  { title: "act1", indent: 0 },
  { title: "chapter 1", indent: 1 },
  { title: "scene 1", indent: 2 },
  { title: "scene 2", indent: 2 },
  { title: "chapter 2", indent: 1 },
  { title: "scene 3", indent: 2 },
  { title: "act2", indent: 0 },
  { title: "chapter 3", indent: 1 },
  { title: "scene 4", indent: 2 },
];

const LEVEL_ZERO_SCENES = [
  { title: "Act 1 The Beginning", indent: 0 },
  { title: "Act 2 The Choice", indent: 0 },
];

describe("plot grid hierarchy", () => {
  it("ranks distinct indents without assuming a unit of one", () => {
    expect(plotGridIndents(HIERARCHY)).toEqual([0, 1, 2]);
    expect(
      plotGridIndents([
        { title: "a", indent: 0 },
        { title: "b", indent: 3 },
        { title: "c", indent: 3 },
        { title: "d", indent: 0 },
      ])
    ).toEqual([0, 3]);

    expect(
      plotGridNodesAtLevel(
        [
          { title: "a", indent: 0 },
          { title: "b", indent: 3 },
          { title: "c", indent: 3 },
          { title: "d", indent: 0 },
        ],
        1
      ).map((node) => node.path)
    ).toEqual([
      ["a", "b"],
      ["a", "c"],
    ]);
  });

  it("extracts each level in document order with ancestor paths", () => {
    expect(plotGridNodesAtLevel(HIERARCHY, 0)).toEqual([
      { title: "act1", path: ["act1"] },
      { title: "act2", path: ["act2"] },
    ]);
    expect(plotGridNodesAtLevel(HIERARCHY, 1).map((node) => node.path)).toEqual(
      [
        ["act1", "chapter 1"],
        ["act1", "chapter 2"],
        ["act2", "chapter 3"],
      ]
    );
    expect(plotGridNodesAtLevel(HIERARCHY, 2).map((node) => node.path)).toEqual(
      [
        ["act1", "chapter 1", "scene 1"],
        ["act1", "chapter 1", "scene 2"],
        ["act1", "chapter 2", "scene 3"],
        ["act2", "chapter 3", "scene 4"],
      ]
    );
    expect(plotGridNodesAtLevel(HIERARCHY, 3)).toEqual([]);
    expect(plotGridNodesAtLevel(HIERARCHY, -1)).toEqual([]);
    expect(plotGridNodesAtLevel(HIERARCHY, 1.5)).toEqual([]);
  });

  it("slugs titles and suffixes collisions", () => {
    expect(slugPlotGridSegment("  Act 1!  ")).toBe("act_1");
    expect(slugPlotGridSegment("???")).toBe("");

    expect(
      plotGridColumns([{ title: "Act 1", indent: 0 }], 0).map((c) => c.key)
    ).toEqual(["plotgrid_act_1"]);

    expect(
      plotGridColumns(
        [
          { title: "Act 1", indent: 0 },
          { title: "Act-1", indent: 0 },
          { title: "Act_1", indent: 0 },
        ],
        0
      ).map((column) => column.key)
    ).toEqual(["plotgrid_act_1", "plotgrid_act_1_2", "plotgrid_act_1_3"]);

    expect(
      plotGridColumns(HIERARCHY, 1).map((column) => column.key)
    ).toEqual([
      "plotgrid_chapter_1",
      "plotgrid_chapter_2",
      "plotgrid_chapter_3",
    ]);
    expect(plotGridColumns(HIERARCHY, 1)[0].path).toEqual([
      "act1",
      "chapter 1",
    ]);

    expect(
      plotGridColumns(HIERARCHY, 2).map((column) => column.key)
    ).toEqual([
      "plotgrid_scene_1",
      "plotgrid_scene_2",
      "plotgrid_scene_3",
      "plotgrid_scene_4",
    ]);
    expect(plotGridColumns(HIERARCHY, 2)[0].title).toBe("scene 1");
  });

  it("uses only the node title, so equal titles collide across parents", () => {
    const scenes = [
      { title: "Act 1", indent: 0 },
      { title: "Chapter 1", indent: 1 },
      { title: "Act 2", indent: 0 },
      { title: "Chapter 1", indent: 1 },
    ];

    expect(
      plotGridColumns(scenes, 1).map((column) => column.key)
    ).toEqual(["plotgrid_chapter_1", "plotgrid_chapter_1_2"]);
  });

  it("orders every level's columns in scene document order", () => {
    const levels = plotGridLevels(HIERARCHY);

    expect(levels.map((level) => level.level)).toEqual([0, 1, 2]);
    expect(levels.map((level) => level.label)).toEqual([
      "0 - (act1, act2)",
      "1 - (chapter 1, chapter 2, chapter 3)",
      "2 - (scene 1, scene 2, scene 3, …)",
    ]);
    expect(levels.map((level) => level.columns.map((column) => column.title)))
      .toEqual([
        ["act1", "act2"],
        ["chapter 1", "chapter 2", "chapter 3"],
        ["scene 1", "scene 2", "scene 3", "scene 4"],
      ]);
  });

  it("orders All as acts, chapters, then scenes, each in document order", () => {
    const levels = plotGridLevels(HIERARCHY);

    expect(
      plotGridAllColumns(levels).map((column) => column.key)
    ).toEqual([
      "plotgrid_act1",
      "plotgrid_act2",
      "plotgrid_chapter_1",
      "plotgrid_chapter_2",
      "plotgrid_chapter_3",
      "plotgrid_scene_1",
      "plotgrid_scene_2",
      "plotgrid_scene_3",
      "plotgrid_scene_4",
    ]);
  });

  it("builds view level options with the same ordered property lists", () => {
    const options = plotGridLevelViewOptions(plotGridLevels(HIERARCHY));

    expect(options.map((option) => option.value)).toEqual([
      "all",
      "0",
      "1",
      "2",
    ]);
    expect(options.map((option) => option.label)).toEqual([
      "All",
      "0 - (act1, act2)",
      "1 - (chapter 1, chapter 2, chapter 3)",
      "2 - (scene 1, scene 2, scene 3, …)",
    ]);
    expect(options[1].properties).toEqual([
      "note.plotgrid_act1",
      "note.plotgrid_act2",
    ]);
    expect(options[2].properties).toEqual([
      "note.plotgrid_chapter_1",
      "note.plotgrid_chapter_2",
      "note.plotgrid_chapter_3",
    ]);
    expect(options[0].properties).toEqual([
      "note.plotgrid_act1",
      "note.plotgrid_act2",
      "note.plotgrid_chapter_1",
      "note.plotgrid_chapter_2",
      "note.plotgrid_chapter_3",
      "note.plotgrid_scene_1",
      "note.plotgrid_scene_2",
      "note.plotgrid_scene_3",
      "note.plotgrid_scene_4",
    ]);
  });

  it("defaults the view to level 0, then the first level, then All", () => {
    expect(
      plotGridDefaultLevelValue(
        plotGridLevelViewOptions(plotGridLevels(HIERARCHY))
      )
    ).toBe("0");
    expect(
      plotGridDefaultLevelValue([{ value: "all" }, { value: "2" }])
    ).toBe("2");
    expect(plotGridDefaultLevelValue([{ value: "all" }])).toBe("all");
    expect(plotGridDefaultLevelValue([])).toBe("all");
  });

  it("dedupes a key shared by two levels in the All order", () => {
    const levels = plotGridLevels([
      { title: "Same", indent: 0 },
      { title: "Same", indent: 1 },
    ]);
    const options = plotGridLevelViewOptions(levels);

    expect(options.map((option) => option.properties)).toEqual([
      ["note.plotgrid_same"],
      ["note.plotgrid_same"],
      ["note.plotgrid_same"],
    ]);
    expect(plotGridAllColumns(levels).map((column) => column.key)).toEqual([
      "plotgrid_same",
    ]);
  });
});

const LEVEL_OPTION_SCENES = [
  { title: "Act 1 - The Beginning", indent: 0 },
  { title: "Chapter 1 - Arrival", indent: 1 },
  { title: "Scene 1 - The Train", indent: 2 },
  { title: "Scene 2 - The Station", indent: 2 },
  { title: "Scene 3 - The Inn", indent: 2 },
  { title: "Chapter 2 - The Town", indent: 1 },
  { title: "Scene 4 - The Road", indent: 2 },
  { title: "Scene 5 - The Market", indent: 2 },
  { title: "Scene 6 - The Letter", indent: 2 },
  { title: "Chapter 3 - The Journey", indent: 1 },
  { title: "Scene 7 - The Pass", indent: 2 },
  { title: "Scene 8 - The Return", indent: 2 },
  { title: "Act 2 - The Choice", indent: 0 },
];

describe("plot grid level options", () => {
  it("labels every populated level and caps the titles shown", () => {
    const options = plotGridLevelOptions(LEVEL_OPTION_SCENES);

    expect(options.map((option) => option.level)).toEqual([0, 1, 2]);
    expect(options.map((option) => option.label)).toEqual([
      "0 - (Act 1 - The Beginning, Act 2 - The Choice)",
      "1 - (Chapter 1 - Arrival, Chapter 2 - The Town, Chapter 3 - The Journey)",
      "2 - (Scene 1 - The Train, Scene 2 - The Station, Scene 3 - The Inn, …)",
    ]);
    expect(options[2].titles).toEqual([
      "Scene 1 - The Train",
      "Scene 2 - The Station",
      "Scene 3 - The Inn",
    ]);
    expect(options.map((option) => option.level)).not.toContain(3);
  });

  it("ranks distinct non-unit indents as 0, 1, 2", () => {
    const options = plotGridLevelOptions([
      { title: "Top", indent: 0 },
      { title: "Mid", indent: 4 },
      { title: "Low A", indent: 9 },
      { title: "Low B", indent: 9 },
    ]);

    expect(options.map((option) => option.label)).toEqual([
      "0 - (Top)",
      "1 - (Mid)",
      "2 - (Low A, Low B)",
    ]);
  });

  it("uses the exact label format and a configurable cap", () => {
    expect(
      plotGridLevelOptions([
        { title: "a", indent: 0 },
        { title: "b", indent: 0 },
        { title: "c", indent: 0 },
      ])[0].label
    ).toBe("0 - (a, b, c)");
    expect(
      plotGridLevelOptions(
        [
          { title: "a", indent: 0 },
          { title: "b", indent: 0 },
          { title: "c", indent: 0 },
        ],
        2
      )[0].label
    ).toBe("0 - (a, b, …)");
  });

  it("skips empty titles and levels without nodes", () => {
    expect(plotGridLevelOptions([])).toEqual([]);
    expect(
      plotGridLevelOptions([
        { title: "  ", indent: 0 },
        { title: "Named", indent: 1 },
      ])
    ).toEqual([{ level: 1, label: "1 - (Named)", titles: ["Named"] }]);
  });
});

describe("plot grid directories and rows", () => {
  it("resolves every folder relative to the project folder", () => {
    const { app } = makeWorld([]);
    const projectDraft = makeDraft();
    const directories = plotGridDirectories(app, projectDraft);
    expect(directories.plots).toBe("Books/My/Bible/Plots");
    expect(directories.characters).toBe("Books/My/Bible/Characters");
    expect(directories.filters).toEqual([
      "Books/My/Bible/Plots",
      "Books/My/Bible/Characters",
    ]);

    // A leading slash is only a separator; it does not mean the vault root.
    const leading = plotGridDirectories(
      app,
      makeDraft({ plotGridPlotsDir: "/Bible/Plots" })
    );
    expect(leading.plots).toBe("Books/My/Bible/Plots");
  });

  it("loads an identical directory once and keeps nested folders as two filters", () => {
    const { app } = makeWorld([
      "Books/My/Bible/Plots/a.md",
      "Books/My/Bible/Plots/b.md",
    ]);

    const identical = plotGridDirectories(
      app,
      makeDraft({ plotGridCharactersDir: "Bible/Plots" })
    );
    expect(identical.filters).toEqual(["Books/My/Bible/Plots"]);

    const nested = plotGridDirectories(
      app,
      makeDraft({ plotGridCharactersDir: "Bible/Plots/Characters" })
    );
    expect(nested.filters).toEqual([
      "Books/My/Bible/Plots",
      "Books/My/Bible/Plots/Characters",
    ]);
  });

  it("resolves the scene folder and both row folders", () => {
    const { app } = makeWorld([]);
    expect(resolvePlotGridDirectories(app, makeDraft())).toEqual({
      scene: "Books/My/Scenes",
      plots: "Books/My/Bible/Plots",
      characters: "Books/My/Bible/Characters",
    });
  });

  it("accepts three distinct, non-nested folders", () => {
    expect(
      plotGridDirectoryConflicts({
        scene: "Books/My/Scenes",
        plots: "Books/My/Bible/Plots",
        characters: "Books/My/Bible/Characters",
      })
    ).toEqual([]);
  });

  it("reports equal folders pairwise", () => {
    expect(
      plotGridDirectoryConflicts({
        scene: "Books/My/Plots",
        plots: "Books/My/Plots",
        characters: "Books/My/Characters",
      })
    ).toEqual([{ first: "scene", second: "plots", kind: "same" }]);

    expect(
      plotGridDirectoryConflicts({
        scene: "Books/My/Scenes",
        plots: "Books/My/Plots",
        characters: "Books/My/Plots",
      })
    ).toEqual([{ first: "plots", second: "characters", kind: "same" }]);
  });

  it("reports nested folders in either direction", () => {
    expect(
      plotGridDirectoryConflicts({
        scene: "Books/My",
        plots: "Books/My/Bible/Plots",
        characters: "Books/My/Bible/Characters",
      })
    ).toEqual([
      { first: "scene", second: "plots", kind: "nested" },
      { first: "scene", second: "characters", kind: "nested" },
    ]);

    expect(
      plotGridDirectoryConflicts({
        scene: "Books/My/Scenes",
        plots: "Books/My/Bible/Plots",
        characters: "Books/My/Bible/Plots/Characters",
      })
    ).toEqual([{ first: "plots", second: "characters", kind: "nested" }]);
  });

  it("describes conflicts with folder wording", () => {
    expect(
      describePlotGridDirectoryConflict({
        first: "plots",
        second: "characters",
        kind: "same",
      })
    ).toBe("Subplot folder and Character folder must not be the same folder.");
    expect(
      describePlotGridDirectoryConflict({
        first: "scene",
        second: "plots",
        kind: "nested",
      })
    ).toBe(
      "Scene folder and Subplot folder must not be nested inside one another."
    );
  });

  it("orders plots then characters, alphabetically, deduped by path", () => {
    const { app } = makeWorld([
      "Books/My/Bible/Characters/z.md",
      "Books/My/Bible/Characters/a.md",
      "Books/My/Bible/Plots/z.md",
      "Books/My/Bible/Plots/a.md",
      "Books/My/Elsewhere.md",
    ]);
    const directories = plotGridDirectories(app, makeDraft());
    expect(
      plotGridRowFiles(app, directories).map((file) => file.path)
    ).toEqual([
      "Books/My/Bible/Plots/a.md",
      "Books/My/Bible/Plots/z.md",
      "Books/My/Bible/Characters/a.md",
      "Books/My/Bible/Characters/z.md",
    ]);

    const nested = plotGridDirectories(
      app,
      makeDraft({ plotGridCharactersDir: "Bible/Plots/Characters" })
    );
    const files = plotGridRowFiles(app, nested);
    expect(files.map((file) => file.path)).toEqual([
      "Books/My/Bible/Plots/a.md",
      "Books/My/Bible/Plots/z.md",
    ]);
  });

  it("maps paths in row folders inside the project folder", () => {
    const { app } = makeWorld([]);
    const draft = makeDraft({
      plotGridPlotsDir: "/Bible/Plots",
      plotGridCharactersDir: "/Bible/Characters",
    });
    expect(isPlotGridPath(app, draft, "Books/My/Bible/Plots/a.md")).toBe(true);
    expect(isPlotGridPath(app, draft, "Books/My/Bible/Characters/b.md")).toBe(
      true
    );
    expect(isPlotGridPath(app, draft, "Books/My/Bible/Other/c.md")).toBe(false);
    expect(isPlotGridPath(app, draft, "Bible/Plots/a.md")).toBe(false);
  });
});

describe("plot grid row labels", () => {
  it("prefixes rows when the directories differ", () => {
    expect(
      plotGridRowLabel(
        "Bible/Plots",
        "Bible/Characters",
        "Bible/Plots/The Missing Letter.md",
        "The Missing Letter"
      )
    ).toBe(`${PLOT_GRID_PLOT_LABEL_PREFIX}The Missing Letter`);
    expect(
      plotGridRowLabel(
        "Bible/Plots",
        "Bible/Characters",
        "Bible/Characters/Mara Vell.md",
        "Mara Vell"
      )
    ).toBe(`${PLOT_GRID_CHARACTER_LABEL_PREFIX}Mara Vell`);
    expect(
      plotGridRowLabel(
        "Bible/Plots",
        "Bible/Characters",
        "Bible/Other/Elsewhere.md",
        "Elsewhere"
      )
    ).toBe("Elsewhere");
  });

  it("treats a shared folder as plots when settings are stale", () => {
    // Equal folders are rejected by the project settings; if such a value is
    // read anyway, plots are checked first so labels stay deterministic.
    expect(
      plotGridRowLabel(
        "Bible/Plots",
        "Bible/Plots",
        "Bible/Plots/Mara Vell.md",
        "Mara Vell"
      )
    ).toBe(`${PLOT_GRID_PLOT_LABEL_PREFIX}Mara Vell`);
    expect(
      plotGridRowLabel(
        "/Bible/Plots/",
        "Bible/Plots",
        "Bible/Plots/Mara Vell.md",
        "Mara Vell"
      )
    ).toBe(`${PLOT_GRID_PLOT_LABEL_PREFIX}Mara Vell`);
  });

  it("accepts configured display names or full label prefixes", () => {
    const args = [
      "Bible/Plots",
      "Bible/Characters",
      "Bible/Plots/Main.md",
      "Main",
    ] as const;

    expect(plotGridRowLabel(...args, "Thread", "Cast")).toBe(
      `(Thread)\nMain`
    );
    expect(plotGridRowLabel(...args, "(Thread)\n", "(Cast)\n")).toBe(
      `(Thread)\nMain`
    );
    expect(
      plotGridRowLabel(...args, "(Thread)", "(Cast)")
    ).toBe(`(Thread)\nMain`);
  });

  it("gives plots precedence when the directories are nested", () => {
    // Characters are nested inside plots, so both file.inFolder checks match.
    const nested = ["Bible/Plots", "Bible/Plots/Characters"] as const;
    expect(
      plotGridRowLabel(
        nested[0],
        nested[1],
        "Bible/Plots/Characters/Mara Vell.md",
        "Mara Vell"
      )
    ).toBe(`${PLOT_GRID_PLOT_LABEL_PREFIX}Mara Vell`);
  });
});

describe("plot grid row property normalization", () => {
  it("accepts note-prefixed and bare plot-grid IDs", () => {
    expect(plotGridRowProperty("note.plotgrid_act_1")).toEqual({
      id: "note.plotgrid_act_1",
      rawKey: "plotgrid_act_1",
    });
    expect(plotGridRowProperty("plotgrid_act_1")).toEqual({
      id: "plotgrid_act_1",
      rawKey: "plotgrid_act_1",
    });
    expect(
      plotGridRowProperty("plotgrid_chapter_1_arrival")
    ).toEqual({
      id: "plotgrid_chapter_1_arrival",
      rawKey: "plotgrid_chapter_1_arrival",
    });
  });

  it("rejects file, formula, and non-plot-grid note properties", () => {
    expect(plotGridRowProperty("file.name")).toBeNull();
    expect(plotGridRowProperty("formula.plotgrid_row_label")).toBeNull();
    expect(plotGridRowProperty("note.other")).toBeNull();
    expect(plotGridRowProperty("other")).toBeNull();
    expect(plotGridRowProperty("plotgridNotOurs")).toBeNull();
  });
});

describe("plot grid column ordering", () => {
  const plots = "Bible/Plots";
  const characters = "Bible/Characters";

  it("groups plots before characters and leaves other paths last", () => {
    expect(plotGridRowGroup(plots, characters, "Bible/Plots/a.md")).toBe(0);
    expect(plotGridRowGroup(plots, characters, "Bible/Characters/b.md")).toBe(
      1
    );
    expect(plotGridRowGroup(plots, characters, "Bible/Other/c.md")).toBe(2);
  });

  it("uses plot precedence for nested directories and one group for equal dirs", () => {
    expect(
      plotGridRowGroup(
        "Bible/Plots",
        "Bible/Plots/Characters",
        "Bible/Plots/Characters/b.md"
      )
    ).toBe(0);
    expect(
      plotGridRowGroup("Bible/Plots", "Bible/Plots", "Bible/Plots/b.md")
    ).toBe(0);
    expect(
      plotGridRowGroup("/Bible/Plots/", "Bible/Plots", "Bible/Plots/b.md")
    ).toBe(0);
  });

  it("orders the example columns plots first, then characters", () => {
    const rows = [
      { path: "Bible/Characters/Mara Vell.md", name: "Mara Vell" },
      { path: "Bible/Plots/The Rival Heir.md", name: "The Rival Heir" },
      { path: "Bible/Characters/Elias Thorn.md", name: "Elias Thorn" },
      {
        path: "Bible/Plots/The Missing Letter.md",
        name: "The Missing Letter",
      },
      {
        path: "Bible/Plots/The Gathering Storm.md",
        name: "The Gathering Storm",
      },
    ];

    const ordered = rows
      .slice()
      .sort((left, right) =>
        comparePlotGridRows(plots, characters, left, right)
      )
      .map((row) => row.name);

    expect(ordered).toEqual([
      "The Gathering Storm",
      "The Missing Letter",
      "The Rival Heir",
      "Elias Thorn",
      "Mara Vell",
    ]);
  });

  it("puts a Main plot first, then the other plots, then characters", () => {
    const rows = [
      { path: "Bible/Characters/Mara Vell.md", name: "Mara Vell" },
      { path: "Bible/Plots/The Rival Heir.md", name: "The Rival Heir" },
      { path: "Bible/Plots/main.md", name: "main" },
      { path: "Bible/Plots/A Plot.md", name: "A Plot" },
    ];

    const ordered = rows
      .slice()
      .sort((left, right) =>
        comparePlotGridRows(plots, characters, left, right)
      )
      .map((row) => row.name);

    expect(ordered).toEqual(["main", "A Plot", "The Rival Heir", "Mara Vell"]);
  });

  it("sorts alphabetically when the directories are the same", () => {
    expect(
      comparePlotGridRows(
        "Bible/Plots",
        "Bible/Plots",
        { path: "Bible/Plots/B.md", name: "B" },
        { path: "Bible/Plots/A.md", name: "A" }
      )
    ).toBeGreaterThan(0);
  });
});

describe("plot grid Base rendering", () => {
  it("uses the configured display names in the row-label formula", () => {
    const { app } = makeWorld(["Books/My/Bible/Plots/a.md"]);
    const draft = makeDraft({
      scenes: HIERARCHY,
      plotsDisplayName: "Threads",
      charactersDisplayName: "Cast",
    });

    const rendered = renderPlotGridBase(app, draft);

    expect(rendered).toContain('file.asLink("(Thread)\\n" + file.name)');
    expect(rendered).toContain('file.asLink("(Cast)\\n" + file.name)');
    expect(rendered).toContain("    name: 'Thread Grid'");
    expect(rendered).toContain("    name: 'Thread Grid (Table)'");
  });

  it("renders one filter, only prefixed columns, a sort, and display names", () => {
    const { app } = makeWorld(["Books/My/Bible/Plots/a.md"]);
    const draft = makeDraft({
      plotGridPlotsDir: "/Bible/Plots",
      plotGridCharactersDir: "/Bible/Plots",
      scenes: HIERARCHY,
    });

    expect(renderPlotGridBase(app, draft)).toBe(
      [
        "filters: 'file.inFolder(\"Books/My/Bible/Plots\")'",
        "formulas:",
        "  plotgrid_row_rank: |-",
        "    if(file.inFolder(\"Books/My/Bible/Plots\"), if(file.basename.lower() == \"main\", 0, 1), if(file.inFolder(\"Books/My/Bible/Plots\"), 2, 3))",
        "views:",
        "  - type: longform-plotgrid",
        "    name: 'Subplot Grid'",
        "    plotsDir: 'Books/My/Bible/Plots'",
        "    charactersDir: 'Books/My/Bible/Plots'",
        "    levels:",
        "      - label: 'All'",
        "        value: 'all'",
        "        properties:",
        "          - note.plotgrid_act1",
        "          - note.plotgrid_act2",
        "          - note.plotgrid_chapter_1",
        "          - note.plotgrid_chapter_2",
        "          - note.plotgrid_chapter_3",
        "          - note.plotgrid_scene_1",
        "          - note.plotgrid_scene_2",
        "          - note.plotgrid_scene_3",
        "          - note.plotgrid_scene_4",
        "      - label: '0 - (act1, act2)'",
        "        value: '0'",
        "        properties:",
        "          - note.plotgrid_act1",
        "          - note.plotgrid_act2",
        "      - label: '1 - (chapter 1, chapter 2, chapter 3)'",
        "        value: '1'",
        "        properties:",
        "          - note.plotgrid_chapter_1",
        "          - note.plotgrid_chapter_2",
        "          - note.plotgrid_chapter_3",
        "      - label: '2 - (scene 1, scene 2, scene 3, …)'",
        "        value: '2'",
        "        properties:",
        "          - note.plotgrid_scene_1",
        "          - note.plotgrid_scene_2",
        "          - note.plotgrid_scene_3",
        "          - note.plotgrid_scene_4",
        "    order:",
        "      - file.name",
        "      - note.plotgrid_act1",
        "      - note.plotgrid_act2",
        "      - note.plotgrid_chapter_1",
        "      - note.plotgrid_chapter_2",
        "      - note.plotgrid_chapter_3",
        "      - note.plotgrid_scene_1",
        "      - note.plotgrid_scene_2",
        "      - note.plotgrid_scene_3",
        "      - note.plotgrid_scene_4",
        "    sort:",
        "      - property: formula.plotgrid_row_rank",
        "        direction: ASC",
        "      - property: file.name",
        "        direction: ASC",
        "  - type: table",
        "    name: 'Subplot Grid (Table)'",
        "    order:",
        "      - file.name",
        "      - note.plotgrid_act1",
        "      - note.plotgrid_act2",
        "      - note.plotgrid_chapter_1",
        "      - note.plotgrid_chapter_2",
        "      - note.plotgrid_chapter_3",
        "      - note.plotgrid_scene_1",
        "      - note.plotgrid_scene_2",
        "      - note.plotgrid_scene_3",
        "      - note.plotgrid_scene_4",
        "    sort:",
        "      - property: formula.plotgrid_row_rank",
        "        direction: ASC",
        "      - property: file.name",
        "        direction: ASC",
        "properties:",
        "  note.plotgrid_act1:",
        '    displayName: "act1"',
        "  note.plotgrid_act2:",
        '    displayName: "act2"',
        "  note.plotgrid_chapter_1:",
        '    displayName: "chapter 1"',
        "  note.plotgrid_chapter_2:",
        '    displayName: "chapter 2"',
        "  note.plotgrid_chapter_3:",
        '    displayName: "chapter 3"',
        "  note.plotgrid_scene_1:",
        '    displayName: "scene 1"',
        "  note.plotgrid_scene_2:",
        '    displayName: "scene 2"',
        "  note.plotgrid_scene_3:",
        '    displayName: "scene 3"',
        "  note.plotgrid_scene_4:",
        '    displayName: "scene 4"',
        "",
      ].join("\n")
    );
  });

  it("does not emit an inherits map", () => {
    const { app } = makeWorld(["Books/My/Bible/Plots/a.md"]);
    const rendered =
      renderPlotGridBase(app, makeDraft({ scenes: HIERARCHY })) ?? "";
    expect(rendered).not.toContain("inherits:");
  });

  it("renders a row-label formula first for separate directories", () => {
    const { app } = makeWorld([
      "Books/My/Bible/Plots/a.md",
      "Books/My/Bible/Characters/b.md",
    ]);
    const draft = makeDraft({
      plotGridPlotsDir: "/Bible/Plots",
      plotGridCharactersDir: "/Bible/Characters",
      scenes: [{ title: "act1", indent: 0 }],
    });

    expect(renderPlotGridBase(app, draft)).toBe(
      [
        "filters:",
        "  or:",
        '    - \'file.inFolder("Books/My/Bible/Plots")\'',
        '    - \'file.inFolder("Books/My/Bible/Characters")\'',
        "formulas:",
        "  plotgrid_row_rank: |-",
        '    if(file.inFolder("Books/My/Bible/Plots"), if(file.basename.lower() == "main", 0, 1), if(file.inFolder("Books/My/Bible/Characters"), 2, 3))',
        "  plotgrid_row_label: |-",
        "    if(file.inFolder(\"Books/My/Bible/Plots\"), file.asLink(\"(Subplot)\\n\" + file.name), if(file.inFolder(\"Books/My/Bible/Characters\"), file.asLink(\"(Character)\\n\" + file.name), file.asLink()))",
        "views:",
        "  - type: longform-plotgrid",
        "    name: 'Subplot Grid'",
        "    plotsDir: 'Books/My/Bible/Plots'",
        "    charactersDir: 'Books/My/Bible/Characters'",
        "    levels:",
        "      - label: 'All'",
        "        value: 'all'",
        "        properties:",
        "          - note.plotgrid_act1",
        "      - label: '0 - (act1)'",
        "        value: '0'",
        "        properties:",
        "          - note.plotgrid_act1",
        "    order:",
        "      - formula.plotgrid_row_label",
        "      - note.plotgrid_act1",
        "    sort:",
        "      - property: formula.plotgrid_row_rank",
        "        direction: ASC",
        "      - property: file.name",
        "        direction: ASC",
        "  - type: table",
        "    name: 'Subplot Grid (Table)'",
        "    order:",
        "      - formula.plotgrid_row_label",
        "      - note.plotgrid_act1",
        "    sort:",
        "      - property: formula.plotgrid_row_rank",
        "        direction: ASC",
        "      - property: file.name",
        "        direction: ASC",
        "properties:",
        "  formula.plotgrid_row_label:",
        '    displayName: "Name"',
        "  note.plotgrid_act1:",
        '    displayName: "act1"',
        "",
      ].join("\n")
    );
  });

  it("emits the transposed custom view first and the native table second", () => {
    const { app } = makeWorld(["Books/My/Bible/Plots/a.md"]);
    const draft = makeDraft({
      plotGridPlotsDir: "/Bible/Plots",
      plotGridCharactersDir: "/Bible/Plots",
      scenes: [{ title: "act1", indent: 0 }],
    });

    const rendered = renderPlotGridBase(app, draft) ?? "";
    const customView = rendered.indexOf("- type: longform-plotgrid");
    const tableView = rendered.indexOf("- type: table");
    expect(customView).toBeGreaterThanOrEqual(0);
    expect(tableView).toBeGreaterThan(customView);
    expect(rendered).toContain("plotsDir: 'Books/My/Bible/Plots'");
    expect(rendered).toContain("charactersDir: 'Books/My/Bible/Plots'");
    expect(rendered).toContain(
      "filters: 'file.inFolder(\"Books/My/Bible/Plots\")'"
    );
    expect(rendered).toContain('    displayName: "act1"');
  });

  it("checks nested plots before characters in the formula", () => {
    const { app } = makeWorld([
      "Books/My/Bible/Plots/a.md",
      "Books/My/Bible/Plots/Characters/b.md",
    ]);
    const draft = makeDraft({
      plotGridPlotsDir: "/Bible/Plots",
      plotGridCharactersDir: "/Bible/Plots/Characters",
      scenes: [{ title: "act1", indent: 0 }],
    });

    const rendered = renderPlotGridBase(app, draft) ?? "";
    const plotCheck = rendered.indexOf(
      'file.inFolder("Books/My/Bible/Plots")'
    );
    const characterCheck = rendered.indexOf(
      'file.inFolder("Books/My/Bible/Plots/Characters")'
    );
    expect(plotCheck).toBeGreaterThanOrEqual(0);
    expect(characterCheck).toBeGreaterThan(plotCheck);
    expect(rendered).toContain("      - formula.plotgrid_row_label\n");
    expect(rendered).not.toContain("      - file.name\n");
  });

  it("returns null when there are no levels or no row notes", () => {
    const empty = makeWorld([]);
    expect(
      renderPlotGridBase(
        empty.app,
        makeDraft({ scenes: [{ title: "act1", indent: 0 }] })
      )
    ).toBeNull();

    const rows = makeWorld(["Books/My/Bible/Plots/a.md"]);
    expect(
      renderPlotGridBase(rows.app, makeDraft({ scenes: [] }))
    ).toBeNull();

    const noRows = makeWorld([]);
    expect(
      renderPlotGridBase(
        noRows.app,
        makeDraft({ scenes: [{ title: "act1", indent: 0 }] })
      )
    ).toBeNull();
  });
});

describe("plot grid key writes", () => {
  it("adds only missing keys, in one write per note", async () => {
    const { app, frontmatter, writes } = makeWorld([
      "Books/My/Bible/Plots/a.md",
      "Books/My/Bible/Characters/b.md",
    ]);
    frontmatter.set("Books/My/Bible/Plots/a.md", {
      plotgrid_act1: "already set",
      unrelated: "keep me",
    });

    await ensurePlotGridData(app, makeDraft({ scenes: HIERARCHY }));

    expect(writes).toEqual([
      "Books/My/Bible/Plots/a.md",
      "Books/My/Bible/Characters/b.md",
    ]);
    expect(frontmatter.get("Books/My/Bible/Plots/a.md")).toEqual({
      plotgrid_act1: "already set",
      unrelated: "keep me",
      plotgrid_act2: "",
      plotgrid_chapter_1: "",
      plotgrid_chapter_2: "",
      plotgrid_chapter_3: "",
      plotgrid_scene_1: "",
      plotgrid_scene_2: "",
      plotgrid_scene_3: "",
      plotgrid_scene_4: "",
    });
    expect(frontmatter.get("Books/My/Bible/Characters/b.md")).toEqual({
      plotgrid_act1: "",
      plotgrid_act2: "",
      plotgrid_chapter_1: "",
      plotgrid_chapter_2: "",
      plotgrid_chapter_3: "",
      plotgrid_scene_1: "",
      plotgrid_scene_2: "",
      plotgrid_scene_3: "",
      plotgrid_scene_4: "",
    });
  });

  it("preserves other-level keys and adds missing current-level keys", async () => {
    const path = "Books/My/Bible/Plots/a.md";
    const { app, frontmatter, writes } = makeWorld([path]);
    frontmatter.set(path, {
      plotgrid_scene_1_the_train: "old level",
      plotgrid_scene_8_the_return: "old level",
      plotgrid_act_1_the_beginning: "already set",
      title: "The Missing Letter",
      unrelated: "keep me",
    });

    await ensurePlotGridData(
      app,
      makeDraft({ scenes: LEVEL_ZERO_SCENES })
    );

    expect(writes).toEqual([path]);
    expect(frontmatter.get(path)).toEqual({
      plotgrid_scene_1_the_train: "old level",
      plotgrid_scene_8_the_return: "old level",
      plotgrid_act_1_the_beginning: "already set",
      title: "The Missing Letter",
      unrelated: "keep me",
      plotgrid_act_2_the_choice: "",
    });
    expect(Object.keys(frontmatter.get(path) ?? {})).toEqual([
      "plotgrid_scene_1_the_train",
      "plotgrid_scene_8_the_return",
      "plotgrid_act_1_the_beginning",
      "title",
      "unrelated",
      "plotgrid_act_2_the_choice",
    ]);
  });

  it("migrates values from legacy ancestor-path keys and removes them", async () => {
    const path = "Books/My/Bible/Plots/a.md";
    const { app, frontmatter, writes } = makeWorld([path]);
    frontmatter.set(path, {
      plotgrid_act1__chapter_1: "first value",
      plotgrid_act1__chapter_2: "",
      plotgrid_act1__chapter_1__scene_1: "deep scene",
      plotgrid_act2__chapter_3: "third value",
      title: "The Missing Letter",
      unrelated: "keep me",
    });

    await ensurePlotGridData(app, makeDraft({ scenes: HIERARCHY }));

    expect(writes).toEqual([path]);
    expect(frontmatter.get(path)).toEqual({
      title: "The Missing Letter",
      unrelated: "keep me",
      plotgrid_chapter_1: "first value",
      plotgrid_chapter_2: "",
      plotgrid_chapter_3: "third value",
      plotgrid_scene_1: "deep scene",
      plotgrid_act1: "",
      plotgrid_act2: "",
      plotgrid_scene_2: "",
      plotgrid_scene_3: "",
      plotgrid_scene_4: "",
    });
    // Every level's legacy ancestor-path key was migrated, not just one level.
    expect(frontmatter.get(path)).not.toHaveProperty(
      "plotgrid_act1__chapter_1__scene_1"
    );
  });

  it("does not overwrite a non-empty current key when migrating", async () => {
    const path = "Books/My/Bible/Plots/a.md";
    const { app, frontmatter } = makeWorld([path]);
    frontmatter.set(path, {
      plotgrid_act1__chapter_1: "legacy value",
      plotgrid_act1__chapter_2: "legacy value",
      plotgrid_chapter_1: "current value",
      plotgrid_chapter_2: "",
    });

    await ensurePlotGridData(app, makeDraft({ scenes: HIERARCHY }));

    expect(frontmatter.get(path)).toEqual({
      // The skipped legacy key keeps its value instead of being deleted.
      plotgrid_act1__chapter_1: "legacy value",
      plotgrid_chapter_1: "current value",
      plotgrid_chapter_2: "legacy value",
      plotgrid_act1: "",
      plotgrid_act2: "",
      plotgrid_chapter_3: "",
      plotgrid_scene_1: "",
      plotgrid_scene_2: "",
      plotgrid_scene_3: "",
      plotgrid_scene_4: "",
    });
  });

  it("migrates legacy collision suffixes to the new suffix keys", async () => {
    const path = "Books/My/Bible/Plots/a.md";
    const { app, frontmatter } = makeWorld([path]);
    frontmatter.set(path, {
      plotgrid_act_1__chapter_1: "first",
      plotgrid_act_1__chapter_1_2: "second",
    });

    await ensurePlotGridData(
      app,
      makeDraft({
        scenes: [
          { title: "Act 1", indent: 0 },
          { title: "Chapter 1", indent: 1 },
          { title: "Chapter 1", indent: 1 },
        ],
      })
    );

    expect(frontmatter.get(path)).toEqual({
      plotgrid_chapter_1: "first",
      plotgrid_chapter_1_2: "second",
      plotgrid_act_1: "",
    });
  });

  it("overwrites empty containers but keeps non-empty values when migrating", async () => {
    const path = "Books/My/Bible/Plots/a.md";
    const { app, frontmatter } = makeWorld([path]);
    frontmatter.set(path, {
      plotgrid_act1__chapter_1: "moved",
      plotgrid_chapter_1: [],
      plotgrid_act1__chapter_2: "legacy kept",
      plotgrid_chapter_2: { nested: true },
    });

    await ensurePlotGridData(app, makeDraft({ scenes: HIERARCHY }));

    const migrated = frontmatter.get(path) ?? {};
    expect(migrated.plotgrid_chapter_1).toBe("moved");
    expect(migrated).not.toHaveProperty("plotgrid_act1__chapter_1");
    expect(migrated.plotgrid_chapter_2).toEqual({ nested: true });
    expect(migrated.plotgrid_act1__chapter_2).toBe("legacy kept");
  });

  it("writes node fallback keys for nodes without a usable slug", async () => {
    const path = "Books/My/Bible/Plots/a.md";
    const { app, frontmatter } = makeWorld([path]);

    await ensurePlotGridData(
      app,
      makeDraft({
        scenes: [
          { title: "!!!", indent: 0 },
          { title: "???", indent: 0 },
        ],
      })
    );

    expect(frontmatter.get(path)).toEqual({
      plotgrid_node: "",
      plotgrid_node_2: "",
    });
  });

  it("does not remove keys outside the current level's columns", async () => {
    const path = "Books/My/Bible/Plots/a.md";
    const { app, frontmatter, writes } = makeWorld([path]);
    const initial = {
      plotgrid_act_1_the_beginning: "",
      plotgrid_act_2_the_choice: "",
      plotgrid_custom_note: "keep",
      plotgridNotOurs: "custom",
      some_plotgrid_key: "custom",
    };
    frontmatter.set(path, { ...initial });

    await ensurePlotGridData(
      app,
      makeDraft({ scenes: LEVEL_ZERO_SCENES })
    );

    expect(writes).toHaveLength(0);
    expect(frontmatter.get(path)).toEqual(initial);
  });

  it("does not write a note whose prefixed keys are already clean", async () => {
    const path = "Books/My/Bible/Plots/a.md";
    const { app, frontmatter, writes } = makeWorld([path]);
    const initial = {
      plotgrid_act_1_the_beginning: "kept",
      plotgrid_act_2_the_choice: "",
      title: "The Missing Letter",
    };
    frontmatter.set(path, { ...initial });

    await ensurePlotGridData(
      app,
      makeDraft({ scenes: LEVEL_ZERO_SCENES })
    );

    expect(writes).toHaveLength(0);
    expect(frontmatter.get(path)).toEqual(initial);
  });

  it("settles once every key is present", async () => {
    const { app, writes } = makeWorld(["Books/My/Bible/Plots/a.md"]);
    const draft = makeDraft({ scenes: HIERARCHY });

    await ensurePlotGridData(app, draft);
    expect(writes).toHaveLength(1);

    await ensurePlotGridData(app, draft);
    expect(writes).toHaveLength(1);
  });

  it("adds every level's keys at once while preserving existing values", async () => {
    const path = "Books/My/Bible/Plots/a.md";
    const { app, frontmatter, writes } = makeWorld([path]);
    const existing = {
      plotgrid_scene_1: "scene one",
      plotgrid_scene_2: "scene two",
      plotgrid_scene_3: "scene three",
      plotgrid_scene_4: "scene four",
      plotgrid_chapter_1: "chapter one",
      plotgrid_act1: "act one",
    };
    frontmatter.set(path, { ...existing });

    await ensurePlotGridData(app, makeDraft({ scenes: HIERARCHY }));

    expect(frontmatter.get(path)).toEqual({
      ...existing,
      plotgrid_act2: "",
      plotgrid_chapter_2: "",
      plotgrid_chapter_3: "",
    });
    expect(writes).toHaveLength(1);

    // A settled note is not rewritten.
    await ensurePlotGridData(app, makeDraft({ scenes: HIERARCHY }));
    expect(writes).toHaveLength(1);
  });
});

describe("plot grid derived columns", () => {
  it("falls back to node for empty or unsupported titles and suffixes collisions", () => {
    const columns = plotGridColumns(
      [
        { title: "!!!", indent: 0 },
        { title: "???", indent: 0 },
        { title: "   ", indent: 0 },
        { title: "Act 1", indent: 0 },
      ],
      0
    );

    expect(columns.map((column) => column.key)).toEqual([
      "plotgrid_node",
      "plotgrid_node_2",
      "plotgrid_node_3",
      "plotgrid_act_1",
    ]);
    // Titles are kept verbatim for display even when the slug is empty.
    expect(columns[0].title).toBe("!!!");
  });

  it("returns the deepest level's columns", () => {
    expect(
      plotGridDeepestColumns(HIERARCHY).map((column) => column.key)
    ).toEqual([
      "plotgrid_scene_1",
      "plotgrid_scene_2",
      "plotgrid_scene_3",
      "plotgrid_scene_4",
    ]);
    expect(plotGridDeepestColumns([])).toEqual([]);
    expect(
      plotGridDeepestColumns([{ title: "Only", indent: 0 }]).map(
        (column) => column.key
      )
    ).toEqual(["plotgrid_only"]);
  });
});

describe("plot grid directory helpers", () => {
  it("treats the vault root as containing everything and checks boundaries", () => {
    expect(isInsidePlotGridDirectory("", "Anything/At/All.md")).toBe(true);
    expect(isInsidePlotGridDirectory("/", "Anything.md")).toBe(true);
    expect(
      isInsidePlotGridDirectory("Bible/Plots", "Bible/Plots/A.md")
    ).toBe(true);
    expect(isInsidePlotGridDirectory("Bible/Plots", "Bible/Plots")).toBe(true);
    expect(
      isInsidePlotGridDirectory("/Bible/Plots/", "Bible/Plots/Deep/A.md")
    ).toBe(true);
    // A prefix is not containment unless it ends on a path separator.
    expect(isInsidePlotGridDirectory("Bible/Plots", "Bible/Plots2/A.md")).toBe(
      false
    );
    expect(isInsidePlotGridDirectory("Bible/Plots", "Bible/A.md")).toBe(false);
  });

  it("joins conflict descriptions into one message", () => {
    expect(
      plotGridDirectoryConflictMessage([
        { first: "scene", second: "plots", kind: "nested" },
        { first: "plots", second: "characters", kind: "same" },
      ])
    ).toBe(
      "Scene folder and Subplot folder must not be nested inside one another. " +
        "Subplot folder and Character folder must not be the same folder."
    );
    expect(plotGridDirectoryConflictMessage([])).toBe("");
  });

  it("uses the fallback for a blank configured folder", () => {
    const { app } = makeWorld([]);
    expect(
      resolvePlotGridDirectory(app, makeDraft(), "", "Fallback/Plots")
    ).toBe("Books/My/Fallback/Plots");
    expect(
      resolvePlotGridDirectory(app, makeDraft(), "   ", "Fallback/Plots")
    ).toBe("Books/My/Fallback/Plots");
    expect(
      resolvePlotGridDirectory(app, makeDraft(), null, "Fallback/Plots")
    ).toBe("Books/My/Fallback/Plots");
    expect(
      resolvePlotGridDirectory(app, makeDraft(), undefined, "Fallback/Plots")
    ).toBe("Books/My/Fallback/Plots");
  });

  it("falls back to the vault path's parent when the project note is missing", () => {
    const { app } = makeWorld([], "Books/My/Book.md");
    expect(
      resolvePlotGridDirectory(
        app,
        makeDraft({ vaultPath: "Other/Project/Book.md" }),
        "Bible/Plots",
        "Subplots"
      )
    ).toBe("Other/Project/Bible/Plots");
  });
});

describe("plot grid output paths", () => {
  async function resultFor(outputPath: string) {
    const world = makeWorld(["Books/My/Bible/Plots/a.md"]);
    const result = await writePlotGrid(
      world.app,
      makeDraft({
        scenes: [{ title: "Act 1", indent: 0 }],
        plotGridOutputPath: outputPath,
      })
    );
    return { result, world };
  }

  it("uses the default path when the setting is empty", async () => {
    const { result, world } = await resultFor("");
    expect(result.path).toBe("Books/My/Build/Book_plotgrid.base");
    expect(world.generated.has(result.path ?? "")).toBe(true);
  });

  it("resolves a relative configured path with $1 and appends the extension", async () => {
    const { result, world } = await resultFor("Output/$1-grid");
    expect(result.path).toBe("Books/My/Output/Book-grid.base");
    expect(world.generated.has("Books/My/Output/Book-grid.base")).toBe(true);
  });

  it("treats a leading slash as vault-relative and keeps an existing extension", async () => {
    const leading = await resultFor("/Shared/$1-grid.base");
    expect(leading.result.path).toBe("Shared/Book-grid.base");

    const withExtension = await resultFor("Output/Custom.base");
    expect(withExtension.result.path).toBe("Books/My/Output/Custom.base");
  });
});

describe("writePlotGrid", () => {
  it("skips with invalid-dirs when the configured folders conflict", async () => {
    const { app, frontmatter, writes, generated } = makeWorld([
      "Books/My/Bible/Plots/a.md",
    ]);
    const result = await writePlotGrid(
      app,
      makeDraft({
        sceneFolder: "/",
        scenes: [{ title: "act1", indent: 0 }],
      })
    );

    expect(result.reason).toBe("invalid-dirs");
    expect(result.written).toBe(false);
    expect(result.conflicts).toEqual([
      { first: "scene", second: "plots", kind: "nested" },
      { first: "scene", second: "characters", kind: "nested" },
    ]);
    expect(writes).toHaveLength(0);
    expect(frontmatter.get("Books/My/Bible/Plots/a.md")).toEqual({});
    expect(generated.size).toBe(0);
  });

  it("does nothing when disabled", async () => {
    const { app, frontmatter, writes, generated } = makeWorld([
      "Books/My/Bible/Plots/a.md",
    ]);
    const result = await writePlotGrid(
      app,
      makeDraft({ plotGridEnabled: false, scenes: HIERARCHY })
    );

    expect(result).toEqual({
      written: false,
      reason: "disabled",
      columns: 0,
      notes: 0,
      path: null,
    });
    expect(writes).toHaveLength(0);
    expect(frontmatter.get("Books/My/Bible/Plots/a.md")).toEqual({});
    expect(generated.size).toBe(0);
  });

  it("skips the Base when there are no columns or notes", async () => {
    const noColumns = makeWorld(["Books/My/Bible/Plots/a.md"]);
    expect(
      (await writePlotGrid(noColumns.app, makeDraft({ scenes: [] }))).reason
    ).toBe("no-columns");
    expect(noColumns.generated.size).toBe(0);

    const noNotes = makeWorld([]);
    expect(
      (
        await writePlotGrid(
          noNotes.app,
          makeDraft({ scenes: [{ title: "act1", indent: 0 }] })
        )
      ).reason
    ).toBe("no-notes");
    expect(noNotes.generated.size).toBe(0);
  });

  it("ensures keys and writes the Base at the configured path", async () => {
    const { app, frontmatter, generated } = makeWorld([
      "Books/My/Bible/Plots/a.md",
    ]);
    const result = await writePlotGrid(
      app,
      makeDraft({ scenes: [{ title: "Act 1", indent: 0 }] })
    );

    expect(result).toEqual({
      written: true,
      reason: "written",
      columns: 1,
      notes: 1,
      path: "Books/My/Build/Book_plotgrid.base",
    });
    expect(frontmatter.get("Books/My/Bible/Plots/a.md")).toEqual({
      plotgrid_act_1: "",
    });
    expect(generated.get("Books/My/Build/Book_plotgrid.base")).toContain(
      "  - type: longform-plotgrid"
    );
    expect(generated.get("Books/My/Build/Book_plotgrid.base")).toContain(
      "  - type: table"
    );
  });
});
