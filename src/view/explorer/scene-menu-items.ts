import type { App } from "obsidian";
import { drafts, selectedDraft } from "src/model/stores";
import type { MultipleSceneDraft } from "src/model/types";
import { addUnknownScenes } from "src/model/draft-utils";
import { get } from "svelte/store";

const getSelectedDraftWithIndex = () => {
  const draft = get(selectedDraft) as MultipleSceneDraft;
  if (!draft) {
    return { index: -1, draft };
  }
  const index = get(drafts).findIndex((d) => d.vaultPath === draft.vaultPath);
  return { index, draft };
};

export const addScene = async (app: App, fileName: string) => {
  const { draft } = getSelectedDraftWithIndex();
  if (!draft || draft.format !== "scenes") {
    return;
  }
  await addUnknownScenes(app, drafts, draft, [fileName]);
};

export const ignoreScene = (fileName: string) => {
  const { index, draft } = getSelectedDraftWithIndex();
  if (!draft) {
    return;
  }
  if (index >= 0 && draft.format === "scenes") {
    drafts.update((d) => {
      const targetDraft = d[index] as MultipleSceneDraft;
      (d[index] as MultipleSceneDraft).scenes = targetDraft.scenes.filter(
        (it) => it.title != fileName
      );
      (d[index] as MultipleSceneDraft).ignoredFiles = [
        ...targetDraft.ignoredFiles,
        fileName,
      ];
      (d[index] as MultipleSceneDraft).unknownFiles =
        targetDraft.unknownFiles.filter((f) => f !== fileName);
      return d;
    });
  }
};

export const addAll = async (app: App) => {
  const { draft } = getSelectedDraftWithIndex();
  if (!draft || draft.format !== "scenes") {
    return;
  }
  await addUnknownScenes(app, drafts, draft, draft.unknownFiles);
};

export const ignoreAll = () => {
  const { index, draft } = getSelectedDraftWithIndex();
  if (!draft) {
    return;
  }
  if (index >= 0 && draft.format === "scenes") {
    drafts.update((d) => {
      const targetDraft = d[index] as MultipleSceneDraft;
      (d[index] as MultipleSceneDraft).ignoredFiles = [
        ...targetDraft.ignoredFiles,
        ...targetDraft.unknownFiles,
      ];
      (d[index] as MultipleSceneDraft).unknownFiles = [];
      return d;
    });
  }
};
