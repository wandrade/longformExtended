import type { App } from "obsidian";
import { get } from "svelte/store";

import { activeFile } from "src/view/stores";
import { drafts as draftsStore } from "src/model/stores";
import { findScene } from "src/model/scene-navigation";
import {
  findAuxiliaryNote,
  type AuxiliaryNoteKind,
} from "src/model/auxiliary-notes";
import {
  noteGroupEntries,
  setNoteGroupEntries,
} from "src/model/note-groups";
import type { Draft } from "src/model/types";
import type { CommandBuilder } from "./types";

type IndentTarget = {
  draft: Draft;
  kind: AuxiliaryNoteKind | null;
  index: number;
  currentIndent: number;
};

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
  // Subplot and character notes keep their indent in the project overlay.
  const auxiliary = scene ? null : findAuxiliaryNote(app, path, drafts);
  const target: IndentTarget | null = scene
    ? {
        draft: scene.draft,
        kind: null,
        index: scene.index,
        currentIndent: scene.currentIndent,
      }
    : auxiliary;
  if (!target) {
    return false;
  }
  if (checking) {
    return action === "indent" || target.currentIndent > 0;
  }

  draftsStore.update((_drafts) => {
    return _drafts.map((d) => {
      if (d.vaultPath !== target.draft.vaultPath || d.format !== "scenes") {
        return d;
      }
      const delta = action === "indent" ? 1 : -1;
      if (target.kind) {
        const entries = noteGroupEntries(d, target.kind);
        const entry = entries[target.index];
        if (entry) {
          entry.indent += delta;
          setNoteGroupEntries(d, target.kind, entries);
        }
      } else {
        const entry = d.scenes[target.index];
        if (entry) {
          entry.indent += delta;
        }
      }
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
