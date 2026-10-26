import { normalizePath, type App, type TFile } from "obsidian";

import { configuredOutputPath, writeGeneratedNote } from "./generated-note";
import { sceneFolderPath } from "./scene-navigation";
import {
  DEFAULT_PLOT_GRID_CHARACTERS_DIR,
  DEFAULT_PLOT_GRID_OUTPUT_PATH,
  DEFAULT_PLOT_GRID_PLOTS_DIR,
  type IndentedScene,
  type MultipleSceneDraft,
} from "./types";

/** The custom Bases view type registered by the plugin. */
export const PLOT_GRID_VIEW_TYPE = "longform-plotgrid";

/** Prefix for every plot-grid cell property written to a row note. */
export const PLOT_GRID_KEY_PREFIX = "plotgrid_";

/** A plot-grid row property from a Bases view order, in either ID form. */
export type PlotGridRowProperty = {
  /** The property ID exactly as it appears in the view order. */
  id: string;
  /** The frontmatter key, with any `note.` prefix removed. */
  rawKey: string;
};

/**
 * Parses a Bases view `order` entry as a plot-grid row. Obsidian may keep the
 * canonical `note.plotgrid_*` form or normalize it to a bare `plotgrid_*` ID
 * after rewriting the `.base`; both are accepted. `file.*`, `formula.*`, and
 * note properties outside the plot-grid namespace are rejected.
 */
export function plotGridRowProperty(
  propertyId: string
): PlotGridRowProperty | null {
  const rawKey = propertyId.startsWith("note.")
    ? propertyId.slice("note.".length)
    : propertyId;
  return rawKey.startsWith(PLOT_GRID_KEY_PREFIX)
    ? { id: propertyId, rawKey }
    : null;
}

/** The formula name used for the native Base row label. */
export const PLOT_GRID_ROW_LABEL_FORMULA = "plotgrid_row_label";

/** The formula name used to sort plots (Main first), characters, then others. */
export const PLOT_GRID_ROW_RANK_FORMULA = "plotgrid_row_rank";

/**
 * Prefix for rows that come from the plot directory. The newline is part of
 * the label, matching the two-line row header in the native Base.
 */
export const PLOT_GRID_PLOT_LABEL_PREFIX = "(subplot)\n";

/** Prefix for rows that come from the character directory. */
export const PLOT_GRID_CHARACTER_LABEL_PREFIX = "(character)\n";

/** One grid column: a hierarchy node at the configured level. */
export type PlotGridColumn = {
  /** Frontmatter key, e.g. `plotgrid_chapter_1_arrival`. */
  key: string;
  /** A readable header for the column. */
  title: string;
  /** Titles from the root node through this node. */
  path: string[];
};

export type PlotGridDirectories = {
  /** The resolved plot directory, vault-relative (`""` is the vault root). */
  plots: string;
  /** The resolved character directory, vault-relative (`""` is the vault root). */
  characters: string;
  /**
   * The folders the Base filters on. Both are used because the project
   * settings require them to be distinct and non-nested.
   */
  filters: string[];
};

export type PlotGridResult = {
  written: boolean;
  reason:
    | "disabled"
    | "invalid-dirs"
    | "no-columns"
    | "no-notes"
    | "written";
  /** The number of columns used. */
  columns: number;
  /** The number of row notes found. */
  notes: number;
  /** The generated Base path, when one was written. */
  path: string | null;
  /** The directory conflicts that prevented generation, for `invalid-dirs`. */
  conflicts?: PlotGridDirectoryConflict[];
};

/** The resolved vault-relative paths the three plot-grid directories use. */
export type ResolvedPlotGridDirectories = {
  /** The scene folder, resolved from the project note's folder. */
  scene: string;
  /** The resolved plot directory (`""` is the vault root). */
  plots: string;
  /** The resolved character directory (`""` is the vault root). */
  characters: string;
};

/** One of the three configured plot-grid directories. */
export type PlotGridDirectoryKey = "scene" | "plots" | "characters";

/** Why two of the three directories cannot be used together. */
export type PlotGridDirectoryConflictKind = "same" | "nested";

/** A violation of the distinct, non-nested directory rule. */
export type PlotGridDirectoryConflict = {
  first: PlotGridDirectoryKey;
  second: PlotGridDirectoryKey;
  kind: PlotGridDirectoryConflictKind;
};

/**
 * The distinct indentation values in `scenes`, sorted ascending. The index of
 * a value is its zero-based level.
 */
export function plotGridIndents(scenes: IndentedScene[]): number[] {
  const indents = new Set<number>();
  for (const scene of scenes) {
    indents.add(scene.indent);
  }
  return Array.from(indents).sort((left, right) => left - right);
}

/**
 * The hierarchy nodes at a level, in document order. Each node carries the
 * titles of its ancestors so the path remains available for display and for
 * migrating values written before keys were based on the node title alone.
 */
export function plotGridNodesAtLevel(
  scenes: IndentedScene[],
  level: number
): { title: string; path: string[] }[] {
  const indents = plotGridIndents(scenes);
  if (!Number.isInteger(level) || level < 0 || level >= indents.length) {
    return [];
  }

  const indent = indents[level];
  const ancestors: IndentedScene[] = [];
  const nodes: { title: string; path: string[] }[] = [];

  for (const scene of scenes) {
    while (
      ancestors.length > 0 &&
      ancestors[ancestors.length - 1].indent >= scene.indent
    ) {
      ancestors.pop();
    }

    if (scene.indent === indent) {
      nodes.push({
        title: scene.title,
        path: ancestors.map((ancestor) => ancestor.title).concat(scene.title),
      });
    }

    ancestors.push(scene);
  }

  return nodes;
}

/** One autocomplete option for the plot-grid level input. */
export type PlotGridLevelOption = {
  /** The zero-based rank of the distinct indent. */
  level: number;
  /** `0 - (Act 1, Act 2)`, with at most `maxTitles` titles. */
  label: string;
  /** The titles shown in the label (capped at `maxTitles`). */
  titles: string[];
};

/**
 * The level suggestions for a scene hierarchy. Levels are the zero-based ranks
 * of the distinct indents, so non-unit indentation still yields 0, 1, 2, ….
 * Only levels that have at least one non-empty title are returned; empty
 * titles are skipped. The label lists the first `maxTitles` titles joined by
 * `, ` and ends with `, …` when more nodes exist at that level.
 */
export function plotGridLevelOptions(
  scenes: IndentedScene[],
  maxTitles = 3
): PlotGridLevelOption[] {
  const limit = Math.max(0, Math.floor(maxTitles));
  const options: PlotGridLevelOption[] = [];

  plotGridIndents(scenes).forEach((_indent, level) => {
    const titles = plotGridNodesAtLevel(scenes, level)
      .map((node) => node.title.trim())
      .filter((title) => title.length > 0);
    if (titles.length === 0) {
      return;
    }

    const shown = titles.slice(0, limit);
    const contents = shown.join(", ");
    const truncated = shown.length < titles.length;
    const suffix = truncated ? (contents.length > 0 ? ", …" : "…") : "";

    options.push({
      level,
      label: `${level} - (${contents}${suffix})`,
      titles: shown,
    });
  });

  return options;
}

/** Slug one hierarchy segment. Runs of non-alphanumerics become one `_`. */
export function slugPlotGridSegment(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+/, "")
    .replace(/_+$/, "");
}

/**
 * Builds the collision-safe columns for a level. Keys are the slugged title of
 * the node at that level (not its ancestor path), prefixed with `plotgrid_`; a
 * collision appends `_2`, `_3`, and so on.
 */
export function plotGridColumns(
  scenes: IndentedScene[],
  level: number
): PlotGridColumn[] {
  const used = new Set<string>();
  const columns: PlotGridColumn[] = [];

  for (const node of plotGridNodesAtLevel(scenes, level)) {
    const bare = slugPlotGridSegment(node.title) || "node";
    const base = `${PLOT_GRID_KEY_PREFIX}${bare}`;

    let key = base;
    let suffix = 2;
    while (used.has(key)) {
      key = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(key);

    columns.push({ key, title: node.title, path: node.path });
  }

  return columns;
}

/** One hierarchy level and its ordered columns. */
export type PlotGridLevel = {
  /** The zero-based rank of the distinct indent. */
  level: number;
  /** The dynamic label, e.g. `0 - (Act 1, Act 2)`. */
  label: string;
  /** The level's columns, in scene document order. */
  columns: PlotGridColumn[];
};

/**
 * Every hierarchy level that has nodes, top-down, with its columns in scene
 * document order. Labels come from `plotGridLevelOptions`, so they match the
 * levels a user sees in the generated view's dropdown.
 */
export function plotGridLevels(scenes: IndentedScene[]): PlotGridLevel[] {
  const labels = new Map(
    plotGridLevelOptions(scenes).map((option) => [option.level, option.label])
  );
  const levels: PlotGridLevel[] = [];

  plotGridIndents(scenes).forEach((_indent, level) => {
    const columns = plotGridColumns(scenes, level);
    if (columns.length === 0) {
      return;
    }
    levels.push({
      level,
      label: labels.get(level) ?? `${level} - ()`,
      columns,
    });
  });

  return levels;
}

/**
 * The unique columns across every level, ordered top-down (level 0 first) and
 * then in each level's document order. A key shared by more than one level is
 * kept only at its first occurrence, so property lists never repeat it.
 */
export function plotGridAllColumns(
  levels: PlotGridLevel[]
): PlotGridColumn[] {
  const seen = new Set<string>();
  const columns: PlotGridColumn[] = [];

  for (const level of levels) {
    for (const column of level.columns) {
      if (seen.has(column.key)) {
        continue;
      }
      seen.add(column.key);
      columns.push(column);
    }
  }

  return columns;
}

/** The columns of the deepest level: the leaf scenes of the hierarchy. */
export function plotGridDeepestColumns(
  scenes: IndentedScene[]
): PlotGridColumn[] {
  const indents = plotGridIndents(scenes);
  return indents.length === 0
    ? []
    : plotGridColumns(scenes, indents.length - 1);
}

/** The `note.plotgrid_*` IDs for columns, ordered and deduped by key. */
function plotGridNoteProperties(columns: PlotGridColumn[]): string[] {
  const seen = new Set<string>();
  const properties: string[] = [];

  for (const column of columns) {
    const property = `note.${column.key}`;
    if (seen.has(property)) {
      continue;
    }
    seen.add(property);
    properties.push(property);
  }

  return properties;
}

/** A generated view's level filter entry. */
export type PlotGridLevelViewOption = {
  /** `All` or the dynamic `plotGridLevelOptions` label. */
  label: string;
  /** `all` or the zero-based level as a string. */
  value: string;
  /** Ordered `note.plotgrid_*` property IDs belonging to the level. */
  properties: string[];
};

/** The value of the view's `All` level option. */
export const PLOT_GRID_ALL_LEVEL_VALUE = "all";

/**
 * The view's level filter entries: `All` first (every level, top-down and in
 * document order), then each level in scene document order. Both the option
 * list and the emitted YAML use the same order, so the view's rows follow the
 * Scenes tab/tree rather than an alphabetical property set.
 */
export function plotGridLevelViewOptions(
  levels: PlotGridLevel[]
): PlotGridLevelViewOption[] {
  return [
    {
      label: "All",
      value: PLOT_GRID_ALL_LEVEL_VALUE,
      properties: plotGridNoteProperties(plotGridAllColumns(levels)),
    },
    ...levels.map((level) => ({
      label: level.label,
      value: String(level.level),
      properties: plotGridNoteProperties(level.columns),
    })),
  ];
}

/**
 * The view's initial level selection: level 0 when it exists, otherwise the
 * first populated level, otherwise `All`. The custom view uses this only until
 * the user picks a level; the chosen value then survives rerenders.
 */
export function plotGridDefaultLevelValue(
  options: Pick<PlotGridLevelViewOption, "value">[]
): string {
  const levelZero = options.find((option) => option.value === "0");
  if (levelZero != null) {
    return levelZero.value;
  }
  const firstLevel = options.find(
    (option) => option.value !== PLOT_GRID_ALL_LEVEL_VALUE
  );
  return firstLevel?.value ?? PLOT_GRID_ALL_LEVEL_VALUE;
}

/**
 * The key the previous ancestor-path scheme used for each current column,
 * including its collision suffix. Returns a map from the current key to the
 * legacy key so existing values can be moved during generation.
 */
function legacyPlotGridKeys(columns: PlotGridColumn[]): Map<string, string> {
  const used = new Set<string>();
  const keys = new Map<string, string>();

  for (const column of columns) {
    const segments = column.path
      .map(slugPlotGridSegment)
      .filter((segment) => segment.length > 0);
    const bare = segments.length > 0 ? segments.join("__") : "node";
    const base = `${PLOT_GRID_KEY_PREFIX}${bare}`;

    let legacyKey = base;
    let suffix = 2;
    while (used.has(legacyKey)) {
      legacyKey = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(legacyKey);
    keys.set(column.key, legacyKey);
  }

  return keys;
}

/** A normalized, vault-relative directory path (`""` is the vault root). */
function normalizeDirectory(path: string): string {
  return normalizePath(path).replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * True when `path` is the directory itself or anywhere below it. The vault
 * root (`""`) contains every path.
 */
export function isInsidePlotGridDirectory(
  directory: string,
  path: string
): boolean {
  const normalizedDirectory = normalizeDirectory(directory);
  if (normalizedDirectory === "") {
    return true;
  }
  const normalizedPath = normalizeDirectory(path);
  return (
    normalizedPath === normalizedDirectory ||
    normalizedPath.startsWith(`${normalizedDirectory}/`)
  );
}

/**
 * The label a row displays: `(plot)\nName` or `(character)\nName`. Callers
 * pass the resolved, vault-relative directories, which the project settings
 * keep distinct and non-nested. Plots are checked first so nested paths still
 * resolve deterministically.
 */
export function plotGridRowLabel(
  plots: string,
  characters: string,
  path: string,
  name: string
): string {
  if (isInsidePlotGridDirectory(plots, path)) {
    return `${PLOT_GRID_PLOT_LABEL_PREFIX}${name}`;
  }
  if (isInsidePlotGridDirectory(characters, path)) {
    return `${PLOT_GRID_CHARACTER_LABEL_PREFIX}${name}`;
  }
  return name;
}

/**
 * The column group for a row note: `0` for plots, `1` for characters, `2` for
 * anything else. Plots are checked first, matching `plotGridRowLabel`.
 */
export function plotGridRowGroup(
  plots: string,
  characters: string,
  path: string
): 0 | 1 | 2 {
  if (isInsidePlotGridDirectory(plots, path)) {
    return 0;
  }
  return isInsidePlotGridDirectory(characters, path) ? 1 : 2;
}

/** A note's ordering key when it is a column in the transposed grid. */
export type PlotGridRowSortKey = {
  /** Vault-relative note path. */
  path: string;
  /** Note basename (`file.basename`). */
  name: string;
};

/**
 * The row rank shared with the generated Base formula: `0` for the Main plot,
 * `1` for other plots, `2` for characters, and `3` for anything else.
 */
function plotGridRowRank(
  plots: string,
  characters: string,
  row: PlotGridRowSortKey
): number {
  const group = plotGridRowGroup(plots, characters, row.path);
  if (group === 0) {
    return row.name.toLowerCase() === "main" ? 0 : 1;
  }
  return group === 1 ? 2 : 3;
}

/**
 * Orders notes as transposed columns: the Main plot first, then the other
 * plots, then characters, then anything else, alphabetically by name within
 * each group. Ties between equal names fall back to the full path.
 */
export function comparePlotGridRows(
  plots: string,
  characters: string,
  left: PlotGridRowSortKey,
  right: PlotGridRowSortKey
): number {
  const byRank =
    plotGridRowRank(plots, characters, left) -
    plotGridRowRank(plots, characters, right);
  if (byRank !== 0) {
    return byRank;
  }
  const byName = comparePaths(left.name, right.name);
  return byName !== 0 ? byName : comparePaths(left.path, right.path);
}

/** The project folder, falling back to the draft path's parent. */
function projectFolder(app: App, draft: MultipleSceneDraft): string {
  const projectNote = app.vault.getAbstractFileByPath(draft.vaultPath);
  if (projectNote && projectNote.parent) {
    return normalizeDirectory(projectNote.parent.path);
  }
  const index = draft.vaultPath.lastIndexOf("/");
  return index < 0
    ? ""
    : normalizeDirectory(draft.vaultPath.slice(0, index));
}

/**
 * Resolves a configured plot-grid folder. Like `sceneFolderPath`, the value is
 * always relative to the project folder; a leading `/` is only a separator and
 * does not mean the vault root. Output-file paths use `configuredOutputPath`,
 * which keeps its own leading-`/` behavior.
 */
export function resolvePlotGridDirectory(
  app: App,
  draft: MultipleSceneDraft,
  configured: string | null | undefined,
  fallback: string
): string {
  const value =
    typeof configured === "string" && configured.trim().length > 0
      ? configured.trim()
      : fallback;

  const folder = projectFolder(app, draft);
  return normalizeDirectory(folder === "" ? value : `${folder}/${value}`);
}

/**
 * Resolves the scene folder and the two plot-grid row folders to normalized,
 * vault-relative paths. All three are relative to the project note's folder;
 * a leading `/` is just a separator and never means the vault root.
 */
export function resolvePlotGridDirectories(
  app: App,
  draft: MultipleSceneDraft
): ResolvedPlotGridDirectories {
  return {
    scene: normalizeDirectory(sceneFolderPath(draft, app.vault)),
    plots: resolvePlotGridDirectory(
      app,
      draft,
      draft.plotGridPlotsDir,
      DEFAULT_PLOT_GRID_PLOTS_DIR
    ),
    characters: resolvePlotGridDirectory(
      app,
      draft,
      draft.plotGridCharactersDir,
      DEFAULT_PLOT_GRID_CHARACTERS_DIR
    ),
  };
}

/** Human-readable names for the three plot-grid directories. */
const PLOT_GRID_DIRECTORY_LABELS: Record<PlotGridDirectoryKey, string> = {
  scene: "Scene folder",
  plots: "Subplot folder",
  characters: "Character folder",
};

const PLOT_GRID_DIRECTORY_PAIRS: [
  PlotGridDirectoryKey,
  PlotGridDirectoryKey
][] = [
  ["scene", "plots"],
  ["scene", "characters"],
  ["plots", "characters"],
];

/**
 * The rule violations for three resolved directories. Every pair must be
 * distinct and must not contain the other: none may be equal and none may be an
 * ancestor or descendant of another. The vault root (`""`) is an ancestor of
 * every path. This is a pure check over already-resolved paths.
 */
export function plotGridDirectoryConflicts(
  directories: ResolvedPlotGridDirectories
): PlotGridDirectoryConflict[] {
  const conflicts: PlotGridDirectoryConflict[] = [];

  for (const [first, second] of PLOT_GRID_DIRECTORY_PAIRS) {
    const left = normalizeDirectory(directories[first]);
    const right = normalizeDirectory(directories[second]);
    if (left === right) {
      conflicts.push({ first, second, kind: "same" });
    } else if (
      isInsidePlotGridDirectory(left, right) ||
      isInsidePlotGridDirectory(right, left)
    ) {
      conflicts.push({ first, second, kind: "nested" });
    }
  }

  return conflicts;
}

/** One conflict as a sentence suitable for a Notice or inline error. */
export function describePlotGridDirectoryConflict(
  conflict: PlotGridDirectoryConflict
): string {
  const first = PLOT_GRID_DIRECTORY_LABELS[conflict.first];
  const second = PLOT_GRID_DIRECTORY_LABELS[conflict.second];
  return conflict.kind === "same"
    ? `${first} and ${second} must not be the same folder.`
    : `${first} and ${second} must not be nested inside one another.`;
}

/** All conflicts joined into one message. */
export function plotGridDirectoryConflictMessage(
  conflicts: PlotGridDirectoryConflict[]
): string {
  return conflicts.map(describePlotGridDirectoryConflict).join(" ");
}

/**
 * Resolves both row directories and the folder filter(s) for them. The project
 * settings keep the directories distinct and non-nested, so both filters are
 * used; an equal pair is still deduplicated for callers with stale settings.
 */
export function plotGridDirectories(
  app: App,
  draft: MultipleSceneDraft
): PlotGridDirectories {
  const plots = resolvePlotGridDirectory(
    app,
    draft,
    draft.plotGridPlotsDir,
    DEFAULT_PLOT_GRID_PLOTS_DIR
  );
  const characters = resolvePlotGridDirectory(
    app,
    draft,
    draft.plotGridCharactersDir,
    DEFAULT_PLOT_GRID_CHARACTERS_DIR
  );

  const filters =
    plots === characters ? [plots] : [plots, characters];

  return { plots, characters, filters };
}

/** True when a vault path belongs to one of a project's row directories. */
export function isPlotGridPath(
  app: App,
  draft: MultipleSceneDraft,
  path: string
): boolean {
  const directories = plotGridDirectories(app, draft);
  return directories.filters.some((directory) =>
    isInsidePlotGridDirectory(directory, path)
  );
}

function comparePaths(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}

/**
 * All `.md` files under the row directories, deduped by path. Plots come
 * first, then characters; each group is sorted alphabetically by path.
 */
export function plotGridRowFiles(
  app: App,
  directories: PlotGridDirectories
): TFile[] {
  const byPath = new Map<string, TFile>();
  const folders =
    directories.plots === directories.characters
      ? [directories.plots]
      : [directories.plots, directories.characters];

  for (const folder of folders) {
    const files = app.vault
      .getMarkdownFiles()
      .filter((file) => isInsidePlotGridDirectory(folder, file.path))
      .sort((left, right) => comparePaths(left.path, right.path));

    for (const file of files) {
      if (!byPath.has(file.path)) {
        byPath.set(file.path, file);
      }
    }
  }

  return Array.from(byPath.values());
}

function hasFrontmatterKey(
  frontmatter: Record<string, unknown> | undefined,
  key: string
): boolean {
  return (
    frontmatter != null &&
    Object.prototype.hasOwnProperty.call(frontmatter, key)
  );
}

/** True when a plot-grid cell has no meaningful value yet. */
function isEmptyPlotGridValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0 || value.every(isEmptyPlotGridValue);
  }
  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length === 0;
  }
  return false;
}

/**
 * Adds each missing level's column key to a row note's frontmatter as an empty
 * string and keeps every existing `plotgrid_*` key and value. Values written
 * under a legacy ancestor-path key are moved to the current title-based key,
 * but only when the current key is absent or empty; the migrated legacy key is
 * then removed. One `processFrontMatter` call is made per note that needs a
 * change; unrelated keys and the order of existing keys are preserved.
 */
async function ensurePlotGridDataFor(
  app: App,
  columns: PlotGridColumn[],
  files: TFile[]
): Promise<number> {
  let notesWritten = 0;
  const legacyKeys = legacyPlotGridKeys(columns);

  for (const file of files) {
    const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
    const missing = columns.filter(
      (column) => !hasFrontmatterKey(frontmatter, column.key)
    );
    const migrations = columns
      .map((column) => ({
        key: column.key,
        legacyKey: legacyKeys.get(column.key) ?? column.key,
      }))
      .filter(
        ({ key, legacyKey }) =>
          key !== legacyKey &&
          hasFrontmatterKey(frontmatter, legacyKey) &&
          (!hasFrontmatterKey(frontmatter, key) ||
            isEmptyPlotGridValue(frontmatter?.[key]))
      );
    if (missing.length === 0 && migrations.length === 0) {
      continue;
    }

    await app.fileManager.processFrontMatter(file, (next) => {
      for (const { key, legacyKey } of migrations) {
        if (!hasFrontmatterKey(next, legacyKey)) {
          continue;
        }
        if (
          hasFrontmatterKey(next, key) &&
          !isEmptyPlotGridValue(next[key])
        ) {
          continue;
        }
        next[key] = next[legacyKey];
        // The legacy key is the old form of this same level's cell. Other
        // levels keep their own keys; this only removes the migrated duplicate.
        if (hasFrontmatterKey(next, legacyKey)) {
          delete next[legacyKey];
        }
      }
      for (const column of missing) {
        if (!hasFrontmatterKey(next, column.key)) {
          next[column.key] = "";
        }
      }
    });
    notesWritten += 1;
  }

  return notesWritten;
}

/**
 * Ensures every level's prefixed column keys exist on every row note,
 * preserving every existing value. This is the public step-3 entry point used
 * by the observer; it does nothing when the hierarchy has no levels or no
 * notes were found.
 */
export async function ensurePlotGridData(
  app: App,
  draft: MultipleSceneDraft
): Promise<number> {
  const columns = plotGridAllColumns(plotGridLevels(draft.scenes));
  if (columns.length === 0) {
    return 0;
  }
  const directories = plotGridDirectories(app, draft);
  return ensurePlotGridDataFor(
    app,
    columns,
    plotGridRowFiles(app, directories)
  );
}

/** Quotes a value as a single-quoted YAML scalar. */
function yamlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** One `file.inFolder(...)` expression for a resolved directory. */
function folderFilter(directory: string): string {
  return `file.inFolder(${JSON.stringify(directory === "" ? "/" : directory)})`;
}

/**
 * The Bases label formula. Each labeled cell is a Link (`file.asLink`), so
 * the note name stays clickable in the native table. `JSON.stringify` escapes
 * the newline as `\n`, which is the escape Obsidian's double-quoted formula
 * strings parse (they are decoded with `JSON.parse`). Plots are checked before
 * characters, which gives nested directories a deterministic precedence.
 */
function rowLabelFormula(plots: string, characters: string): string {
  const plotLabel = JSON.stringify(PLOT_GRID_PLOT_LABEL_PREFIX);
  const characterLabel = JSON.stringify(PLOT_GRID_CHARACTER_LABEL_PREFIX);
  return [
    `if(${folderFilter(plots)}, file.asLink(${plotLabel} + file.name),`,
    `if(${folderFilter(characters)}, file.asLink(${characterLabel} + file.name),`,
    "file.asLink()))",
  ].join(" ");
}

/**
 * The Bases row-rank formula: the Main plot ranks 0, other plots 1,
 * characters 2, and anything else 3. `file.basename` has no extension, and
 * `lower()` makes the Main match case-insensitive.
 */
function rowRankFormula(plots: string, characters: string): string {
  return [
    `if(${folderFilter(plots)},`,
    'if(file.basename.lower() == "main", 0, 1),',
    `if(${folderFilter(characters)}, 2, 3))`,
  ].join(" ");
}

function renderPlotGridBaseContents(
  levels: PlotGridLevel[],
  directories: PlotGridDirectories
): string {
  const columns = plotGridAllColumns(levels);
  const rowProperties = plotGridNoteProperties(columns);
  const levelOptions = plotGridLevelViewOptions(levels);
  const filters = directories.filters.map(folderFilter);
  const labeled = directories.plots !== directories.characters;
  const lines: string[] = [];

  if (filters.length === 1) {
    lines.push(`filters: ${yamlQuote(filters[0])}`);
  } else {
    lines.push("filters:", "  or:");
    for (const filter of filters) {
      lines.push(`    - ${yamlQuote(filter)}`);
    }
  }

  lines.push(
    "formulas:",
    `  ${PLOT_GRID_ROW_RANK_FORMULA}: |-`,
    `    ${rowRankFormula(directories.plots, directories.characters)}`
  );
  if (labeled) {
    lines.push(
      `  ${PLOT_GRID_ROW_LABEL_FORMULA}: |-`,
      `    ${rowLabelFormula(directories.plots, directories.characters)}`
    );
  }

  // The order is shared by both views: the custom view filters the row
  // properties down to `note.plotgrid_*`, and the native table shows the
  // notes-as-rows fallback. The row label formula replaces file.name as the
  // visible row name when the directories differ. Both views sort by the rank
  // formula first so the Main plot leads, then by name. Columns are the unique
  // all-levels columns, top-down and in scene document order, so the native
  // fallback and the custom view's All option list them identically.
  const order: string[] = [];
  if (labeled) {
    order.push(`formula.${PLOT_GRID_ROW_LABEL_FORMULA}`);
  } else {
    order.push("file.name");
  }
  order.push(...rowProperties);

  const sort = [
    "    sort:",
    `      - property: formula.${PLOT_GRID_ROW_RANK_FORMULA}`,
    "        direction: ASC",
    "      - property: file.name",
    "        direction: ASC",
  ];

  lines.push(
    "views:",
    `  - type: ${PLOT_GRID_VIEW_TYPE}`,
    "    name: Subplot Grid",
    `    plotsDir: ${yamlQuote(directories.plots)}`,
    `    charactersDir: ${yamlQuote(directories.characters)}`,
    "    levels:"
  );
  // The custom view renders rows from these ordered property IDs. `All` is
  // first and contains every level top-down, so selecting it follows the same
  // document order as the native table's columns.
  for (const option of levelOptions) {
    lines.push(`      - label: ${yamlQuote(option.label)}`);
    lines.push(`        value: ${yamlQuote(option.value)}`);
    lines.push("        properties:");
    for (const property of option.properties) {
      lines.push(`          - ${property}`);
    }
  }
  lines.push("    order:");
  for (const property of order) {
    lines.push(`      - ${property}`);
  }
  lines.push(...sort);
  lines.push(
    "  - type: table",
    "    name: Subplot Grid (Table)",
    "    order:"
  );
  for (const property of order) {
    lines.push(`      - ${property}`);
  }
  lines.push(...sort);
  lines.push("properties:");
  if (labeled) {
    lines.push(
      `  formula.${PLOT_GRID_ROW_LABEL_FORMULA}:`,
      '    displayName: "Name"'
    );
  }
  for (const column of columns) {
    lines.push(
      `  note.${column.key}:`,
      `    displayName: ${JSON.stringify(column.title)}`
    );
  }

  return `${lines.join("\n")}\n`;
}

/**
 * Renders the native (notes-as-rows) Base. Returns `null` when there is no
 * grid to show: no hierarchy levels, or no row notes.
 */
export function renderPlotGridBase(
  app: App,
  draft: MultipleSceneDraft
): string | null {
  const levels = plotGridLevels(draft.scenes);
  if (levels.length === 0) {
    return null;
  }

  const directories = plotGridDirectories(app, draft);
  if (plotGridRowFiles(app, directories).length === 0) {
    return null;
  }

  return renderPlotGridBaseContents(levels, directories);
}

/**
 * Ensures every level's keys exist and writes the native Base. Nothing is
 * written (and any existing Base is left alone) when the feature is disabled,
 * the hierarchy has no levels, or no row notes are found.
 */
export async function writePlotGrid(
  app: App,
  draft: MultipleSceneDraft
): Promise<PlotGridResult> {
  if (!draft.plotGridEnabled) {
    return {
      written: false,
      reason: "disabled",
      columns: 0,
      notes: 0,
      path: null,
    };
  }

  const conflicts = plotGridDirectoryConflicts(
    resolvePlotGridDirectories(app, draft)
  );
  if (conflicts.length > 0) {
    return {
      written: false,
      reason: "invalid-dirs",
      columns: 0,
      notes: 0,
      path: null,
      conflicts,
    };
  }

  const levels = plotGridLevels(draft.scenes);
  const columns = plotGridAllColumns(levels);
  if (columns.length === 0) {
    return {
      written: false,
      reason: "no-columns",
      columns: 0,
      notes: 0,
      path: null,
    };
  }

  const directories = plotGridDirectories(app, draft);
  const files = plotGridRowFiles(app, directories);
  if (files.length === 0) {
    return {
      written: false,
      reason: "no-notes",
      columns: columns.length,
      notes: 0,
      path: null,
    };
  }

  await ensurePlotGridDataFor(app, columns, files);

  const path = configuredOutputPath(
    app,
    draft,
    draft.plotGridOutputPath,
    DEFAULT_PLOT_GRID_OUTPUT_PATH,
    ".base"
  );
  await writeGeneratedNote(
    app,
    path,
    renderPlotGridBaseContents(levels, directories)
  );

  return {
    written: true,
    reason: "written",
    columns: columns.length,
    notes: files.length,
    path,
  };
}
