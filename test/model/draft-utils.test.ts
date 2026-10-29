import { describe, expect, it } from "vitest";

import { TFile, type App } from "obsidian";
import { get, writable } from "svelte/store";

import {
  addUnknownScenes,
  applyDefaultTimeframe,
  arraysToIndentedScenes,
  draftForStoredPath,
  draftTitle,
  formatSceneNumber,
  indentedScenesToArrays,
  numberScenes,
  setDraftOnFrontmatterObject,
} from "src/model/draft-utils";
import {
  DEFAULT_KANBAN_INCLUDE_PLOTS,
  DEFAULT_PLOT_GRID_PLOTS_DIR,
  type Draft,
  type MultipleSceneDraft,
  type SingleSceneDraft,
} from "src/model/types";

function makeSceneDraft(
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
    kanbanIncludePlots: DEFAULT_KANBAN_INCLUDE_PLOTS,
    kanbanOutputPath: "Build/$1_kanban.base",
    timelineEnabled: true,
    timelineOutputPath: "Build/$1_timeline.md",
    plotGridEnabled: true,
    plotGridOutputPath: "Base/$1_plotgrid.base",
    plotGridPlotsDir: DEFAULT_PLOT_GRID_PLOTS_DIR,
    plotGridCharactersDir: "Characters",
    autocompileMinutes: null,
    ...overrides,
  };
}

describe("arraysToIndentedScenes", () => {
  it("converts nested scenes without mutating the input", () => {
    const raw = [
      "act 1",
      ["chapter 1", ["scene 1"], ["scene 2"]],
      ["chapter 2", "scene 3"],
    ];
    const snapshot = JSON.parse(JSON.stringify(raw));
    const expected = [
      { title: "act 1", indent: 0 },
      { title: "chapter 1", indent: 1 },
      { title: "scene 1", indent: 2 },
      { title: "scene 2", indent: 2 },
      { title: "chapter 2", indent: 1 },
      { title: "scene 3", indent: 1 },
    ];

    expect(arraysToIndentedScenes(raw)).toEqual(expected);

    // The metadata cache's frontmatter array must survive repeated syncs.
    expect(raw).toEqual(snapshot);
    expect(raw[1]).toEqual(["chapter 1", ["scene 1"], ["scene 2"]]);
    expect(arraysToIndentedScenes(raw)).toEqual(expected);
  });

  it("handles deeper nesting", () => {
    const raw = ["a", ["b", ["c", ["d"]]]];
    const snapshot = JSON.parse(JSON.stringify(raw));

    expect(arraysToIndentedScenes(raw)).toEqual([
      { title: "a", indent: 0 },
      { title: "b", indent: 1 },
      { title: "c", indent: 2 },
      { title: "d", indent: 3 },
    ]);
    expect(raw).toEqual(snapshot);
  });

  it("leaves empty arrays alone", () => {
    const raw: unknown[] = [];

    expect(arraysToIndentedScenes(raw)).toEqual([]);
    expect(raw).toEqual([]);
  });

  it("round-trips a contiguous indented hierarchy", () => {
    const indented = [
      { title: "act 1", indent: 0 },
      { title: "chapter 1", indent: 1 },
      { title: "scene 1", indent: 2 },
      { title: "scene 2", indent: 2 },
      { title: "chapter 2", indent: 1 },
      { title: "scene 3", indent: 2 },
      { title: "act 2", indent: 0 },
    ];

    const nested = indentedScenesToArrays(indented);
    expect(nested).toEqual([
      "act 1",
      [
        "chapter 1",
        ["scene 1", "scene 2"],
        "chapter 2",
        ["scene 3"],
      ],
      "act 2",
    ]);
    expect(arraysToIndentedScenes(nested)).toEqual(indented);
  });
});

describe("indentedScenesToArrays", () => {
  it("nests and un-nests on indent changes without mutating the input", () => {
    const indented = [
      { title: "a", indent: 0 },
      { title: "b", indent: 1 },
      { title: "c", indent: 2 },
      { title: "d", indent: 1 },
      { title: "e", indent: 0 },
    ];
    const snapshot = JSON.parse(JSON.stringify(indented));

    expect(indentedScenesToArrays(indented)).toEqual([
      "a",
      ["b", ["c"], "d"],
      "e",
    ]);
    expect(indented).toEqual(snapshot);
  });

  it("returns an empty array for an empty hierarchy", () => {
    expect(indentedScenesToArrays([])).toEqual([]);
  });
});

describe("scene numbering", () => {
  it("numbers nested scenes and resets deeper counters on ascent", () => {
    const scenes = [
      { title: "act 1", indent: 0 },
      { title: "chapter 1", indent: 1 },
      { title: "scene 1", indent: 2 },
      { title: "scene 2", indent: 2 },
      { title: "chapter 2", indent: 1 },
      { title: "scene 3", indent: 2 },
      { title: "act 2", indent: 0 },
      { title: "chapter 3", indent: 1 },
    ];

    const numbered = numberScenes(scenes);

    expect(numbered.map((scene) => scene.numbering)).toEqual([
      [1],
      [1, 1],
      [1, 1, 1],
      [1, 1, 2],
      [1, 2],
      [1, 2, 1],
      [2],
      [2, 1],
    ]);
    expect(numbered.map((scene) => formatSceneNumber(scene.numbering))).toEqual(
      ["1", "1.1", "1.1.1", "1.1.2", "1.2", "1.2.1", "2", "2.1"]
    );
    // The original scenes are untouched.
    expect(scenes[0]).toEqual({ title: "act 1", indent: 0 });
  });

  it("fills skipped indent ranks with leading ones", () => {
    // Indent 2 follows indent 0 without an indent-1 scene.
    expect(
      numberScenes([
        { title: "top", indent: 0 },
        { title: "deep", indent: 2 },
        { title: "deep again", indent: 2 },
      ]).map((scene) => formatSceneNumber(scene.numbering))
    ).toEqual(["1", "1.1.1", "1.1.2"]);
  });
});

describe("setDraftOnFrontmatterObject", () => {
  it("writes the project settings without a type flag", () => {
    const obj: Record<string, any> = {
      longform: { plotGridLevel: 2, stale: "remove me" },
      unrelated: "keep",
    };
    const draft = makeSceneDraft({
      titleInFrontmatter: true,
      draftTitle: "Draft One",
      workflow: "Novel",
      scenes: [
        { title: "act", indent: 0 },
        { title: "scene", indent: 1 },
      ],
      plots: [{ title: "Main", indent: 0 }],
      characters: [{ title: "Hero", indent: 0 }],
      sceneTemplate: "Templates/Scene.md",
      plotTemplate: "Templates/Plot.md",
      characterTemplate: "Templates/Character.md",
      kanbanShowUnassigned: true,
      kanbanSaveWordCounts: false,
      kanbanEnabled: false,
      kanbanIncludePlots: false,
      timelineEnabled: false,
      plotGridEnabled: false,
      plotGridPlotsDir: "Subplots",
      plotGridCharactersDir: "Characters",
      ignoredFiles: ["Index.md"],
    });

    setDraftOnFrontmatterObject(obj, draft);

    const longform = obj.longform;
    expect(obj.unrelated).toBe("keep");
    expect(longform).toEqual({
      format: "scenes",
      title: "Book",
      draftTitle: "Draft One",
      workflow: "Novel",
      sceneFolder: "Scenes",
      timeframeTagName: "timeframe",
      timeFormat: "datetime",
      kanbanColumns: "Planned Draft Reviewed",
      kanbanOutputPath: "Build/$1_kanban.base",
      kanbanShowUnassigned: true,
      kanbanSaveWordCounts: false,
      kanbanEnabled: false,
      kanbanIncludePlots: false,
      timelineEnabled: false,
      timelineOutputPath: "Build/$1_timeline.md",
      plotGridEnabled: false,
      plotGridOutputPath: "Base/$1_plotgrid.base",
      plotGridPlotsDir: "Subplots",
      plotGridCharactersDir: "Characters",
      scenes: ["act", ["scene"]],
      plots: ["Main"],
      characters: ["Hero"],
      sceneTemplate: "Templates/Scene.md",
      plotTemplate: "Templates/Plot.md",
      characterTemplate: "Templates/Character.md",
      ignoredFiles: ["Index.md"],
    });
    // The legacy per-note level key is gone, and nothing writes a `type` flag.
    expect(longform).not.toHaveProperty("plotGridLevel");
    expect(longform).not.toHaveProperty("stale");
    expect(longform).not.toHaveProperty("type");
    expect(obj).not.toHaveProperty("type");
  });

  it("omits optional and default-true settings", () => {
    const obj: Record<string, any> = {};
    setDraftOnFrontmatterObject(
      obj,
      makeSceneDraft({
        titleInFrontmatter: false,
        draftTitle: null,
        workflow: null,
        kanbanShowUnassigned: false,
        kanbanSaveWordCounts: true,
        kanbanEnabled: true,
        kanbanIncludePlots: true,
        timelineEnabled: true,
        plotGridEnabled: true,
        sceneTemplate: null,
        plotTemplate: null,
        characterTemplate: null,
        ignoredFiles: null,
      })
    );

    const longform = obj.longform;
    expect(longform).not.toHaveProperty("title");
    expect(longform).not.toHaveProperty("draftTitle");
    expect(longform).not.toHaveProperty("workflow");
    expect(longform).not.toHaveProperty("kanbanShowUnassigned");
    // Default-true flags are only written when disabled.
    expect(longform).not.toHaveProperty("kanbanSaveWordCounts");
    expect(longform).not.toHaveProperty("kanbanEnabled");
    expect(longform).not.toHaveProperty("kanbanIncludePlots");
    expect(longform).not.toHaveProperty("timelineEnabled");
    expect(longform).not.toHaveProperty("plotGridEnabled");
    expect(longform).not.toHaveProperty("sceneTemplate");
    expect(longform).not.toHaveProperty("plotTemplate");
    expect(longform).not.toHaveProperty("characterTemplate");
    expect(longform.ignoredFiles).toBeNull();
  });

  it("writes single-scene drafts without scene-only settings", () => {
    const draft: SingleSceneDraft = {
      format: "single",
      title: "Story",
      titleInFrontmatter: true,
      draftTitle: null,
      vaultPath: "Books/My/Story.md",
      workflow: null,
    };
    const obj: Record<string, any> = {
      longform: { plotGridLevel: 1 },
    };

    setDraftOnFrontmatterObject(obj, draft);

    expect(obj.longform).toEqual({ format: "single", title: "Story" });
    expect(obj.longform).not.toHaveProperty("plotGridLevel");
    expect(obj.longform).not.toHaveProperty("type");
    expect(obj.longform).not.toHaveProperty("scenes");
  });

  it("uses the Subplots folder default and includes subplots by default", () => {
    expect(DEFAULT_PLOT_GRID_PLOTS_DIR).toBe("Subplots");
    expect(DEFAULT_KANBAN_INCLUDE_PLOTS).toBe(true);

    const obj: Record<string, any> = {};
    setDraftOnFrontmatterObject(obj, makeSceneDraft());
    expect(obj.longform.plotGridPlotsDir).toBe("Subplots");
  });
});

describe("draftTitle", () => {
  it("uses the draft title when set and the vault path otherwise", () => {
    expect(draftTitle(makeSceneDraft({ draftTitle: "Part One" }))).toBe(
      "Part One"
    );
    expect(draftTitle(makeSceneDraft({ draftTitle: null }))).toBe(
      "Books/My/Book.md"
    );
  });
});

describe("draftForStoredPath", () => {
  const familiarShadow = makeSceneDraft({
    title: "Familiar Shadow",
    vaultPath: "Familiar Shadow/Familiar Shadow.md",
  });
  const theClearing = makeSceneDraft({
    title: "The Clearing",
    vaultPath: "The Clearing/The Clearing.md",
  });
  const sunny: SingleSceneDraft = {
    format: "single",
    title: "Sunny's Day",
    titleInFrontmatter: true,
    draftTitle: null,
    vaultPath: "Sunny's Day/Sunny's Day.md",
    workflow: null,
  };

  it("keeps an exact path match", () => {
    expect(
      draftForStoredPath(
        "The Clearing/The Clearing.md",
        [familiarShadow, sunny, theClearing]
      )
    ).toBe(theClearing);
  });

  it("finds a project after its folder moved", () => {
    expect(
      draftForStoredPath("Longform/Familiar Shadow/Familiar Shadow.md", [
        familiarShadow,
        sunny,
        theClearing,
      ])
    ).toBe(familiarShadow);
  });

  it("prefers the same parent folder for duplicate filenames", () => {
    const otherBook = makeSceneDraft({
      title: "Other Book",
      vaultPath: "Other Book/Book.md",
    });
    const book = makeSceneDraft({
      title: "Book",
      vaultPath: "Book/Book.md",
    });

    expect(
      draftForStoredPath("Old/Book/Book.md", [otherBook, book])
    ).toBe(book);
  });

  it("selects the first project when no path was saved", () => {
    expect(
      draftForStoredPath(null, [theClearing, sunny, familiarShadow])
    ).toBe(familiarShadow);
  });

  it("falls back to the first project when the old path has no match", () => {
    expect(
      draftForStoredPath("Removed/Old Project/Old Project.md", [
        theClearing,
        familiarShadow,
      ])
    ).toBe(familiarShadow);
  });

  it("returns null when there are no drafts", () => {
    expect(draftForStoredPath("Anything.md", [])).toBeNull();
  });
});

function makeTimeframeWorld(initial: Record<string, unknown> = {}) {
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

describe("applyDefaultTimeframe", () => {
  it("adds an empty timeframe when the timeline is enabled", async () => {
    const world = makeTimeframeWorld();

    await applyDefaultTimeframe(world.app, world.file, makeSceneDraft());

    expect(world.frontmatter).toEqual({ timeframe: "" });
  });

  it("leaves an existing timeframe key alone", async () => {
    const world = makeTimeframeWorld({ timeframe: "04/03/2026 09:30" });

    await applyDefaultTimeframe(world.app, world.file, makeSceneDraft());

    expect(world.frontmatter).toEqual({ timeframe: "04/03/2026 09:30" });
  });

  it("does nothing when the timeline is disabled", async () => {
    const world = makeTimeframeWorld();

    await applyDefaultTimeframe(
      world.app,
      world.file,
      makeSceneDraft({ timelineEnabled: false })
    );

    expect(world.frontmatter).toEqual({});
    expect(world.calls()).toBe(0);
  });
});

function makeAddWorld(
  paths: string[],
  initial: Record<string, Record<string, unknown>> = {}
) {
  const files = new Map<string, TFile>();
  for (const path of paths) {
    const name = path.slice(path.lastIndexOf("/") + 1);
    files.set(
      path,
      Object.assign(new TFile(), {
        path,
        name,
        basename: name.replace(/\.md$/i, ""),
        parent: { path: path.slice(0, Math.max(0, path.lastIndexOf("/"))) },
      })
    );
  }
  const frontmatter = new Map<string, Record<string, unknown>>();
  for (const [path, data] of Object.entries(initial)) {
    frontmatter.set(path, { ...data });
  }
  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => files.get(path) ?? null,
    },
    fileManager: {
      processFrontMatter: async (
        file: TFile,
        callback: (data: Record<string, unknown>) => void
      ) => {
        const data = frontmatter.get(file.path) ?? {};
        callback(data);
        frontmatter.set(file.path, data);
      },
    },
  } as unknown as App;
  return { app, frontmatter };
}

describe("addUnknownScenes", () => {
  const project = "Books/My/Book.md";
  const scenePath = (name: string) => `Books/My/Scenes/${name}.md`;

  it("adds one unknown file and seeds both scene defaults", async () => {
    const { app, frontmatter } = makeAddWorld([project, scenePath("New One")]);
    const draft = makeSceneDraft({
      scenes: [{ title: "First", indent: 0 }],
      unknownFiles: ["New One"],
    });
    const store = writable<Draft[]>([draft]);

    await addUnknownScenes(app, store, draft, ["New One"]);

    expect(get(store)[0]).toMatchObject({
      scenes: [
        { title: "First", indent: 0 },
        { title: "New One", indent: 0 },
      ],
      unknownFiles: [],
    });
    expect(frontmatter.get(scenePath("New One"))).toEqual({
      status: "Planned",
      timeframe: "",
    });
  });

  it("adds every unknown file and never overwrites existing values", async () => {
    const { app, frontmatter } = makeAddWorld(
      [project, scenePath("One"), scenePath("Two")],
      {
        [scenePath("Two")]: { status: "Draft", timeframe: "" },
      }
    );
    const draft = makeSceneDraft({ unknownFiles: ["One", "Two"] });
    const store = writable<Draft[]>([draft]);

    await addUnknownScenes(app, store, draft, draft.unknownFiles);

    const updated = get(store)[0] as MultipleSceneDraft;
    expect(updated.scenes).toEqual([
      { title: "One", indent: 0 },
      { title: "Two", indent: 0 },
    ]);
    expect(updated.unknownFiles).toEqual([]);
    expect(frontmatter.get(scenePath("One"))).toEqual({
      status: "Planned",
      timeframe: "",
    });
    expect(frontmatter.get(scenePath("Two"))).toEqual({
      status: "Draft",
      timeframe: "",
    });
  });

  it("writes nothing when both features are off", async () => {
    const { app, frontmatter } = makeAddWorld([project, scenePath("New One")]);
    const draft = makeSceneDraft({
      unknownFiles: ["New One"],
      kanbanEnabled: false,
      timelineEnabled: false,
    });
    const store = writable<Draft[]>([draft]);

    await addUnknownScenes(app, store, draft, ["New One"]);

    expect((get(store)[0] as MultipleSceneDraft).scenes).toEqual([
      { title: "New One", indent: 0 },
    ]);
    expect(frontmatter.size).toBe(0);
  });
});
