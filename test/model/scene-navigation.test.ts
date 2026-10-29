import { describe, expect, it } from "vitest";

import type { Vault } from "obsidian";

import {
  draftForPath,
  findScene,
  projectFolderPath,
  sceneFolderPath,
  scenePath,
  scenePathForFolder,
  scenePathForLocation,
} from "../../src/model/scene-navigation";
import type { Draft, MultipleSceneDraft } from "../../src/model/types";

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
    scenes: [
      { title: "Act 1", indent: 0 },
      { title: "Scene 1", indent: 1 },
      { title: "Scene 2", indent: 1 },
      { title: "Act 2", indent: 0 },
    ],
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

function makeVault(projectPath = "Books/My/Book.md"): Vault {
  return {
    getAbstractFileByPath: (path: string) =>
      path === projectPath ? { parent: { path: "Books/My" } } : null,
  } as unknown as Vault;
}

describe("scene paths", () => {
  it("resolves the project and scene folders from the project note", () => {
    const vault = makeVault();
    const draft = makeDraft();

    expect(projectFolderPath(draft, vault)).toBe("Books/My");
    expect(sceneFolderPath(draft, vault)).toBe("Books/My/Scenes");
    expect(scenePathForFolder("Scene 1", "Books/My/Scenes")).toBe(
      "Books/My/Scenes/Scene 1.md"
    );
    expect(scenePath("Scene 1", draft, vault)).toBe(
      "Books/My/Scenes/Scene 1.md"
    );
  });

  it("normalizes a leading slash in the scene folder", () => {
    const vault = makeVault();
    expect(
      sceneFolderPath(makeDraft({ sceneFolder: "/Scenes/" }), vault)
    ).toBe("Books/My/Scenes");
  });
});

describe("findScene", () => {
  it("finds a scene's draft, index, and indent", () => {
    const draft = makeDraft();
    const found = findScene("Books/My/Scenes/Scene 2.md", [draft]);

    expect(found).toEqual({ draft, index: 2, currentIndent: 1 });
    expect(findScene("Books/My/Scenes/Unknown.md", [draft])).toBeNull();
  });

  it("skips single-scene drafts", () => {
    const multiple = makeDraft();
    const single: Draft = {
      format: "single",
      title: "Book",
      titleInFrontmatter: true,
      draftTitle: null,
      vaultPath: "Books/My/Single.md",
      workflow: null,
    };

    // The single draft is first, so a naive implementation could match its path.
    expect(findScene("Books/My/Single.md", [single, multiple])).toBeNull();
  });
});

describe("draftForPath", () => {
  it("matches the project note, a scene, or nothing", () => {
    const draft = makeDraft();

    expect(draftForPath("Books/My/Book.md", [draft])).toBe(draft);
    expect(draftForPath("Books/My/Scenes/Scene 1.md", [draft])).toBe(draft);
    expect(draftForPath("Books/My/Other.md", [draft])).toBeNull();
  });
});

describe("scenePathForLocation", () => {
  const vault = makeVault();
  const draft = makeDraft();
  const location = (
    position: "next" | "previous",
    maintainIndent: boolean
  ) => ({ position, maintainIndent });

  it("moves to the adjacent scene without maintaining indent", () => {
    expect(
      scenePathForLocation(
        location("next", false),
        "Books/My/Scenes/Act 1.md",
        [draft],
        vault
      )
    ).toBe("Books/My/Scenes/Scene 1.md");
    expect(
      scenePathForLocation(
        location("previous", false),
        "Books/My/Scenes/Scene 1.md",
        [draft],
        vault
      )
    ).toBe("Books/My/Scenes/Act 1.md");
  });

  it("maintains indent by skipping scenes at other depth", () => {
    expect(
      scenePathForLocation(
        location("next", true),
        "Books/My/Scenes/Scene 1.md",
        [draft],
        vault
      )
    ).toBe("Books/My/Scenes/Scene 2.md");
    expect(
      scenePathForLocation(
        location("previous", true),
        "Books/My/Scenes/Scene 2.md",
        [draft],
        vault
      )
    ).toBe("Books/My/Scenes/Scene 1.md");
    // From a top-level scene, the next top-level scene is Act 2.
    expect(
      scenePathForLocation(
        location("next", true),
        "Books/My/Scenes/Act 1.md",
        [draft],
        vault
      )
    ).toBe("Books/My/Scenes/Act 2.md");
  });

  it("returns null at boundaries, when no same-indent scene exists, or for unknown paths", () => {
    expect(
      scenePathForLocation(
        location("next", false),
        "Books/My/Scenes/Act 2.md",
        [draft],
        vault
      )
    ).toBeNull();
    expect(
      scenePathForLocation(
        location("previous", false),
        "Books/My/Scenes/Act 1.md",
        [draft],
        vault
      )
    ).toBeNull();
    expect(
      scenePathForLocation(
        location("next", true),
        "Books/My/Scenes/Scene 2.md",
        [draft],
        vault
      )
    ).toBeNull();
    expect(
      scenePathForLocation(
        location("next", false),
        "Books/My/Scenes/Unknown.md",
        [draft],
        vault
      )
    ).toBeNull();
  });
});
