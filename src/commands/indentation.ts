import type { App } from "obsidian";
import { get } from "svelte/store";

import { activeFile } from "src/view/stores";
import { drafts as draftsStore } from "src/model/stores";
import { findScene } from "src/model/scene-navigation";
import { findAuxiliaryNote } from "src/model/auxiliary-notes";
import type { CommandBuilder } from "./types";

const checkIndent = (
  app: App,
  checking: boolean,
  action: "indent" | "unindent"
): boolean | void => {
  const file = get(activeFile);
  if (!file) {
    return false;
  }
  const path = file.path;
  const drafts = get(draftsStore);

  const scene = findScene(path, drafts);
  if (scene) {
    if (checking) {
      return action === "indent" || scene.currentIndent > 0;
    }
    draftsStore.update((_drafts) => {
      return _drafts.map((d) => {
        if (d.vaultPath !== scene.draft.vaultPath || d.format !== "scenes") {
          return d;
        }

        const delta = action === "indent" ? 1 : -1;

        d.scenes[scene.index].indent = d.scenes[scene.index].indent + delta;
        return d;
      });
    });
    return;
  }

  // Plot and character notes use the project-level order/indent overlay, even
  // though their membership comes from the configured folders.
  const auxiliary = findAuxiliaryNote(app, path, drafts);
  if (!auxiliary) {
    return false;
  }
  if (checking) {
    return action === "indent" || auxiliary.currentIndent > 0;
  }
  draftsStore.update((_drafts) => {
    return _drafts.map((d) => {
      if (
        d.vaultPath !== auxiliary.draft.vaultPath ||
        d.format !== "scenes"
      ) {
        return d;
      }

      const delta = action === "indent" ? 1 : -1;
      d[auxiliary.kind][auxiliary.index].indent =
        d[auxiliary.kind][auxiliary.index].indent + delta;
      return d;
    });
  });
};

export const indentScene: CommandBuilder = (plugin) => ({
  id: "longform-extended-indent-scene",
  name: "Indent scene",
  editorCheckCallback: (checking: boolean) =>
    checkIndent(plugin.app, checking, "indent"),
});

export const unindentScene: CommandBuilder = (plugin) => ({
  id: "longform-extended-unindent-scene",
  name: "Unindent scene",
  editorCheckCallback: (checking: boolean) =>
    checkIndent(plugin.app, checking, "unindent"),
});
