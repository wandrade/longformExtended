import { normalizePath, type App, type TFile } from "obsidian";
import { isEqual } from "lodash";
import { get, type Writable } from "svelte/store";

import {
  createNoteWithPotentialTemplate,
  fileNameFromPath,
} from "./note-utils";
import {
  isInsidePlotGridDirectory,
  resolvePlotGridDirectory,
} from "./plot-grid";
import {
  customNoteGroupKey,
  noteGroupDescriptors,
  noteGroupDisplayName,
  noteGroupEntries,
  noteGroupSingularName,
  noteGroupTemplate,
  setNoteGroupEntries,
  type NoteGroupKey,
} from "./note-groups";
import { scenePathForFolder } from "./scene-navigation";
import { pluginSettings } from "./stores";
import {
  DEFAULT_PLOT_GRID_CHARACTERS_DIR,
  DEFAULT_PLOT_GRID_PLOTS_DIR,
  defaultNoteGroupFolder,
  singularDisplayName,
  type Draft,
  type IndentedScene,
  type MultipleSceneDraft,
  type NoteGroup,
} from "./types";

/**
 * The auxiliary note trees that live in the configured plot, character, and
 * custom-group folders. Their folder contents are the membership source of
 * truth; the project note stores only the order/indent overlay.
 */
export type AuxiliaryNoteKind = Exclude<NoteGroupKey, "scenes">;

function isCustomKind(kind: AuxiliaryNoteKind): kind is `custom:${string}` {
  return kind.startsWith("custom:");
}

function findCustomGroup(
  draft: MultipleSceneDraft,
  kind: AuxiliaryNoteKind
): NoteGroup | null {
  if (!isCustomKind(kind)) {
    return null;
  }
  return (
    (draft.noteGroups ?? []).find(
      (group) => customNoteGroupKey(group.name) === kind
    ) ?? null
  );
}

/**
 * A display label for a group. Built-ins keep their established lowercase
 * presentation. Custom groups use their configured display name when a draft
 * is supplied; without one, the key's name portion is the best available.
 */
export function auxiliaryKindLabel(
  kind: AuxiliaryNoteKind,
  capitalized = false,
  draft?: MultipleSceneDraft
): string {
  let label: string;
  if (isCustomKind(kind)) {
    label = draft
      ? noteGroupSingularName(draft, kind)
      : singularDisplayName(findCustomGroupName(kind));
  } else {
    label = kind === "plots" ? "subplot" : "character";
  }
  return capitalized && label.length > 0
    ? `${label[0].toUpperCase()}${label.slice(1)}`
    : label;
}

export function auxiliaryKindPluralLabel(
  kind: AuxiliaryNoteKind,
  capitalized = false,
  draft?: MultipleSceneDraft
): string {
  let label: string;
  if (isCustomKind(kind)) {
    label = draft
      ? noteGroupDisplayName(draft, kind)
      : findCustomGroupName(kind);
  } else {
    label = kind === "plots" ? "subplots" : "characters";
  }
  return capitalized && label.length > 0
    ? `${label[0].toUpperCase()}${label.slice(1)}`
    : label;
}

/** `custom:Foo` -> `Foo`; only a fallback when no draft is available. */
function findCustomGroupName(kind: `custom:${string}`): string {
  return kind.slice("custom:".length);
}

/** The resolved, vault-relative folder for an auxiliary tree. */
export function auxiliaryFolder(
  app: App,
  draft: MultipleSceneDraft,
  kind: AuxiliaryNoteKind
): string {
  if (kind === "plots") {
    return resolvePlotGridDirectory(
      app,
      draft,
      draft.plotGridPlotsDir,
      DEFAULT_PLOT_GRID_PLOTS_DIR
    );
  }
  if (kind === "characters") {
    return resolvePlotGridDirectory(
      app,
      draft,
      draft.plotGridCharactersDir,
      DEFAULT_PLOT_GRID_CHARACTERS_DIR
    );
  }

  const group = findCustomGroup(draft, kind);
  const fallback = defaultNoteGroupFolder(
    group?.name ?? findCustomGroupName(kind)
  );
  return resolvePlotGridDirectory(
    app,
    draft,
    group?.folder ?? "",
    fallback
  );
}

export type AuxiliaryNoteFile = {
  /** Note basename, the identifier used by the order overlay. */
  name: string;
  /** Vault-relative path. */
  path: string;
};

function comparePaths(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}

/**
 * Every markdown note under the configured folder, recursively. The overlay
 * stores basenames, so duplicate basenames in nested folders are collapsed to
 * the first one in path order.
 */
export function auxiliaryNoteFiles(
  app: App,
  draft: MultipleSceneDraft,
  kind: AuxiliaryNoteKind
): AuxiliaryNoteFile[] {
  const folder = auxiliaryFolder(app, draft, kind);
  const files = app.vault
    .getMarkdownFiles()
    .filter(
      (file) =>
        file.path !== draft.vaultPath &&
        isInsidePlotGridDirectory(folder, file.path)
    )
    .sort((left, right) => comparePaths(left.path, right.path));

  const seen = new Set<string>();
  const result: AuxiliaryNoteFile[] = [];
  for (const file of files) {
    const name = file.basename || fileNameFromPath(file.path);
    if (!seen.has(name)) {
      seen.add(name);
      result.push({ name, path: file.path });
    }
  }
  return result;
}

/**
 * Merges the stored order overlay with the notes currently in the folder:
 * entries whose notes are gone are pruned, and notes missing from the overlay
 * are appended at the root in alphabetical order. `dirty` reports whether the
 * overlay needs to be written back to the project note.
 */
export function reconcileAuxiliaryList(
  entries: IndentedScene[],
  fileNames: string[]
): { list: IndentedScene[]; dirty: boolean } {
  const available = new Set(fileNames);
  const seen = new Set<string>();
  const list: IndentedScene[] = [];

  for (const entry of entries) {
    if (!available.has(entry.title) || seen.has(entry.title)) {
      continue;
    }
    seen.add(entry.title);
    list.push({ title: entry.title, indent: entry.indent });
  }

  const missing = fileNames
    .filter((name) => !seen.has(name))
    .sort((left, right) => left.localeCompare(right));
  for (const name of missing) {
    seen.add(name);
    list.push({ title: name, indent: 0 });
  }

  return { list, dirty: !isEqual(entries, list) };
}

/**
 * The path for an auxiliary note. Uses the actual file when one with this
 * basename exists in the folder, otherwise the path a new note would use.
 */
export function auxiliaryNotePath(
  app: App,
  draft: MultipleSceneDraft,
  kind: AuxiliaryNoteKind,
  name: string
): string {
  const existing = auxiliaryNoteFiles(app, draft, kind).find(
    (file) => file.name === name
  );
  return existing
    ? existing.path
    : scenePathForFolder(name, auxiliaryFolder(app, draft, kind));
}

/** A new note name that does not collide with the overlay or the folder. */
export function uniqueAuxiliaryNoteName(
  app: App,
  draft: MultipleSceneDraft,
  kind: AuxiliaryNoteKind
): string {
  const names = new Set(noteGroupEntries(draft, kind).map((entry) => entry.title));
  for (const file of auxiliaryNoteFiles(app, draft, kind)) {
    names.add(file.name);
  }

  let name = "Untitled";
  let count = 0;
  while (names.has(name)) {
    count += 1;
    name = `Untitled ${count}`;
  }
  return name;
}

/**
 * Finds the auxiliary overlay entry for a vault path. Used by the global
 * indent commands, which otherwise only know about manuscript scenes.
 */
export function findAuxiliaryNote(
  app: App,
  path: string,
  drafts: Draft[]
):
  | {
      draft: MultipleSceneDraft;
      kind: AuxiliaryNoteKind;
      index: number;
      currentIndent: number;
    }
  | null {
  const normalizedPath = normalizePath(path);

  for (const draft of drafts) {
    if (draft.format !== "scenes") {
      continue;
    }
    for (const descriptor of noteGroupDescriptors(draft)) {
      // Scene indentation is handled separately by `findScene`.
      if (descriptor.key === "scenes") {
        continue;
      }
      const kind: AuxiliaryNoteKind = descriptor.key;
      if (
        !isInsidePlotGridDirectory(
          auxiliaryFolder(app, draft, kind),
          normalizedPath
        )
      ) {
        continue;
      }
      const name = normalizedPath.split("/").pop()?.replace(/\.md$/i, "");
      if (!name) {
        continue;
      }
      const index = descriptor.entries.findIndex(
        (entry) => entry.title === name
      );
      if (index >= 0) {
        return {
          draft,
          kind,
          index,
          currentIndent: descriptor.entries[index].indent,
        };
      }
    }
  }
  return null;
}

export type AuxiliaryInsertionLocation = {
  at: "before" | "after" | "end";
  relativeTo: number | null;
};

/**
 * Creates an auxiliary note in the configured folder using the per-project
 * template (falling back to the global setting) and records its overlay entry.
 */
export async function insertAuxiliaryNote(
  app: App,
  draftsStore: Writable<Draft[]>,
  draft: MultipleSceneDraft,
  kind: AuxiliaryNoteKind,
  name: string,
  location: AuxiliaryInsertionLocation,
  open: boolean
): Promise<void> {
  if (draft.format !== "scenes") {
    return;
  }

  const path = scenePathForFolder(name, auxiliaryFolder(app, draft, kind));
  const settings = get(pluginSettings);
  // Only the built-in plot and character trees have templates. A custom group
  // creates a plain note in its configured folder.
  const template =
    kind === "plots"
      ? draft.plotTemplate ?? settings.plotTemplate
      : kind === "characters"
      ? draft.characterTemplate ?? settings.characterTemplate
      : noteGroupTemplate(draft, kind);

  const note: TFile | null = await createNoteWithPotentialTemplate(
    app,
    path,
    template
  );
  if (note === null) {
    return;
  }

  draftsStore.update((allDrafts) => {
    return allDrafts.map((candidate) => {
      if (
        candidate.vaultPath !== draft.vaultPath ||
        candidate.format !== "scenes"
      ) {
        return candidate;
      }

      // A file-created event may already have appended the note; remove it so
      // the requested position and indent win.
      const currentEntries = noteGroupEntries(candidate, kind);
      const entries = currentEntries.filter((entry) => entry.title !== name);
      let index = entries.length;
      let indent = 0;
      if (location.at !== "end" && location.relativeTo !== null) {
        const relative =
          currentEntries[location.relativeTo] ??
          currentEntries[currentEntries.length - 1];
        indent = relative ? relative.indent : 0;
        index =
          location.at === "before"
            ? location.relativeTo
            : location.relativeTo + 1;
        index = Math.max(0, Math.min(index, entries.length));
      }
      entries.splice(index, 0, { title: name, indent });
      setNoteGroupEntries(candidate, kind, entries);
      return candidate;
    });
  });

  if (open) {
    app.workspace.openLinkText(path, "/", false);
  }
}
