import type { Editor, MarkdownFileInfo, MarkdownView } from "obsidian";

import { draftForPath } from "src/model/scene-navigation";
import { drafts, selectedDraftVaultPath } from "src/model/stores";
import { get } from "svelte/store";
import type { CommandBuilder } from "./types";
import { insertDraftIntoFrontmatter } from "src/model/draft-utils";
import { fileNameFromPath } from "src/model/note-utils";
import {
  DEFAULT_CHARACTERS_DISPLAY_NAME,
  DEFAULT_KANBAN_COLUMNS,
  DEFAULT_KANBAN_INCLUDE_PLOTS,
  DEFAULT_KANBAN_OUTPUT_PATH,
  DEFAULT_PLOT_GRID_CHARACTERS_DIR,
  DEFAULT_PLOT_GRID_ENABLED,
  DEFAULT_PLOT_GRID_OUTPUT_PATH,
  DEFAULT_PLOT_GRID_PLOTS_DIR,
  DEFAULT_PLOTS_DISPLAY_NAME,
  DEFAULT_SCENE_DISPLAY_NAME,
  DEFAULT_TIMEFRAME_TAG_NAME,
  DEFAULT_TIMELINE_OUTPUT_PATH,
  DEFAULT_TIME_FORMAT,
  type Draft,
  type MultipleSceneDraft,
  type SingleSceneDraft,
} from "src/model/types";

const callbackForFormat = (
  format: "scenes" | "single",
  checking: boolean,
  _editor: Editor,
  view: MarkdownView | MarkdownFileInfo
): boolean | void => {
  const file = view.file;

  // check if this is already a draft or scene, if so, do nothing
  const draft = draftForPath(file.path, get(drafts));
  if (checking) {
    return !draft;
  }

  const title = fileNameFromPath(file.path);

  const newDraft: Draft = (() => {
    if (format === "scenes") {
      const multi: MultipleSceneDraft = {
        format: "scenes",
        title,
        titleInFrontmatter: false,
        draftTitle: null,
        vaultPath: file.path,
        workflow: null,
        sceneFolder: "Scenes",
        scenes: [],
        sceneDisplayName: DEFAULT_SCENE_DISPLAY_NAME,
        plotsDisplayName: DEFAULT_PLOTS_DISPLAY_NAME,
        charactersDisplayName: DEFAULT_CHARACTERS_DISPLAY_NAME,
        noteGroups: [],
        ignoredFiles: [],
        unknownFiles: [],
        sceneTemplate: null,
        plotTemplate: null,
        characterTemplate: null,
        plots: [],
        characters: [],
        timeframeTagName: DEFAULT_TIMEFRAME_TAG_NAME,
        timeFormat: DEFAULT_TIME_FORMAT,
        kanbanColumns: DEFAULT_KANBAN_COLUMNS,
        kanbanShowUnassigned: false,
        kanbanSaveWordCounts: true,
        kanbanEnabled: true,
        kanbanIncludePlots: DEFAULT_KANBAN_INCLUDE_PLOTS,
        kanbanOutputPath: DEFAULT_KANBAN_OUTPUT_PATH,
        timelineEnabled: true,
        timelineOutputPath: DEFAULT_TIMELINE_OUTPUT_PATH,
        plotGridEnabled: DEFAULT_PLOT_GRID_ENABLED,
        plotGridOutputPath: DEFAULT_PLOT_GRID_OUTPUT_PATH,
        plotGridPlotsDir: DEFAULT_PLOT_GRID_PLOTS_DIR,
        plotGridCharactersDir: DEFAULT_PLOT_GRID_CHARACTERS_DIR,
      };
      return multi;
    } else {
      const single: SingleSceneDraft = {
        format: "single",
        title,
        titleInFrontmatter: false,
        draftTitle: null,
        vaultPath: file.path,
        workflow: null,
      };
      return single;
    }
  })();

  void insertDraftIntoFrontmatter(view.app, file.path, newDraft).then(() => {
    selectedDraftVaultPath.set(file.path);
  });
};

export const insertMultiSceneTemplate: CommandBuilder = (_plugin) => ({
  id: "insert-multi-scene",
  name: "Insert multi-scene frontmatter",
  editorCheckCallback(checking, editor, view) {
    const result = callbackForFormat("scenes", checking, editor, view);
    return result;
  },
});

export const insertSingleSceneTemplate: CommandBuilder = (_plugin) => ({
  id: "insert-single-scene",
  name: "Insert single-scene frontmatter",
  editorCheckCallback(checking, editor, view) {
    return callbackForFormat("single", checking, editor, view);
  },
});
