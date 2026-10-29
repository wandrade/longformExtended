import { beforeEach, describe, expect, it } from "vitest";

import { TFile, type App } from "obsidian";
import { get } from "svelte/store";

import {
  auxiliaryFolder,
  auxiliaryKindLabel,
  auxiliaryKindPluralLabel,
  auxiliaryNoteFiles,
  auxiliaryNotePath,
  findAuxiliaryNote,
  insertAuxiliaryNote,
  reconcileAuxiliaryList,
  uniqueAuxiliaryNoteName,
} from "../../src/model/auxiliary-notes";
import { drafts as draftsStore, pluginSettings } from "../../src/model/stores";
import {
  DEFAULT_SETTINGS,
  type Draft,
  type IndentedScene,
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

type AuxWorld = {
  app: App;
  files: Map<string, TFile>;
  written: Map<string, string>;
  created: string[];
  opened: string[];
  folders: Set<string>;
};

function fileAt(path: string): TFile {
  const file = new TFile();
  const name = path.slice(path.lastIndexOf("/") + 1);
  Object.assign(file, {
    path,
    name,
    basename: name.replace(/\.md$/i, ""),
    parent: { path: path.slice(0, Math.max(0, path.lastIndexOf("/"))) },
  });
  return file;
}

function makeWorld(paths: string[]): AuxWorld {
  const files = new Map<string, TFile>();
  for (const path of paths) {
    files.set(path, fileAt(path));
  }
  const project = fileAt("Books/My/Book.md");
  Object.assign(project, { parent: { path: "Books/My" } });
  const written = new Map<string, string>();
  const created: string[] = [];
  const opened: string[] = [];
  const folders = new Set<string>();
  const templates = new Map<string, unknown>([
    ["Templates/Plot.md", fileAt("Templates/Plot.md")],
    ["Templates/Character.md", fileAt("Templates/Character.md")],
    ["Templates/Global Plot.md", fileAt("Templates/Global Plot.md")],
  ]);

  const app = {
    vault: {
      getAbstractFileByPath: (path: string) =>
        path === "Books/My/Book.md"
          ? project
          : files.get(path) ?? templates.get(path) ?? null,
      getMarkdownFiles: () =>
        Array.from(files.values()).filter((file) =>
          file.path.toLowerCase().endsWith(".md")
        ),
      createFolder: async (path: string) => {
        folders.add(path);
      },
      create: async (path: string, contents: string) => {
        const file = fileAt(path);
        files.set(path, file);
        created.push(path);
        written.set(path, contents);
        return file;
      },
      adapter: {
        exists: async (path: string) =>
          folders.has(path) || files.has(path) || templates.has(path),
        read: async (path: string) => written.get(path) ?? "",
        write: async (path: string, contents: string) => {
          written.set(path, contents);
        },
      },
    },
    workspace: {
      openLinkText: (path: string) => {
        opened.push(path);
      },
    },
    fileManager: {
      processFrontMatter: async (
        _file: TFile,
        update: (frontmatter: Record<string, unknown>) => void
      ) => {
        update({});
      },
    },
    plugins: {
      getPlugin: (id: string) =>
        id === "templater-obsidian"
          ? {
              templater: {
                create_running_config: (template: any, file: any) => ({
                  template,
                  file,
                }),
                read_and_parse_template: async (config: any) =>
                  `from ${config.template.path}`,
              },
            }
          : null,
    },
  } as unknown as App;

  return { app, files, written, created, opened, folders };
}

beforeEach(() => {
  pluginSettings.set({
    ...DEFAULT_SETTINGS,
    plotTemplate: null,
    characterTemplate: null,
  });
  draftsStore.set([]);
});

describe("auxiliary labels and folders", () => {
  it("labels each kind in singular and plural form", () => {
    expect(auxiliaryKindLabel("plots")).toBe("subplot");
    expect(auxiliaryKindLabel("plots", true)).toBe("Subplot");
    expect(auxiliaryKindLabel("characters")).toBe("character");
    expect(auxiliaryKindLabel("characters", true)).toBe("Character");
    expect(auxiliaryKindPluralLabel("plots")).toBe("subplots");
    expect(auxiliaryKindPluralLabel("plots", true)).toBe("Subplots");
    expect(auxiliaryKindPluralLabel("characters")).toBe("characters");
    expect(auxiliaryKindPluralLabel("characters", true)).toBe("Characters");
  });

  it("resolves folders relative to the project", () => {
    const { app } = makeWorld([]);
    expect(auxiliaryFolder(app, makeDraft(), "plots")).toBe(
      "Books/My/Bible/Plots"
    );
    expect(auxiliaryFolder(app, makeDraft(), "characters")).toBe(
      "Books/My/Bible/Characters"
    );
    expect(
      auxiliaryFolder(
        app,
        makeDraft({
          plotGridPlotsDir: "",
          plotGridCharactersDir: "/Bible/Other",
        }),
        "plots"
      )
    ).toBe("Books/My/Subplots");
    expect(
      auxiliaryFolder(
        app,
        makeDraft({ plotGridCharactersDir: "/Bible/Other" }),
        "characters"
      )
    ).toBe("Books/My/Bible/Other");
  });
});

describe("auxiliary folder scanning", () => {
  it("scans recursively, excludes the project note, and dedupes basenames", () => {
    const { app } = makeWorld([
      "Books/My/Book.md",
      "Books/My/Bible/Plots/Hero.md",
      "Books/My/Bible/Plots/Sub/Hero.md",
      "Books/My/Bible/Plots/Sub/Ally.md",
      "Books/My/Bible/Plots/notes.txt",
      "Books/My/Bible/Characters/Villain.md",
      "Elsewhere/Other.md",
    ]);

    expect(auxiliaryNoteFiles(app, makeDraft(), "plots")).toEqual([
      { name: "Hero", path: "Books/My/Bible/Plots/Hero.md" },
      { name: "Ally", path: "Books/My/Bible/Plots/Sub/Ally.md" },
    ]);
    expect(auxiliaryNoteFiles(app, makeDraft(), "characters")).toEqual([
      { name: "Villain", path: "Books/My/Bible/Characters/Villain.md" },
    ]);
  });

  it("returns the real path for an existing note and the new-note path otherwise", () => {
    const { app } = makeWorld(["Books/My/Bible/Plots/Sub/Hero.md"]);
    const draft = makeDraft();

    expect(auxiliaryNotePath(app, draft, "plots", "Hero")).toBe(
      "Books/My/Bible/Plots/Sub/Hero.md"
    );
    expect(auxiliaryNotePath(app, draft, "plots", "New")).toBe(
      "Books/My/Bible/Plots/New.md"
    );
    expect(auxiliaryNotePath(app, draft, "characters", "New")).toBe(
      "Books/My/Bible/Characters/New.md"
    );
  });

  it("finds the next free Untitled name across the overlay and folder", () => {
    const { app } = makeWorld([
      "Books/My/Bible/Plots/Untitled.md",
      "Books/My/Bible/Plots/Untitled 2.md",
    ]);
    const draft = makeDraft({
      plots: [{ title: "Untitled 1", indent: 0 }],
    });

    expect(uniqueAuxiliaryNoteName(app, draft, "plots")).toBe("Untitled 3");
    expect(uniqueAuxiliaryNoteName(app, makeDraft(), "characters")).toBe(
      "Untitled"
    );
  });
});

describe("findAuxiliaryNote", () => {
  it("locates an overlay entry for a plot or character path", () => {
    const { app } = makeWorld([]);
    const plotDraft = makeDraft({ plots: [{ title: "Main", indent: 2 }] });
    const characterDraft = makeDraft({
      characters: [{ title: "Hero", indent: 1 }],
    });
    const drafts: Draft[] = [plotDraft, characterDraft];

    expect(
      findAuxiliaryNote(app, "Books/My/Bible/Plots/Main.md", drafts)
    ).toEqual({
      draft: plotDraft,
      kind: "plots",
      index: 0,
      currentIndent: 2,
    });
    expect(
      findAuxiliaryNote(app, "Books/My/Bible/Characters/Hero.md", drafts)
    ).toEqual({
      draft: characterDraft,
      kind: "characters",
      index: 0,
      currentIndent: 1,
    });
  });

  it("ignores notes outside the folders, unknown names, and single drafts", () => {
    const { app } = makeWorld([]);
    const draft = makeDraft({ plots: [{ title: "Main", indent: 0 }] });
    const single: Draft = {
      format: "single",
      title: "Book",
      titleInFrontmatter: true,
      draftTitle: null,
      vaultPath: "Books/My/Single.md",
      workflow: null,
    };

    expect(
      findAuxiliaryNote(app, "Books/My/Bible/Plots/Unknown.md", [draft])
    ).toBeNull();
    expect(findAuxiliaryNote(app, "Elsewhere/Main.md", [draft])).toBeNull();
    expect(
      findAuxiliaryNote(app, "Books/My/Bible/Plots/Main.md", [single])
    ).toBeNull();
  });
});

describe("insertAuxiliaryNote", () => {
  it("creates the note in the configured folder with the project template", async () => {
    const { app, created, written, opened } = makeWorld([]);
    const draft = makeDraft({
      plotTemplate: "Templates/Plot.md",
      plotGridPlotsDir: "Bible/Plots",
    });
    draftsStore.set([draft]);

    await insertAuxiliaryNote(
      app,
      draftsStore,
      draft,
      "plots",
      "New Plot",
      { at: "end", relativeTo: null },
      true
    );

    expect(created).toEqual(["Books/My/Bible/Plots/New Plot.md"]);
    expect(written.get("Books/My/Bible/Plots/New Plot.md")).toBe(
      "from Templates/Plot.md"
    );
    expect(opened).toEqual(["Books/My/Bible/Plots/New Plot.md"]);
    expect(get(draftsStore)[0]).toMatchObject({
      plots: [{ title: "New Plot", indent: 0 }],
    });
  });

  it("uses a custom group's own template and not the built-in fallbacks", async () => {
    pluginSettings.set({
      ...DEFAULT_SETTINGS,
      plotTemplate: "Templates/Global Plot.md",
      characterTemplate: "Templates/Character.md",
    });
    const { app, written } = makeWorld([]);
    const draft = makeDraft({
      noteGroups: [
        {
          name: "Locations",
          folder: "Bible/Locations",
          template: "Templates/Plot.md",
          entries: [],
        },
      ],
    });
    draftsStore.set([draft]);

    await insertAuxiliaryNote(
      app,
      draftsStore,
      draft,
      "custom:Locations",
      "Harbor",
      { at: "end", relativeTo: null },
      false
    );

    expect(written.get("Books/My/Bible/Locations/Harbor.md")).toBe(
      "from Templates/Plot.md"
    );
    expect(get(draftsStore)[0]).toMatchObject({
      noteGroups: [
        {
          name: "Locations",
          folder: "Bible/Locations",
          template: "Templates/Plot.md",
          entries: [{ title: "Harbor", indent: 0 }],
        },
      ],
    });
  });

  it("falls back to the global template for each kind", async () => {
    pluginSettings.set({
      ...DEFAULT_SETTINGS,
      plotTemplate: "Templates/Global Plot.md",
      characterTemplate: "Templates/Character.md",
    });
    const { app, written } = makeWorld([]);
    const draft = makeDraft();

    await insertAuxiliaryNote(
      app,
      draftsStore,
      draft,
      "plots",
      "Plot",
      { at: "end", relativeTo: null },
      false
    );
    await insertAuxiliaryNote(
      app,
      draftsStore,
      draft,
      "characters",
      "Character",
      { at: "end", relativeTo: null },
      false
    );

    expect(written.get("Books/My/Bible/Plots/Plot.md")).toBe(
      "from Templates/Global Plot.md"
    );
    expect(written.get("Books/My/Bible/Characters/Character.md")).toBe(
      "from Templates/Character.md"
    );
  });

  it("inserts at the requested position with the relative indent and dedupes", async () => {
    const { app } = makeWorld([]);
    const draft = makeDraft({
      plots: [
        { title: "First", indent: 0 },
        { title: "Second", indent: 1 },
        { title: "New Plot", indent: 0 },
        { title: "Third", indent: 0 },
      ],
    });
    draftsStore.set([draft]);
    const store = draftsStore;

    await insertAuxiliaryNote(
      app,
      store,
      draft,
      "plots",
      "New Plot",
      { at: "before", relativeTo: 1 },
      false
    );

    expect(get(store)[0]).toMatchObject({
      plots: [
        { title: "First", indent: 0 },
        { title: "New Plot", indent: 1 },
        { title: "Second", indent: 1 },
        { title: "Third", indent: 0 },
      ],
    });

    await insertAuxiliaryNote(
      app,
      store,
      draft,
      "characters",
      "New Character",
      { at: "after", relativeTo: 0 },
      false
    );
    expect(get(store)[0]).toMatchObject({
      characters: [{ title: "New Character", indent: 0 }],
    });
  });
});

describe("reconcileAuxiliaryList", () => {
  it("keeps overlay order and indentation when notes still exist", () => {
    const overlay: IndentedScene[] = [
      { title: "Villain", indent: 0 },
      { title: "Henchman", indent: 1 },
      { title: "Hero", indent: 0 },
    ];

    expect(reconcileAuxiliaryList(overlay, ["Hero", "Villain", "Henchman"]))
      .toEqual({ list: overlay, dirty: false });
  });

  it("prunes deleted notes and appends new notes alphabetically at root", () => {
    const overlay: IndentedScene[] = [
      { title: "Gone", indent: 1 },
      { title: "Hero", indent: 0 },
    ];

    expect(
      reconcileAuxiliaryList(overlay, [
        "Villain",
        "Hero",
        "Ally",
      ])
    ).toEqual({
      list: [
        { title: "Hero", indent: 0 },
        { title: "Ally", indent: 0 },
        { title: "Villain", indent: 0 },
      ],
      dirty: true,
    });
  });

  it("drops duplicate overlay entries", () => {
    const overlay: IndentedScene[] = [
      { title: "Hero", indent: 0 },
      { title: "Hero", indent: 1 },
    ];

    expect(reconcileAuxiliaryList(overlay, ["Hero"])).toEqual({
      list: [{ title: "Hero", indent: 0 }],
      dirty: true,
    });
  });
});
