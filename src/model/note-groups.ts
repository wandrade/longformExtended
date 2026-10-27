import { normalizePath, type App } from "obsidian";

import { arraysToIndentedScenes } from "./draft-utils";
import {
  isInsidePlotGridDirectory,
  resolvePlotGridDirectory,
} from "./plot-grid";
import {
  DEFAULT_CHARACTERS_DISPLAY_NAME,
  DEFAULT_PLOT_GRID_CHARACTERS_DIR,
  DEFAULT_PLOT_GRID_PLOTS_DIR,
  DEFAULT_PLOTS_DISPLAY_NAME,
  DEFAULT_SCENE_DISPLAY_NAME,
  defaultNoteGroupFolder,
  singularDisplayName,
  type IndentedScene,
  type MultipleSceneDraft,
  type NoteGroup,
} from "./types";

/**
 * Stable identifiers for the three built-in note groups and every configured
 * custom group. Custom keys are `custom:${name}`; the name is deliberately not
 * treated as the source of truth, since a group may be renamed while its key
 * is consumed by a UI component.
 */
export type NoteGroupKey =
  | "scenes"
  | "plots"
  | "characters"
  | `custom:${string}`;

export type NoteGroupDescriptor = {
  key: NoteGroupKey;
  /** Plural label, e.g. `Arguments`. */
  displayName: string;
  /** Derived singular label, e.g. `Argument`. */
  singularName: string;
  /** The configured folder value, relative to the project folder. */
  folder: string;
  entries: IndentedScene[];
  custom: boolean;
};

/** The stable key for a custom group. */
export function customNoteGroupKey(name: string): NoteGroupKey {
  return `custom:${name}`;
}

function normalizeDisplayName(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function findCustomGroup(
  draft: MultipleSceneDraft,
  key: NoteGroupKey
): NoteGroup | null {
  if (!key.startsWith("custom:")) {
    return null;
  }
  return (
    (draft.noteGroups ?? []).find(
      (group) => customNoteGroupKey(group.name) === key
    ) ?? null
  );
}

function customDescriptor(group: NoteGroup): NoteGroupDescriptor {
  const rawName = typeof group.name === "string" ? group.name : "";
  const name = rawName.trim();
  const displayName = name.length > 0 ? name : rawName;
  const folder =
    typeof group.folder === "string" ? group.folder.trim() : "";
  return {
    key: customNoteGroupKey(rawName),
    displayName,
    singularName: singularDisplayName(displayName),
    folder:
      folder.length > 0 ? folder : defaultNoteGroupFolder(displayName),
    entries: group.entries ?? [],
    custom: true,
  };
}

/** Every built-in group first, then each custom group in configured order. */
export function noteGroupDescriptors(
  draft: MultipleSceneDraft
): NoteGroupDescriptor[] {
  const sceneDisplayName = normalizeDisplayName(
    draft.sceneDisplayName,
    DEFAULT_SCENE_DISPLAY_NAME
  );
  const plotsDisplayName = normalizeDisplayName(
    draft.plotsDisplayName,
    DEFAULT_PLOTS_DISPLAY_NAME
  );
  const charactersDisplayName = normalizeDisplayName(
    draft.charactersDisplayName,
    DEFAULT_CHARACTERS_DISPLAY_NAME
  );

  return [
    {
      key: "scenes",
      displayName: sceneDisplayName,
      singularName: singularDisplayName(sceneDisplayName),
      folder: draft.sceneFolder,
      entries: draft.scenes,
      custom: false,
    },
    {
      key: "plots",
      displayName: plotsDisplayName,
      singularName: singularDisplayName(plotsDisplayName),
      folder: draft.plotGridPlotsDir,
      entries: draft.plots,
      custom: false,
    },
    {
      key: "characters",
      displayName: charactersDisplayName,
      singularName: singularDisplayName(charactersDisplayName),
      folder: draft.plotGridCharactersDir,
      entries: draft.characters,
      custom: false,
    },
    ...(draft.noteGroups ?? []).map(customDescriptor),
  ];
}

export function noteGroupDescriptor(
  draft: MultipleSceneDraft,
  key: NoteGroupKey
): NoteGroupDescriptor | null {
  if (key === "scenes" || key === "plots" || key === "characters") {
    return noteGroupDescriptors(draft).find((group) => group.key === key) ?? null;
  }
  const group = findCustomGroup(draft, key);
  return group ? customDescriptor(group) : null;
}

export function noteGroupDisplayName(
  draft: MultipleSceneDraft,
  key: NoteGroupKey
): string {
  const descriptor = noteGroupDescriptor(draft, key);
  if (descriptor) {
    return descriptor.displayName;
  }
  if (key === "scenes") {
    return normalizeDisplayName(
      draft.sceneDisplayName,
      DEFAULT_SCENE_DISPLAY_NAME
    );
  }
  if (key === "plots") {
    return normalizeDisplayName(
      draft.plotsDisplayName,
      DEFAULT_PLOTS_DISPLAY_NAME
    );
  }
  if (key === "characters") {
    return normalizeDisplayName(
      draft.charactersDisplayName,
      DEFAULT_CHARACTERS_DISPLAY_NAME
    );
  }
  return "";
}

export function noteGroupSingularName(
  draft: MultipleSceneDraft,
  key: NoteGroupKey
): string {
  const descriptor = noteGroupDescriptor(draft, key);
  return descriptor
    ? descriptor.singularName
    : singularDisplayName(noteGroupDisplayName(draft, key));
}

export function noteGroupEntries(
  draft: MultipleSceneDraft,
  key: NoteGroupKey
): IndentedScene[] {
  return noteGroupDescriptor(draft, key)?.entries ?? [];
}

export function setNoteGroupEntries(
  draft: MultipleSceneDraft,
  key: NoteGroupKey,
  entries: IndentedScene[]
): void {
  if (key === "scenes") {
    draft.scenes = entries;
    return;
  }
  if (key === "plots") {
    draft.plots = entries;
    return;
  }
  if (key === "characters") {
    draft.characters = entries;
    return;
  }
  const group = findCustomGroup(draft, key);
  if (group) {
    group.entries = entries;
  }
}

export function noteGroupFolderSetting(
  draft: MultipleSceneDraft,
  key: NoteGroupKey
): string {
  return noteGroupDescriptor(draft, key)?.folder ?? "";
}

/** The optional template for a group; custom groups store it per group. */
export function noteGroupTemplate(
  draft: MultipleSceneDraft,
  key: NoteGroupKey
): string | null {
  if (key === "scenes") {
    return draft.sceneTemplate ?? null;
  }
  if (key === "plots") {
    return draft.plotTemplate ?? null;
  }
  if (key === "characters") {
    return draft.characterTemplate ?? null;
  }
  const group = findCustomGroup(draft, key);
  const template = group?.template;
  return typeof template === "string" && template.trim().length > 0
    ? template.trim()
    : null;
}

/**
 * Resolves a group's folder to a normalized, vault-relative path. Like every
 * other note-folder setting it is relative to the project folder; a leading
 * `/` is only a separator.
 */
export function noteGroupFolder(
  app: App,
  draft: MultipleSceneDraft,
  key: NoteGroupKey
): string {
  const descriptor = noteGroupDescriptor(draft, key);
  if (!descriptor) {
    return "";
  }

  let fallback = "";
  if (key === "plots") {
    fallback = DEFAULT_PLOT_GRID_PLOTS_DIR;
  } else if (key === "characters") {
    fallback = DEFAULT_PLOT_GRID_CHARACTERS_DIR;
  } else if (descriptor.custom) {
    fallback = defaultNoteGroupFolder(descriptor.displayName);
  }

  return resolvePlotGridDirectory(app, draft, descriptor.folder, fallback);
}

export type NoteGroupDirectory = {
  key: NoteGroupKey;
  label: string;
  path: string;
};

export type NoteGroupDirectoryConflict = {
  first: NoteGroupDirectory;
  second: NoteGroupDirectory;
  kind: "same" | "nested";
};

/** Every group's resolved directory, built-ins first, then customs. */
export function noteGroupDirectories(
  app: App,
  draft: MultipleSceneDraft
): NoteGroupDirectory[] {
  return noteGroupDescriptors(draft).map((descriptor) => ({
    key: descriptor.key,
    label: descriptor.displayName,
    path: noteGroupFolder(app, draft, descriptor.key),
  }));
}

/**
 * Every pairwise violation of the distinct, non-nested folder rule. The vault
 * root is an ancestor of every path, so a group resolving to the project root
 * conflicts with every other group.
 */
export function noteGroupDirectoryConflicts(
  app: App,
  draft: MultipleSceneDraft
): NoteGroupDirectoryConflict[] {
  const directories = noteGroupDirectories(app, draft);
  const conflicts: NoteGroupDirectoryConflict[] = [];

  for (let first = 0; first < directories.length; first++) {
    for (let second = first + 1; second < directories.length; second++) {
      const left = directories[first];
      const right = directories[second];
      const leftPath = normalizePath(left.path);
      const rightPath = normalizePath(right.path);
      if (leftPath === rightPath) {
        conflicts.push({ first: left, second: right, kind: "same" });
      } else if (
        isInsidePlotGridDirectory(leftPath, rightPath) ||
        isInsidePlotGridDirectory(rightPath, leftPath)
      ) {
        conflicts.push({ first: left, second: right, kind: "nested" });
      }
    }
  }

  return conflicts;
}

export function describeNoteGroupDirectoryConflict(
  conflict: NoteGroupDirectoryConflict
): string {
  return conflict.kind === "same"
    ? `${conflict.first.label} and ${conflict.second.label} must not be the same folder.`
    : `${conflict.first.label} and ${conflict.second.label} must not be nested inside one another.`;
}

export function noteGroupDirectoryConflictMessage(
  conflicts: NoteGroupDirectoryConflict[]
): string {
  return conflicts.map(describeNoteGroupDirectoryConflict).join(" ");
}

/**
 * Splits a whitespace-separated, optionally quoted list of group names. This
 * is the same token syntax the Kanban column setting uses, so users do not
 * need to learn a second quoting convention.
 */
export function parseNoteGroupNames(raw: string): string[] {
  const names: string[] = [];
  const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    if (value.length > 0) {
      names.push(value);
    }
  }
  return names;
}

/** Quotes names containing whitespace so the list round-trips through `parseNoteGroupNames`. */
export function formatNoteGroupNames(names: string[]): string {
  return names
    .filter((name) => name.length > 0)
    .map((name) => (/\s/.test(name) ? `"${name}"` : name))
    .join(" ");
}

/**
 * Reads the persisted `noteGroups` array defensively: malformed entries are
 * ignored, names are trimmed, duplicate names are dropped (first wins), a
 * missing folder falls back to the name, and configured order is preserved.
 */
export function parseNoteGroups(raw: unknown): NoteGroup[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const groups: NoteGroup[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (item === null || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (name.length === 0 || seen.has(name)) {
      continue;
    }
    seen.add(name);

    const folder =
      typeof record.folder === "string" && record.folder.trim().length > 0
        ? record.folder.trim()
        : defaultNoteGroupFolder(name);
    const template =
      typeof record.template === "string" && record.template.trim().length > 0
        ? record.template.trim()
        : null;
    const rawEntries = Array.isArray(record.entries) ? record.entries : [];
    const entries = arraysToIndentedScenes(rawEntries).filter(
      (entry) =>
        typeof entry.title === "string" && entry.title.trim().length > 0
    );

    const group: NoteGroup = { name, folder, entries };
    if (template) {
      group.template = template;
    }
    groups.push(group);
  }

  return groups;
}
