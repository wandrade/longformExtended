import { App, TFile, Vault } from "obsidian";
import { get, type Writable } from "svelte/store";

import {
  DEFAULT_CHARACTERS_DISPLAY_NAME,
  DEFAULT_PLOTS_DISPLAY_NAME,
  DEFAULT_SCENE_DISPLAY_NAME,
  defaultNoteGroupFolder,
  type Draft,
  type IndentedScene,
  type MultipleSceneDraft,
} from "./types";
import { scenePath } from "src/model/scene-navigation";
import { createNoteWithPotentialTemplate } from "./note-utils";
import { pluginSettings } from "./stores";

export function draftTitle(draft: Draft): string {
  return draft.draftTitle ?? draft.vaultPath;
}

type SceneInsertionLocation = {
  at: "before" | "after" | "end";
  relativeTo: number | null;
};

export async function createScene(
  app: App,
  path: string,
  index: number,
  draft: MultipleSceneDraft,
  open: boolean
): Promise<void> {
  const template = draft.sceneTemplate ?? get(pluginSettings).sceneTemplate;
  const note = await createNoteWithPotentialTemplate(app, path, template);
  if (note === null) return;

  if (get(pluginSettings).writeProperty) {
    await app.fileManager.processFrontMatter(note, (fm) => {
      fm["longform-order"] = index;
    });
  }

  if (open) {
    app.workspace.openLinkText(path, "/", false);
  }
}

export async function insertScene(
  app: App,
  draftsStore: Writable<Draft[]>,
  draft: MultipleSceneDraft,
  sceneName: string,
  vault: Vault,
  location: SceneInsertionLocation,
  open: boolean
) {
  const newScenePath = scenePath(sceneName, draft, vault);

  if (!newScenePath || !draft || draft.format !== "scenes") {
    return;
  }

  draftsStore.update((allDrafts) => {
    return allDrafts.map((d) => {
      if (d.vaultPath === draft.vaultPath && d.format === "scenes") {
        if (location.at === "end") {
          d.scenes = [...d.scenes, { title: sceneName, indent: 0 }];
        } else {
          const relativeScene = d.scenes[location.relativeTo];
          const index =
            location.at === "before"
              ? location.relativeTo
              : location.relativeTo + 1;
          d.scenes.splice(index, 0, {
            title: sceneName,
            indent: relativeScene.indent,
          });
        }
      }
      return d;
    });
  });

  await createScene(
    app,
    newScenePath,
    draft.scenes.findIndex((s) => s.title === sceneName),
    draft,
    open
  );
}

export function setDraftOnFrontmatterObject(
  obj: Record<string, any>,
  draft: Draft
) {
  obj["longform"] = {};
  obj["longform"]["format"] = draft.format;
  if (draft.titleInFrontmatter) {
    obj["longform"]["title"] = draft.title;
  }
  if (draft.draftTitle) {
    obj["longform"]["draftTitle"] = draft.draftTitle;
  }
  if (draft.workflow) {
    obj["longform"]["workflow"] = draft.workflow;
  }

  if (draft.format === "scenes") {
    obj["longform"]["sceneFolder"] = draft.sceneFolder;
    obj["longform"]["timeframeTagName"] = draft.timeframeTagName;
    obj["longform"]["timeFormat"] = draft.timeFormat;
    obj["longform"]["kanbanColumns"] = draft.kanbanColumns;
    obj["longform"]["kanbanOutputPath"] = draft.kanbanOutputPath;
    if (draft.kanbanShowUnassigned) {
      obj["longform"]["kanbanShowUnassigned"] = true;
    }
    if (!draft.kanbanSaveWordCounts) {
      obj["longform"]["kanbanSaveWordCounts"] = false;
    }
    if (!draft.kanbanEnabled) {
      obj["longform"]["kanbanEnabled"] = false;
    }
    if (!draft.kanbanIncludePlots) {
      obj["longform"]["kanbanIncludePlots"] = false;
    }
    if (!draft.timelineEnabled) {
      obj["longform"]["timelineEnabled"] = false;
    }
    obj["longform"]["timelineOutputPath"] = draft.timelineOutputPath;
    if (!draft.plotGridEnabled) {
      obj["longform"]["plotGridEnabled"] = false;
    }
    obj["longform"]["plotGridOutputPath"] = draft.plotGridOutputPath;
    // Remove the retired project-level grid level key.
    delete obj["longform"]["plotGridLevel"];
    obj["longform"]["plotGridPlotsDir"] = draft.plotGridPlotsDir;
    obj["longform"]["plotGridCharactersDir"] = draft.plotGridCharactersDir;
    obj["longform"]["scenes"] = indentedScenesToArrays(draft.scenes);
    obj["longform"]["plots"] = indentedScenesToArrays(draft.plots);
    obj["longform"]["characters"] = indentedScenesToArrays(draft.characters);

    // Display names are pure presentation, so only a non-default value is
    // persisted. Empty values fall back to the defaults and are omitted too.
    const sceneDisplayName =
      draft.sceneDisplayName?.trim() || DEFAULT_SCENE_DISPLAY_NAME;
    if (sceneDisplayName !== DEFAULT_SCENE_DISPLAY_NAME) {
      obj["longform"]["sceneDisplayName"] = sceneDisplayName;
    }
    const plotsDisplayName =
      draft.plotsDisplayName?.trim() || DEFAULT_PLOTS_DISPLAY_NAME;
    if (plotsDisplayName !== DEFAULT_PLOTS_DISPLAY_NAME) {
      obj["longform"]["plotsDisplayName"] = plotsDisplayName;
    }
    const charactersDisplayName =
      draft.charactersDisplayName?.trim() || DEFAULT_CHARACTERS_DISPLAY_NAME;
    if (charactersDisplayName !== DEFAULT_CHARACTERS_DISPLAY_NAME) {
      obj["longform"]["charactersDisplayName"] = charactersDisplayName;
    }

    // Custom groups are configuration only. An empty list is omitted, and
    // nothing here ever deletes a folder, note, or overlay.
    const noteGroups = (draft.noteGroups ?? [])
      .map((group) => {
        const name =
          typeof group.name === "string" ? group.name.trim() : "";
        const folder =
          typeof group.folder === "string" ? group.folder.trim() : "";
        return { group, name, folder };
      })
      .filter(({ name }) => name.length > 0);
    if (noteGroups.length > 0) {
      obj["longform"]["noteGroups"] = noteGroups.map(({ group, name, folder }) => {
        const template =
          typeof group.template === "string" ? group.template.trim() : "";
        return {
          name,
          folder: folder.length > 0 ? folder : defaultNoteGroupFolder(name),
          ...(template.length > 0 ? { template } : {}),
          entries: indentedScenesToArrays(group.entries ?? []),
        };
      });
    }
    if (draft.sceneTemplate) {
      obj["longform"]["sceneTemplate"] = draft.sceneTemplate;
    }
    if (draft.plotTemplate) {
      obj["longform"]["plotTemplate"] = draft.plotTemplate;
    }
    if (draft.characterTemplate) {
      obj["longform"]["characterTemplate"] = draft.characterTemplate;
    }
    obj["longform"]["ignoredFiles"] = draft.ignoredFiles;
  }
}

export function indentedScenesToArrays(indented: IndentedScene[]) {
  const result: any = [];
  // track our current indentation level
  let currentIndent = 0;
  // array for the current indentation level
  let currentNesting = result;
  // memoized arrays so that later, lesser indents can use earlier-created array
  const nestingAt: Record<number, any> = {};
  nestingAt[0] = currentNesting;

  indented.forEach(({ title, indent }) => {
    if (indent > currentIndent) {
      // we're at a deeper indentation level than current,
      // so build up a nest and memoize it
      while (currentIndent < indent) {
        currentIndent = currentIndent + 1;
        const newNesting: any = [];
        currentNesting.push(newNesting);
        nestingAt[currentIndent] = newNesting;
        currentNesting = newNesting;
      }
    } else if (indent < currentIndent) {
      // we're at a lesser indentation level than current,
      // so drop back to previously memoized nesting
      currentNesting = nestingAt[indent];
      currentIndent = indent;
    }

    // actually insert the value
    currentNesting.push(title);
  });
  return result;
}

/**
 * Converts Longform's nested `scenes` arrays into a flat, indented list.
 *
 * This must not mutate `arr`: callers pass the metadata cache's frontmatter
 * array directly, and consuming it would leave later syncs with an empty
 * scene list.
 */
export function arraysToIndentedScenes(
  arr: any,
  result: IndentedScene[] = [],
  currentIndent = -1
): IndentedScene[] {
  if (arr instanceof Array) {
    let scenes = result;
    for (const item of arr) {
      const inner = arraysToIndentedScenes(item, [], currentIndent + 1);
      scenes = scenes.concat(inner);
    }
    return scenes;
  } else {
    return [
      {
        title: arr,
        indent: currentIndent,
      },
    ];
  }
}

export type NumberedScene = IndentedScene & {
  numbering: number[];
};

export function numberScenes(scenes: IndentedScene[]): NumberedScene[] {
  const numbering = [0];
  let lastNumberedIndent = 0;

  return scenes.map((scene) => {
    const { indent } = scene;
    if (indent > lastNumberedIndent) {
      let fill = lastNumberedIndent + 1;
      while (fill <= indent) {
        numbering[fill] = 1;
        fill = fill + 1;
      }
      numbering[indent] = 0;
    } else if (indent < lastNumberedIndent) {
      const start = indent + 1;
      numbering.splice(start, numbering.length - start);
    }
    lastNumberedIndent = indent;

    numbering[indent] = numbering[indent] + 1;
    return {
      ...scene,
      numbering: [...numbering],
    };
  });
}

export function formatSceneNumber(numbering: number[]): string {
  return numbering.join(".");
}

export async function insertDraftIntoFrontmatter(
  app: App,
  path: string,
  draft: Draft
) {
  const exists = await app.vault.adapter.exists(path);
  if (!exists) {
    await app.vault.create(path, "");
  }

  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) {
    // TODO: error?
    return;
  }
  try {
    await app.fileManager.processFrontMatter(file, (fm) => {
      setDraftOnFrontmatterObject(fm, draft);
    });
  } catch (error) {
    console.error(
      "[Longform Extended] insertDraftIntoFrontmatter: processFrontMatter error:",
      error
    );
  }
}
