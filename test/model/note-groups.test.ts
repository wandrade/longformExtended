import { beforeEach, describe, expect, it } from "vitest";

import { TFile, type App } from "obsidian";
import { get } from "svelte/store";

import {
  auxiliaryFolder,
  auxiliaryKindLabel,
  auxiliaryKindPluralLabel,
  auxiliaryNoteFiles,
  findAuxiliaryNote,
  insertAuxiliaryNote,
  uniqueAuxiliaryNoteName,
} from "../../src/model/auxiliary-notes";
import {
  customNoteGroupKey,
  describeNoteGroupDirectoryConflict,
  formatNoteGroupNames,
  noteGroupDescriptor,
  noteGroupDescriptors,
  noteGroupDirectories,
  noteGroupDirectoryConflicts,
  noteGroupDirectoryConflictMessage,
  noteGroupDisplayName,
  noteGroupEntries,
  noteGroupFolder,
  noteGroupFolderSetting,
  noteGroupSingularName,
  noteGroupTemplate,
  parseNoteGroupNames,
  parseNoteGroups,
  setNoteGroupEntries,
} from "../../src/model/note-groups";
import {
  drafts as draftsStore,
  pluginSettings,
} from "../../src/model/stores";
import {
  noteGroupDisplayNameSetting,
  reconcileNoteGroups,
} from "../../src/model/store-vault-sync";
import {
  DEFAULT_SETTINGS,
  defaultNoteGroupFolder,
  type Draft,
  type MultipleSceneDraft,
  type NoteGroup,
} from "../../src/model/types";
import { setDraftOnFrontmatterObject } from "../../src/model/draft-utils";

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
    autocompileMinutes: null,
    ...overrides,
  };
}

type World = {
  app: App;
  files: Map<string, TFile>;
  created: string[];
  written: Map<string, string>;
  deleted: string[];
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

function makeWorld(paths: string[]): World {
  const files = new Map<string, TFile>();
  for (const path of paths) {
    files.set(path, fileAt(path));
  }
  const created: string[] = [];
  const written = new Map<string, string>();
  const deleted: string[] = [];
  const folders = new Set<string>();

  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => files.get(path) ?? null,
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
      delete: async (file: TFile) => {
        deleted.push(file.path);
        files.delete(file.path);
      },
      adapter: {
        exists: async (path: string) =>
          folders.has(path) || files.has(path),
        read: async (path: string) => written.get(path) ?? "",
        write: async (path: string, contents: string) => {
          written.set(path, contents);
        },
        remove: async (path: string) => {
          deleted.push(path);
        },
      },
    },
    workspace: {
      openLinkText: (): void => undefined,
    },
    plugins: {
      getPlugin: (): null => null,
    },
  } as unknown as App;

  return { app, files, created, written, deleted, folders };
}

beforeEach(() => {
  pluginSettings.set({ ...DEFAULT_SETTINGS });
  draftsStore.set([]);
});

describe("note group descriptors", () => {
  it("describes the built-ins with defaults and derived singular names", () => {
    const descriptors = noteGroupDescriptors(makeDraft());

    expect(descriptors.map((group) => group.key)).toEqual([
      "scenes",
      "plots",
      "characters",
    ]);
    expect(descriptors.map((group) => group.displayName)).toEqual([
      "Scenes",
      "Subplots",
      "Characters",
    ]);
    expect(descriptors.map((group) => group.singularName)).toEqual([
      "Scene",
      "Subplot",
      "Character",
    ]);
    expect(descriptors.every((group) => !group.custom)).toBe(true);
  });

  it("falls back to the defaults for empty display names", () => {
    const draft = makeDraft({
      sceneDisplayName: "",
      plotsDisplayName: "  ",
      charactersDisplayName: "Cast",
    });

    expect(noteGroupDisplayName(draft, "scenes")).toBe("Scenes");
    expect(noteGroupSingularName(draft, "scenes")).toBe("Scene");
    expect(noteGroupDisplayName(draft, "plots")).toBe("Subplots");
    expect(noteGroupSingularName(draft, "characters")).toBe("Cast");
  });

  it("derives singular names with the ies -> y rule and leaves others alone", () => {
    const draft = makeDraft({
      noteGroups: [
        { name: "Arguments", folder: "Arguments", entries: [] },
        { name: "Stories", folder: "Stories", entries: [] },
        { name: "Magic", folder: "Magic", entries: [] },
      ],
    });

    expect(noteGroupSingularName(draft, customNoteGroupKey("Arguments"))).toBe(
      "Argument"
    );
    expect(noteGroupSingularName(draft, customNoteGroupKey("Stories"))).toBe(
      "Story"
    );
    expect(noteGroupSingularName(draft, customNoteGroupKey("Magic"))).toBe(
      "Magic"
    );
  });

  it("appends custom groups in configured order with their overlays", () => {
    const locations: NoteGroup = {
      name: "Locations",
      folder: "World/Locations",
      entries: [{ title: "Harbor", indent: 0 }],
    };
    const magic: NoteGroup = {
      name: "Magic",
      folder: "Magic",
      entries: [],
    };
    const draft = makeDraft({ noteGroups: [locations, magic] });

    const descriptors = noteGroupDescriptors(draft);
    expect(descriptors.map((group) => group.key)).toEqual([
      "scenes",
      "plots",
      "characters",
      "custom:Locations",
      "custom:Magic",
    ]);
    expect(descriptors[3]).toEqual({
      key: "custom:Locations",
      displayName: "Locations",
      singularName: "Location",
      folder: "World/Locations",
      entries: locations.entries,
      custom: true,
    });
  });

  it("looks a custom group up by its full key, never by parsing the key", () => {
    const group: NoteGroup = {
      name: "Locations",
      folder: "Locations",
      entries: [{ title: "Harbor", indent: 0 }],
    };
    const draft = makeDraft({ noteGroups: [group] });

    expect(customNoteGroupKey("Locations")).toBe("custom:Locations");
    expect(noteGroupDescriptor(draft, "custom:Locations")).toMatchObject({
      key: "custom:Locations",
      displayName: "Locations",
      singularName: "Location",
      custom: true,
    });
    expect(noteGroupDescriptor(draft, "custom:Missing")).toBeNull();
    expect(noteGroupFolderSetting(draft, "custom:Locations")).toBe(
      "Locations"
    );
    expect(noteGroupEntries(draft, "custom:Locations")).toEqual([
      { title: "Harbor", indent: 0 },
    ]);
  });

  it("sets entries in place for built-in and custom groups", () => {
    const draft = makeDraft({
      noteGroups: [{ name: "Locations", folder: "Locations", entries: [] }],
    });
    const entries = [
      { title: "Harbor", indent: 0 },
      { title: "Docks", indent: 1 },
    ];

    setNoteGroupEntries(draft, "scenes", entries);
    setNoteGroupEntries(draft, "custom:Locations", entries);

    expect(draft.scenes).toEqual(entries);
    expect(draft.noteGroups[0].entries).toEqual(entries);
    expect(noteGroupEntries(draft, "custom:Locations")).toEqual(entries);
  });
});

describe("note group name list syntax", () => {
  it("parses quoted and unquoted names like the Kanban column setting", () => {
    expect(
      parseNoteGroupNames('Politics "World Building" \'Magic System\' Magic')
    ).toEqual(["Politics", "World Building", "Magic System", "Magic"]);
    expect(parseNoteGroupNames("   ")).toEqual([]);
  });

  it("quotes names containing whitespace and round-trips", () => {
    const names = ["Politics", "World Building", "Magic"];

    expect(formatNoteGroupNames(names)).toBe(
      'Politics "World Building" Magic'
    );
    expect(parseNoteGroupNames(formatNoteGroupNames(names))).toEqual(names);
  });
});

describe("parsing persisted note groups", () => {
  it("trims names, falls back folders to names, dedupes, and preserves order", () => {
    const parsed = parseNoteGroups([
      { name: "  Locations  ", folder: "  ", entries: ["Harbor"] },
      { name: "Locations", folder: "Duplicates", entries: [] },
      { name: "", folder: "Ignored", entries: [] },
      "malformed",
      { name: "Magic", folder: "World/Magic", entries: ["Spell"] },
    ]);

    expect(parsed).toEqual([
      { name: "Locations", folder: "Locations", entries: [{ title: "Harbor", indent: 0 }] },
      {
        name: "Magic",
        folder: "World/Magic",
        entries: [{ title: "Spell", indent: 0 }],
      },
    ]);
  });

  it("defaults spaced names to underscored folders and reads templates", () => {
    const parsed = parseNoteGroups([
      {
        name: "Magic System",
        entries: [],
        template: "Templates/Magic.md",
      },
    ]);

    expect(parsed).toEqual([
      {
        name: "Magic System",
        folder: defaultNoteGroupFolder("Magic System"),
        template: "Templates/Magic.md",
        entries: [],
      },
    ]);
    expect(defaultNoteGroupFolder("Magic System")).toBe("Magic_System");
  });

  it("reads custom group templates from the draft", () => {
    const draft = makeDraft({
      noteGroups: [
        {
          name: "Magic",
          folder: "Magic",
          template: "Templates/Magic.md",
          entries: [],
        },
      ],
    });

    expect(noteGroupTemplate(draft, "custom:Magic")).toBe(
      "Templates/Magic.md"
    );
    expect(noteGroupTemplate(draft, "custom:Missing")).toBeNull();
  });

  it("reads nested entry overlays and ignores malformed entry arrays", () => {
    expect(
      parseNoteGroups([
        {
          name: "Locations",
          folder: "Locations",
          entries: ["Harbor", ["The Docks"]],
        },
        { name: "Magic", folder: "Magic", entries: "not a list" },
      ])
    ).toEqual([
      {
        name: "Locations",
        folder: "Locations",
        entries: [
          { title: "Harbor", indent: 0 },
          { title: "The Docks", indent: 1 },
        ],
      },
      { name: "Magic", folder: "Magic", entries: [] },
    ]);
  });

  it("returns an empty list for absent or non-array values", () => {
    expect(parseNoteGroups(undefined)).toEqual([]);
    expect(parseNoteGroups(null)).toEqual([]);
    expect(parseNoteGroups({ name: "Locations" })).toEqual([]);
  });
});

describe("display-name persistence", () => {
  it("omits default display names and empty note groups", () => {
    const obj: Record<string, any> = {};
    setDraftOnFrontmatterObject(obj, makeDraft());

    expect(obj.longform).not.toHaveProperty("sceneDisplayName");
    expect(obj.longform).not.toHaveProperty("plotsDisplayName");
    expect(obj.longform).not.toHaveProperty("charactersDisplayName");
    expect(obj.longform).not.toHaveProperty("noteGroups");
  });

  it("persists non-default labels and custom groups, then reads them back", () => {
    const draft = makeDraft({
      sceneDisplayName: "Chapters",
      plotsDisplayName: "Threads",
      charactersDisplayName: "Cast",
      noteGroups: [
        {
          name: "Locations",
          folder: "World/Locations",
          entries: [
            { title: "Harbor", indent: 0 },
            { title: "Docks", indent: 1 },
          ],
        },
        { name: "Magic", folder: "Magic", entries: [] },
      ],
    });
    const obj: Record<string, any> = {};
    setDraftOnFrontmatterObject(obj, draft);

    expect(obj.longform.sceneDisplayName).toBe("Chapters");
    expect(obj.longform.plotsDisplayName).toBe("Threads");
    expect(obj.longform.charactersDisplayName).toBe("Cast");
    expect(obj.longform.noteGroups).toEqual([
      {
        name: "Locations",
        folder: "World/Locations",
        entries: ["Harbor", ["Docks"]],
      },
      { name: "Magic", folder: "Magic", entries: [] },
    ]);

    // Reading the serialized groups reproduces the persisted overlay.
    expect(parseNoteGroups(obj.longform.noteGroups)).toEqual(
      draft.noteGroups
    );
  });

  it("reads missing display-name keys as defaults", () => {
    expect(
      noteGroupDisplayNameSetting(undefined, "Scenes")
    ).toBe("Scenes");
    expect(noteGroupDisplayNameSetting("  ", "Subplots")).toBe(
      "Subplots"
    );
    expect(noteGroupDisplayNameSetting("  Threads ", "Subplots")).toBe(
      "Threads"
    );
  });
});

describe("note group directories", () => {
  it("resolves built-in and custom folders relative to the project", () => {
    const { app } = makeWorld(["Books/My/Book.md"]);
    const draft = makeDraft({
      noteGroups: [
        { name: "Locations", folder: "World/Locations", entries: [] },
      ],
    });

    expect(noteGroupFolder(app, draft, "scenes")).toBe("Books/My/Scenes");
    expect(noteGroupFolder(app, draft, "plots")).toBe(
      "Books/My/Bible/Plots"
    );
    expect(noteGroupFolder(app, draft, "custom:Locations")).toBe(
      "Books/My/World/Locations"
    );
    expect(noteGroupDirectories(app, draft).map((entry) => entry.label)).toEqual(
      ["Scenes", "Subplots", "Characters", "Locations"]
    );
  });

  it("falls back to the group name when the configured folder is empty", () => {
    const { app } = makeWorld(["Books/My/Book.md"]);
    const draft = makeDraft({
      noteGroups: [{ name: "Locations", folder: "", entries: [] }],
    });

    expect(noteGroupFolder(app, draft, "custom:Locations")).toBe(
      "Books/My/Locations"
    );
  });

  it("reports no conflicts for the three distinct built-in folders", () => {
    const { app } = makeWorld(["Books/My/Book.md"]);

    expect(noteGroupDirectoryConflicts(app, makeDraft())).toEqual([]);
  });

  it("detects identical and nested conflicts across four and five groups", () => {
    const { app } = makeWorld(["Books/My/Book.md"]);

    const same = makeDraft({
      noteGroups: [{ name: "Locations", folder: "Bible/Plots", entries: [] }],
    }).noteGroups;
    const sameConflicts = noteGroupDirectoryConflicts(
      app,
      makeDraft({ noteGroups: same })
    );
    expect(sameConflicts).toHaveLength(1);
    expect(sameConflicts[0].kind).toBe("same");
    expect(sameConflicts[0].first.key).toBe("plots");
    expect(sameConflicts[0].second.key).toBe("custom:Locations");

    const nested = makeDraft({
      noteGroups: [
        { name: "World", folder: "World", entries: [] },
        { name: "Cities", folder: "World/Cities", entries: [] },
      ],
    });
    const nestedConflicts = noteGroupDirectoryConflicts(app, nested);
    expect(
      nestedConflicts.map((conflict) => [
        conflict.first.key,
        conflict.second.key,
        conflict.kind,
      ])
    ).toEqual([["custom:World", "custom:Cities", "nested"]]);
  });

  it("treats the vault root as an ancestor of every folder", () => {
    const { app } = makeWorld(["Book.md"]);
    const draft = makeDraft({
      vaultPath: "Book.md",
      sceneFolder: "/",
      noteGroups: [{ name: "Magic", folder: "Magic", entries: [] }],
    });

    const conflicts = noteGroupDirectoryConflicts(app, draft);
    expect(
      conflicts.map((conflict) => [
        conflict.first.key,
        conflict.second.key,
        conflict.kind,
      ])
    ).toEqual([
      ["scenes", "plots", "nested"],
      ["scenes", "characters", "nested"],
      ["scenes", "custom:Magic", "nested"],
    ]);
    expect(conflicts[0].first.path).toBe("");
  });

  it("describes conflicts with the configured display names", () => {
    const { app } = makeWorld(["Books/My/Book.md"]);
    const draft = makeDraft({
      plotsDisplayName: "Threads",
      noteGroups: [{ name: "Locations", folder: "Bible/Plots", entries: [] }],
    });
    const conflicts = noteGroupDirectoryConflicts(app, draft);

    expect(describeNoteGroupDirectoryConflict(conflicts[0])).toBe(
      "Threads and Locations must not be the same folder."
    );
    expect(noteGroupDirectoryConflictMessage(conflicts)).toContain(
      "must not be the same folder"
    );
  });
});

describe("custom group reconciliation", () => {
  it("prunes missing notes and appends new ones at the root", () => {
    const { app } = makeWorld([
      "Books/My/Book.md",
      "Books/My/Locations/Harbor.md",
      "Books/My/Locations/Market.md",
    ]);
    const draft = makeDraft({
      noteGroups: [
        {
          name: "Locations",
          folder: "Locations",
          entries: [
            { title: "Gone", indent: 0 },
            { title: "Harbor", indent: 2 },
          ],
        },
      ],
    });

    const result = reconcileNoteGroups(app, draft, draft.noteGroups);

    expect(result.dirty).toBe(true);
    expect(result.noteGroups[0].entries).toEqual([
      { title: "Harbor", indent: 2 },
      { title: "Market", indent: 0 },
    ]);
  });

  it("is not dirty when the overlay matches the folder", () => {
    const { app } = makeWorld([
      "Books/My/Book.md",
      "Books/My/Locations/Harbor.md",
      "Books/My/Locations/Market.md",
    ]);
    const draft = makeDraft({
      noteGroups: [
        {
          name: "Locations",
          folder: "Locations",
          entries: [
            { title: "Harbor", indent: 0 },
            { title: "Market", indent: 1 },
          ],
        },
      ],
    });

    expect(reconcileNoteGroups(app, draft, draft.noteGroups).dirty).toBe(
      false
    );
  });

  it("does not touch files when a group is removed from configuration", () => {
    const world = makeWorld([
      "Books/My/Book.md",
      "Books/My/Magic/Spell.md",
    ]);
    const withGroup = makeDraft({
      noteGroups: [{ name: "Magic", folder: "Magic", entries: [] }],
    });
    const withoutGroup = makeDraft({ noteGroups: [] });

    const before: Record<string, any> = {};
    setDraftOnFrontmatterObject(before, withGroup);
    expect(before.longform.noteGroups).toEqual([
      { name: "Magic", folder: "Magic", entries: [] },
    ]);

    const after: Record<string, any> = {};
    setDraftOnFrontmatterObject(after, withoutGroup);
    expect(after.longform).not.toHaveProperty("noteGroups");

    expect(world.files.has("Books/My/Magic/Spell.md")).toBe(true);
    expect(world.deleted).toEqual([]);
    expect(reconcileNoteGroups(world.app, withoutGroup, [])).toEqual({
      noteGroups: [],
      dirty: false,
    });
  });
});

describe("custom auxiliary notes", () => {
  function customDraft(overrides: Partial<MultipleSceneDraft> = {}) {
    return makeDraft({
      noteGroups: [
        { name: "Locations", folder: "Bible/Locations", entries: [] },
      ],
      ...overrides,
    });
  }

  it("resolves, scans, labels, and finds custom notes", () => {
    const { app } = makeWorld([
      "Books/My/Book.md",
      "Books/My/Bible/Locations/Harbor.md",
      "Books/My/Bible/Locations/Sub/Docks.md",
    ]);
    const draft = customDraft({
      noteGroups: [
        {
          name: "Locations",
          folder: "Bible/Locations",
          entries: [{ title: "Harbor", indent: 1 }],
        },
      ],
    });
    const drafts: Draft[] = [draft];

    expect(auxiliaryFolder(app, draft, "custom:Locations")).toBe(
      "Books/My/Bible/Locations"
    );
    expect(
      auxiliaryNoteFiles(app, draft, "custom:Locations").map(
        (file) => file.name
      )
    ).toEqual(["Harbor", "Docks"]);
    expect(auxiliaryKindLabel("custom:Locations", false, draft)).toBe(
      "Location"
    );
    expect(auxiliaryKindPluralLabel("custom:Locations", true, draft)).toBe(
      "Locations"
    );
    expect(
      findAuxiliaryNote(
        app,
        "Books/My/Bible/Locations/Harbor.md",
        drafts
      )
    ).toEqual({
      draft,
      kind: "custom:Locations",
      index: 0,
      currentIndent: 1,
    });
  });

  it("creates a plain note in the configured folder with no template", async () => {
    pluginSettings.set({
      ...DEFAULT_SETTINGS,
      plotTemplate: "Templates/Plot.md",
      characterTemplate: "Templates/Character.md",
    });
    const world = makeWorld(["Books/My/Book.md"]);
    const draft = customDraft();
    draftsStore.set([draft]);

    await insertAuxiliaryNote(
      world.app,
      draftsStore,
      draft,
      "custom:Locations",
      "Harbor",
      { at: "end", relativeTo: null },
      false
    );

    expect(world.created).toEqual(["Books/My/Bible/Locations/Harbor.md"]);
    expect(world.written.get("Books/My/Bible/Locations/Harbor.md")).toBe("");
    expect(world.deleted).toEqual([]);
    expect(get(draftsStore)[0]).toMatchObject({
      noteGroups: [
        {
          name: "Locations",
          folder: "Bible/Locations",
          entries: [{ title: "Harbor", indent: 0 }],
        },
      ],
    });
  });

  it("finds a unique unit name across a custom overlay and folder", () => {
    const { app } = makeWorld([
      "Books/My/Book.md",
      "Books/My/Bible/Locations/Untitled.md",
    ]);
    const draft = customDraft({
      noteGroups: [
        {
          name: "Locations",
          folder: "Bible/Locations",
          entries: [{ title: "Untitled 1", indent: 0 }],
        },
      ],
    });

    expect(uniqueAuxiliaryNoteName(app, draft, "custom:Locations")).toBe(
      "Untitled 2"
    );
  });
});
