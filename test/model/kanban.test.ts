import { beforeEach, describe, expect, it } from "vitest";

import { TFile, type App } from "obsidian";

import {
  buildKanban,
  parseKanbanColumns,
  writeKanbanBase,
  writeKanbanWordCounts,
  type KanbanResult,
} from "../../src/model/kanban";
import { drafts as draftsStore, draftWordCounts } from "../../src/model/stores";
import {
  KANBAN_HELPER_TAG,
  KANBAN_INCORRECT_LABEL,
  KANBAN_UNASSIGNED_LABEL,
  type MultipleSceneDraft,
} from "../../src/model/types";

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
    plotGridPlotsDir: "Bible/Plots",
    plotGridCharactersDir: "Bible/Characters",
    ...overrides,
  };
}

type KanbanWorld = {
  app: App;
  frontmatter: Map<string, Record<string, unknown>>;
  writes: string[];
  generated: Map<string, string>;
};

function fileAt(path: string): TFile {
  const file = new TFile();
  const name = path.slice(path.lastIndexOf("/") + 1);
  Object.assign(file, {
    path,
    name,
    basename: name.replace(/\.md$/i, ""),
  });
  return file;
}

function makeWorld(paths: string[]): KanbanWorld {
  const files = new Map<string, TFile>();
  const frontmatter = new Map<string, Record<string, unknown>>();
  for (const path of paths) {
    files.set(path, fileAt(path));
    frontmatter.set(path, {});
  }
  const project = fileAt("Books/My/Book.md");
  Object.assign(project, { parent: { path: "Books/My" } });
  const writes: string[] = [];
  const generated = new Map<string, string>();
  const folders = new Set<string>();

  const app = {
    vault: {
      getAbstractFileByPath: (path: string) =>
        path === "Books/My/Book.md" ? project : files.get(path) ?? null,
      getMarkdownFiles: () => Array.from(files.values()),
      createFolder: async (path: string) => {
        folders.add(path);
      },
      adapter: {
        exists: async (path: string) =>
          generated.has(path) || folders.has(path) || files.has(path),
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
        const next = { ...(frontmatter.get(file.path) ?? {}) };
        callback(next);
        frontmatter.set(file.path, next);
        writes.push(file.path);
      },
    },
  } as unknown as App;

  return { app, frontmatter, writes, generated };
}

beforeEach(() => {
  draftsStore.set([]);
  draftWordCounts.set({});
});

describe("parseKanbanColumns", () => {
  it("splits plain and quoted column titles", () => {
    expect(parseKanbanColumns("Planned Draft Reviewed")).toEqual([
      "Planned",
      "Draft",
      "Reviewed",
    ]);
    expect(
      parseKanbanColumns(`"In Progress" 'On Hold' Done "It's Mine"`)
    ).toEqual(["In Progress", "On Hold", "Done", "It's Mine"]);
    expect(parseKanbanColumns("  Planned   Draft  ")).toEqual([
      "Planned",
      "Draft",
    ]);
  });

  it("skips empty titles", () => {
    expect(parseKanbanColumns("")).toEqual([]);
    expect(parseKanbanColumns("   ")).toEqual([]);
    expect(parseKanbanColumns('"One" "" "Two"')).toEqual(["One", "Two"]);
  });
});

describe("buildKanban", () => {
  it("groups statuses, reports invalid ones, and tracks unassigned notes", async () => {
    const world = makeWorld([
      "Books/My/Scenes/Group Scene A.md",
      "Books/My/Scenes/Group Scene B.md",
      "Books/My/Scenes/Group Scene C.md",
    ]);
    world.frontmatter.set("Books/My/Scenes/Group Scene A.md", { status: "Draft" });
    world.frontmatter.set("Books/My/Scenes/Group Scene B.md", { status: "Nope" });
    const draft = makeDraft({
      kanbanShowUnassigned: true,
      kanbanIncludePlots: false,
      scenes: [
        { title: "Act", indent: 0 },
        { title: "Group Scene A", indent: 1 },
        { title: "Group Scene B", indent: 1 },
        { title: "Group Scene C", indent: 1 },
      ],
    });
    draftsStore.set([draft]);

    const result = await buildKanban(world.app, draft);

    expect(result.columns).toEqual(["Planned", "Draft", "Reviewed"]);
    expect(result.cards["Draft"].map((card) => card.title)).toEqual([
      "Group Scene A",
    ]);
    expect(result.errors).toEqual([
      { sceneTitle: "Group Scene B", status: "Nope" },
    ]);
    expect(result.unassigned.map((card) => card.title)).toEqual([
      "Group Scene C",
    ]);
    expect(result.hasAnyStatus).toBe(true);

    expect(world.frontmatter.get("Books/My/Scenes/Group Scene A.md")).toEqual({
      status: "Draft",
      [KANBAN_HELPER_TAG]: "Draft",
    });
    expect(world.frontmatter.get("Books/My/Scenes/Group Scene B.md")).toEqual({
      status: "Nope",
      [KANBAN_HELPER_TAG]: KANBAN_INCORRECT_LABEL,
    });
    expect(world.frontmatter.get("Books/My/Scenes/Group Scene C.md")).toEqual({
      [KANBAN_HELPER_TAG]: KANBAN_UNASSIGNED_LABEL,
    });
  });

  it("falls back to the default columns when none are configured", async () => {
    const world = makeWorld(["Books/My/Scenes/Default Scene.md"]);
    const draft = makeDraft({
      kanbanColumns: "",
      kanbanIncludePlots: false,
      scenes: [{ title: "Default Scene", indent: 0 }],
    });
    draftsStore.set([draft]);

    const result = await buildKanban(world.app, draft);

    expect(result.columns).toEqual(["Planned", "Draft", "Reviewed"]);
  });

  it("includes subplot notes only when configured", async () => {
    const paths = [
      "Books/My/Scenes/Include Scene.md",
      "Books/My/Bible/Plots/Include Plot.md",
      "Books/My/Bible/Characters/Include Hero.md",
    ];

    const included = makeWorld(paths);
    included.frontmatter.set("Books/My/Scenes/Include Scene.md", {
      status: "Draft",
    });
    included.frontmatter.set("Books/My/Bible/Plots/Include Plot.md", {
      status: "Draft",
    });
    included.frontmatter.set("Books/My/Bible/Characters/Include Hero.md", {
      status: "Draft",
    });
    const includeDraft = makeDraft({
      kanbanIncludePlots: true,
      scenes: [{ title: "Include Scene", indent: 0 }],
    });
    draftsStore.set([includeDraft]);

    const withPlots = await buildKanban(included.app, includeDraft);
    expect(
      withPlots.cards["Draft"].map((card) => card.title).sort()
    ).toEqual(["Include Plot", "Include Scene"]);

    const excluded = makeWorld(paths);
    excluded.frontmatter.set("Books/My/Scenes/Include Scene.md", {
      status: "Draft",
    });
    excluded.frontmatter.set("Books/My/Bible/Plots/Include Plot.md", {
      status: "Draft",
    });
    const excludeDraft = makeDraft({
      kanbanIncludePlots: false,
      scenes: [{ title: "Include Scene", indent: 0 }],
    });
    draftsStore.set([excludeDraft]);

    const withoutPlots = await buildKanban(excluded.app, excludeDraft);
    expect(withoutPlots.cards["Draft"].map((card) => card.title)).toEqual([
      "Include Scene",
    ]);
  });

  it("reconciles a Bases drag into the real status and snaps invalid drops back", async () => {
    const world = makeWorld(["Books/My/Scenes/Drag Scene.md"]);
    world.frontmatter.set("Books/My/Scenes/Drag Scene.md", { status: "Draft" });
    const draft = makeDraft({
      kanbanShowUnassigned: true,
      kanbanIncludePlots: false,
      scenes: [{ title: "Drag Scene", indent: 0 }],
    });
    draftsStore.set([draft]);

    await buildKanban(world.app, draft);
    expect(world.frontmatter.get("Books/My/Scenes/Drag Scene.md")).toEqual({
      status: "Draft",
      [KANBAN_HELPER_TAG]: "Draft",
    });

    // A Bases drop changes the helper while the status stays put.
    world.frontmatter.set("Books/My/Scenes/Drag Scene.md", {
      status: "Draft",
      [KANBAN_HELPER_TAG]: "Reviewed",
    });
    const dragged = await buildKanban(world.app, draft);
    expect(dragged.cards["Reviewed"].map((card) => card.title)).toEqual([
      "Drag Scene",
    ]);
    expect(world.frontmatter.get("Books/My/Scenes/Drag Scene.md")).toEqual({
      status: "Reviewed",
      [KANBAN_HELPER_TAG]: "Reviewed",
    });

    // A drop to an invalid helper keeps the current status.
    world.frontmatter.set("Books/My/Scenes/Drag Scene.md", {
      status: "Reviewed",
      [KANBAN_HELPER_TAG]: "Bogus",
    });
    const snapped = await buildKanban(world.app, draft);
    expect(snapped.cards["Reviewed"].map((card) => card.title)).toEqual([
      "Drag Scene",
    ]);
    expect(world.frontmatter.get("Books/My/Scenes/Drag Scene.md")).toEqual({
      status: "Reviewed",
      [KANBAN_HELPER_TAG]: "Reviewed",
    });
  });

  it("turns a drop into Unassigned into a missing status", async () => {
    const world = makeWorld(["Books/My/Scenes/Unassigned Scene.md"]);
    world.frontmatter.set("Books/My/Scenes/Unassigned Scene.md", {
      status: "Draft",
    });
    const draft = makeDraft({
      kanbanShowUnassigned: true,
      kanbanIncludePlots: false,
      scenes: [{ title: "Unassigned Scene", indent: 0 }],
    });
    draftsStore.set([draft]);
    await buildKanban(world.app, draft);

    world.frontmatter.set("Books/My/Scenes/Unassigned Scene.md", {
      status: "Draft",
      [KANBAN_HELPER_TAG]: KANBAN_UNASSIGNED_LABEL,
    });
    const result = await buildKanban(world.app, draft);

    expect(result.unassigned.map((card) => card.title)).toEqual([
      "Unassigned Scene",
    ]);
    expect(
      world.frontmatter.get("Books/My/Scenes/Unassigned Scene.md")
    ).toEqual({
      [KANBAN_HELPER_TAG]: KANBAN_UNASSIGNED_LABEL,
    });
  });
});

describe("writeKanbanBase", () => {
  const result: KanbanResult = {
    title: "Book",
    columns: ["Planned", "Draft"],
    cards: { Planned: [], Draft: [] },
    unassigned: [{ title: "Scene C", path: "Books/My/Scenes/Group Scene C.md" }],
    errors: [{ sceneTitle: "Scene B", status: "Nope" }],
    hasAnyStatus: true,
  };

  it("does nothing when no note has a status", async () => {
    const { app, generated } = makeWorld([]);
    await writeKanbanBase(app, makeDraft(), {
      ...result,
      hasAnyStatus: false,
    });
    expect(generated.size).toBe(0);
  });

  it("includes plots, their word-count formula, and the extra groups", async () => {
    const { app, generated } = makeWorld([]);
    await writeKanbanBase(
      app,
      makeDraft({
        kanbanIncludePlots: true,
        kanbanSaveWordCounts: true,
        kanbanShowUnassigned: true,
      }),
      result
    );

    const contents =
      generated.get("Books/My/Build/Book_kanban.base") ?? "";
    expect(contents).toContain("filters:");
    expect(contents).toContain("  and:");
    expect(contents).toContain("    - or:");
    expect(contents).toContain(
      `'file.inFolder("Books/My/Scenes")'`
    );
    expect(contents).toContain(
      `'file.inFolder("Books/My/Bible/Plots")'`
    );
    expect(contents).toContain(
      `'!note.${KANBAN_HELPER_TAG}.isEmpty()'`
    );
    expect(contents).toContain("formulas:");
    expect(contents).toContain("kanban_word_count");
    expect(contents).toContain(
      `if(file.inFolder("Books/My/Bible/Plots"), "", wordCount)`
    );
    expect(contents).toContain("formula.kanban_word_count");
    expect(contents).toContain(`- "${KANBAN_INCORRECT_LABEL}"`);
    expect(contents).toContain(`- "${KANBAN_UNASSIGNED_LABEL}"`);
    expect(contents).toContain('displayName: "Word Count"');
  });

  it("uses the scene folder only and note.wordCount without plots", async () => {
    const { app, generated } = makeWorld([]);
    await writeKanbanBase(
      app,
      makeDraft({
        kanbanIncludePlots: false,
        kanbanSaveWordCounts: true,
      }),
      { ...result, errors: [], unassigned: [] }
    );

    const contents =
      generated.get("Books/My/Build/Book_kanban.base") ?? "";
    expect(contents).toContain(
      `    - 'file.inFolder("Books/My/Scenes")'`
    );
    expect(contents).not.toContain("    - or:");
    expect(contents).not.toContain("formulas:");
    expect(contents).not.toContain("kanban_word_count");
    expect(contents).toContain("note.wordCount");
    expect(contents).not.toContain(KANBAN_INCORRECT_LABEL);
    expect(contents).not.toContain(KANBAN_UNASSIGNED_LABEL);
  });

  it("omits the word-count column when saving counts is disabled", async () => {
    const { app, generated } = makeWorld([]);
    await writeKanbanBase(
      app,
      makeDraft({
        kanbanIncludePlots: true,
        kanbanSaveWordCounts: false,
      }),
      result
    );

    const contents =
      generated.get("Books/My/Build/Book_kanban.base") ?? "";
    expect(contents).not.toContain("wordCount");
    expect(contents).not.toContain("kanban_word_count");
    expect(contents).not.toContain("    order:");
  });
});

describe("writeKanbanWordCounts", () => {
  const result: KanbanResult = {
    title: "Book",
    columns: ["Draft", "Reviewed"],
    cards: {
      Draft: [
        { title: "Scene A", path: "Books/My/Scenes/Group Scene A.md" },
        { title: "Plot A", path: "Books/My/Bible/Plots/Plot A.md" },
        { title: "Scene A", path: "Books/My/Scenes/Group Scene A.md" },
      ],
      Reviewed: [
        { title: "Scene B", path: "Books/My/Scenes/Group Scene B.md" },
      ],
    },
    unassigned: [{ title: "Scene C", path: "Books/My/Scenes/Group Scene C.md" }],
    errors: [],
    hasAnyStatus: true,
  };

  it("writes counts for scenes, not plots or unassigned notes", async () => {
    const { app, frontmatter, writes } = makeWorld([
      "Books/My/Scenes/Group Scene A.md",
      "Books/My/Scenes/Group Scene B.md",
      "Books/My/Scenes/Group Scene C.md",
      "Books/My/Bible/Plots/Plot A.md",
    ]);
    frontmatter.set("Books/My/Scenes/Group Scene A.md", { wordCount: 100 });
    draftWordCounts.set({
      "Books/My/Book.md": {
        "Scene A": 100,
        "Scene B": 200,
        "Scene C": 50,
        "Plot A": 300,
      },
    });
    const draft = makeDraft();

    await writeKanbanWordCounts(app, draft, result);

    expect(writes).toEqual(["Books/My/Scenes/Group Scene B.md"]);
    expect(frontmatter.get("Books/My/Scenes/Group Scene A.md")).toEqual({
      wordCount: 100,
    });
    expect(frontmatter.get("Books/My/Scenes/Group Scene B.md")).toEqual({
      wordCount: 200,
    });
    expect(frontmatter.get("Books/My/Bible/Plots/Plot A.md")).toEqual({});
    expect(frontmatter.get("Books/My/Scenes/Group Scene C.md")).toEqual({});
  });

  it("does nothing when counts are disabled or unavailable", async () => {
    const { app, writes } = makeWorld([
      "Books/My/Scenes/Group Scene A.md",
      "Books/My/Scenes/Group Scene B.md",
    ]);
    draftWordCounts.set({
      "Books/My/Book.md": { "Scene A": 100, "Scene B": 200 },
    });

    await writeKanbanWordCounts(
      app,
      makeDraft({ kanbanEnabled: false }),
      result
    );
    await writeKanbanWordCounts(
      app,
      makeDraft({ kanbanSaveWordCounts: false }),
      result
    );
    draftWordCounts.set({});
    await writeKanbanWordCounts(app, makeDraft(), result);

    expect(writes).toEqual([]);
  });
});
