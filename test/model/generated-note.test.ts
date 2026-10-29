import { beforeEach, describe, expect, it } from "vitest";

import type { App } from "obsidian";

import {
  compiledPath,
  configuredOutputPath,
  sceneWikilink,
  writeGeneratedNote,
} from "../../src/model/generated-note";
import { workflows } from "../../src/model/stores";
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

type GeneratedWorld = {
  app: App;
  writes: { path: string; contents: string }[];
  folders: string[];
};

function makeWorld(): GeneratedWorld {
  const writes: { path: string; contents: string }[] = [];
  const folders: string[] = [];
  const existing = new Map<string, string>([["Build/unchanged.md", "same"]]);

  const app = {
    vault: {
      getAbstractFileByPath: (path: string) =>
        path === "Books/My/Book.md"
          ? { parent: { path: "Books/My" } }
          : null,
      createFolder: async (path: string) => {
        folders.push(path);
      },
      adapter: {
        exists: async (path: string) =>
          existing.has(path) || folders.includes(path),
        read: async (path: string) => existing.get(path) ?? "",
        write: async (path: string, contents: string) => {
          existing.set(path, contents);
          writes.push({ path, contents });
        },
      },
    },
  } as unknown as App;

  return { app, writes, folders };
}

beforeEach(() => {
  workflows.set({});
});

describe("configuredOutputPath", () => {
  it("uses the default path and appends the extension", () => {
    const { app } = makeWorld();
    expect(
      configuredOutputPath(app, makeDraft(), "", "Base/$1.base", ".base")
    ).toBe("Books/My/Base/Book.base");
    expect(
      configuredOutputPath(
        app,
        makeDraft(),
        "   ",
        "Base/$1.base",
        ".base"
      )
    ).toBe("Books/My/Base/Book.base");
    expect(
      configuredOutputPath(
        app,
        makeDraft(),
        null,
        "Build/$1_timeline.md",
        ".md"
      )
    ).toBe("Books/My/Build/Book_timeline.md");
  });

  it("expands every $1 and keeps a matching extension once", () => {
    const { app } = makeWorld();
    expect(
      configuredOutputPath(
        app,
        makeDraft(),
        "Out/$1/$1-grid.BASE",
        "Base/$1.base",
        ".base"
      )
    ).toBe("Books/My/Out/Book/Book-grid.BASE");
    expect(
      configuredOutputPath(app, makeDraft(), "Out/$1", "Base/$1.base", ".base")
    ).toBe("Books/My/Out/Book.base");
  });

  it("treats a leading slash as vault-relative", () => {
    const { app } = makeWorld();
    expect(
      configuredOutputPath(
        app,
        makeDraft(),
        "/Shared/$1_timeline.md",
        "Build/$1_timeline.md",
        ".md"
      )
    ).toBe("Shared/Book_timeline.md");
  });
});

describe("compiledPath", () => {
  it("uses the default manuscript path without a configured workflow", () => {
    const { app } = makeWorld();
    expect(compiledPath(app, makeDraft())).toBe("Books/My/manuscript.md");
  });

  it("uses the write-to-note target, its extension, and vault paths", () => {
    const { app } = makeWorld();
    workflows.set({
      Novel: {
        name: "Novel",
        description: "",
        steps: [
          {
            id: "write",
            description: {
              canonicalID: "write-to-note",
              name: "Write",
              description: "",
              availableKinds: [],
              options: [],
            },
            optionValues: { target: "$1-compiled" },
            compile: (input) => input,
          },
        ],
      },
    });

    expect(compiledPath(app, makeDraft({ workflow: "Novel" }))).toBe(
      "Books/My/Book-compiled.md"
    );

    workflows.set({
      Novel: {
        name: "Novel",
        description: "",
        steps: [
          {
            id: "write",
            description: {
              canonicalID: "write-to-note",
              name: "Write",
              description: "",
              availableKinds: [],
              options: [],
            },
            optionValues: { target: "/Vault/$1.txt" },
            compile: (input) => input,
          },
        ],
      },
    });
    expect(compiledPath(app, makeDraft({ workflow: "Novel" }))).toBe(
      "Vault/Book.txt"
    );
  });
});

describe("sceneWikilink", () => {
  it("strips the extension and escapes the alias separator", () => {
    expect(sceneWikilink("Scenes/One.md", "One")).toBe(
      "[[Scenes/One|One]]"
    );
    expect(sceneWikilink("Scenes/One.md", "One", true)).toBe(
      "[[Scenes/One\\|One]]"
    );
    expect(sceneWikilink("Scenes/One", "A | B")).toBe(
      "[[Scenes/One|A \\| B]]"
    );
    expect(sceneWikilink("Scenes/One.MD", "One")).toBe(
      "[[Scenes/One|One]]"
    );
  });
});

describe("writeGeneratedNote", () => {
  it("skips unchanged contents", async () => {
    const { app, writes } = makeWorld();
    await writeGeneratedNote(app, "Build/unchanged.md", "same");
    expect(writes).toEqual([]);
  });

  it("creates a missing folder and writes changed contents", async () => {
    const { app, writes, folders } = makeWorld();

    await writeGeneratedNote(app, "Build/New Note.md", "new");
    expect(folders).toEqual(["Build"]);
    expect(writes).toEqual([{ path: "Build/New Note.md", contents: "new" }]);

    await writeGeneratedNote(app, "Build/unchanged.md", "different");
    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual({
      path: "Build/unchanged.md",
      contents: "different",
    });
  });
});
