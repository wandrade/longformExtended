import { TFile, type App } from "obsidian";
import { get } from "svelte/store";

import { auxiliaryFolder, auxiliaryNoteFiles } from "./auxiliary-notes";
import {
  configuredOutputPath,
  writeGeneratedNote,
} from "./generated-note";
import { isInsidePlotGridDirectory } from "./plot-grid";
import { findScene, sceneFolderPath, scenePath } from "./scene-navigation";
import { drafts as draftsStore, draftWordCounts } from "./stores";
import {
  DEFAULT_KANBAN_COLUMNS,
  DEFAULT_KANBAN_OUTPUT_PATH,
  KANBAN_HELPER_TAG,
  KANBAN_INCORRECT_LABEL,
  KANBAN_STATUS_TAG,
  KANBAN_UNASSIGNED_LABEL,
  type MultipleSceneDraft,
} from "./types";

export type KanbanCard = { title: string; path: string };
export type KanbanError = { sceneTitle: string; status: string };
export type KanbanResult = {
  title: string;
  columns: string[];
  cards: Record<string, KanbanCard[]>;
  unassigned: KanbanCard[];
  errors: KanbanError[];
  hasAnyStatus: boolean;
};

/**
 * The last status/helper values the plugin itself observed or wrote. Drag
 * detection compares against these so that a Bases drop (helper changed,
 * status unchanged) can be told apart from a direct status edit.
 */
type SceneState = { status: string | null; helper: string };
const sceneStates = new Map<string, SceneState>();

/**
 * A helper/status write leaves the metadata cache stale for a short moment.
 * If the next build reads those pre-write values back, it would undo the
 * write (for example, snapping a dragged card back to its old column). These
 * entries mark the values that were replaced so the stale cache can be
 * ignored until it catches up.
 */
type RecentWrite = {
  beforeStatus: string | null;
  beforeHelper: string;
  afterStatus: string | null;
  afterHelper: string;
  at: number;
};
const recentWrites = new Map<string, RecentWrite>();
const CACHE_SETTLE_MS = 5000;

/** Splits column titles on spaces, honoring single or double quotes. */
export function parseKanbanColumns(raw: string): string[] {
  const columns: string[] = [];
  const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    if (value.length > 0) {
      columns.push(value);
    }
  }
  return columns;
}

/** Coerces a frontmatter value to the same text a template literal would. */
function frontmatterValueToString(raw: unknown): string {
  if (typeof raw === "string") {
    return raw;
  }
  if (
    typeof raw === "number" ||
    typeof raw === "boolean" ||
    typeof raw === "bigint"
  ) {
    return String(raw);
  }
  if (Array.isArray(raw)) {
    return raw.map((item) => frontmatterValueToString(item)).join(",");
  }
  return "[object Object]";
}

/** A frontmatter status as a trimmed string, or null when it is empty. */
function statusValue(raw: unknown): string | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  const value = frontmatterValueToString(raw).trim();
  return value === "" ? null : value;
}

/** A frontmatter helper value as a trimmed string ("" when absent). */
function helperValue(raw: unknown): string {
  if (raw === undefined || raw === null) {
    return "";
  }
  return frontmatterValueToString(raw).trim();
}

/**
 * The helper (board membership + grouping) value for a status. Configured
 * statuses keep their own value so each column is distinct; every other
 * non-empty status collapses into the single "Incorrectly Assigned" column.
 * Missing statuses either join "Unassigned" or leave the board.
 */
function expectedHelper(
  status: string | null,
  columns: string[],
  showUnassigned: boolean
): string | null {
  if (status === null) {
    return showUnassigned ? KANBAN_UNASSIGNED_LABEL : null;
  }
  return columns.includes(status) ? status : KANBAN_INCORRECT_LABEL;
}

/**
 * Applies a Bases drag to the real status. A drop writes the helper property,
 * so the helper changing while the status stays put is a drag. If both
 * changed, the status was edited directly and wins.
 */
function reconcileStatus(
  path: string,
  status: string | null,
  helper: string,
  columns: string[],
  showUnassigned: boolean
): string | null {
  const previous = sceneStates.get(path);
  if (!previous) {
    // First sight after a reload: never rewrite status from a helper that may
    // predate the plugin (a change made while it was disabled is discarded).
    return status;
  }

  const statusChanged = previous.status !== status;
  const helperChanged = previous.helper !== helper;
  if (!helperChanged || statusChanged) {
    return status;
  }

  if (columns.includes(helper)) {
    return helper;
  }
  if (showUnassigned && helper === KANBAN_UNASSIGNED_LABEL) {
    return null;
  }
  // "Incorrectly Assigned", a removed column, or an unknown value means the
  // drop has no status to write, so the card snaps back to its current status.
  return status;
}

/** Reads status/helper, substituting a recently written value if the cache lags. */
function readCachedState(
  path: string,
  cachedStatus: string | null,
  cachedHelper: string
): SceneState {
  let status = cachedStatus;
  let helper = cachedHelper;

  const pending = recentWrites.get(path);
  if (pending) {
    const expired = Date.now() - pending.at > CACHE_SETTLE_MS;
    const showsBefore =
      status === pending.beforeStatus && helper === pending.beforeHelper;
    const showsAfter =
      status === pending.afterStatus && helper === pending.afterHelper;

    if (!expired && showsBefore) {
      status = pending.afterStatus;
      helper = pending.afterHelper;
    } else if (expired || showsAfter) {
      recentWrites.delete(path);
    } else {
      // Neither the old nor the written value: someone edited the note since.
      recentWrites.delete(path);
    }
  }

  return { status, helper };
}

/** Records a write so a lagging cache cannot undo it on the next build. */
function recordWrite(
  path: string,
  beforeStatus: string | null,
  beforeHelper: string,
  afterStatus: string | null,
  afterHelper: string | null
): void {
  recentWrites.set(path, {
    beforeStatus,
    beforeHelper,
    afterStatus,
    afterHelper: afterHelper ?? "",
    at: Date.now(),
  });
}

/**
 * Removes the helper from notes under the scene folder that are not shown
 * scenes of this project (unlisted notes and structural containers). The
 * helper doubles as the board's membership marker, so a stale value would
 * otherwise keep an unlisted note on the board. Notes that belong to another
 * scenes project sharing the folder are left alone.
 */
async function clearStaleHelpers(
  app: App,
  draft: MultipleSceneDraft,
  activePaths: Set<string>
): Promise<void> {
  const folder = sceneFolderPath(draft, app.vault);
  const prefix =
    folder === "" || folder === "/" ? "" : `${folder.replace(/\/+$/, "")}/`;
  const allDrafts = get(draftsStore);

  for (const file of app.vault.getMarkdownFiles()) {
    if (!file.path.startsWith(prefix) || activePaths.has(file.path)) {
      continue;
    }

    const located = findScene(file.path, allDrafts);
    if (located && located.draft.vaultPath !== draft.vaultPath) {
      continue;
    }

    const cached = app.metadataCache.getFileCache(file);
    const helper = helperValue(cached?.frontmatter?.[KANBAN_HELPER_TAG]);
    if (helper === "") {
      sceneStates.delete(file.path);
      continue;
    }

    // The cache may still show a helper the previous build already removed.
    const pending = recentWrites.get(file.path);
    if (
      pending &&
      pending.afterHelper === "" &&
      pending.beforeHelper === helper &&
      Date.now() - pending.at <= CACHE_SETTLE_MS
    ) {
      continue;
    }

    await app.fileManager.processFrontMatter(
      file,
      (frontmatter: Record<string, unknown>) => {
        delete frontmatter[KANBAN_HELPER_TAG];
      }
    );
    recordWrite(file.path, null, helper, null, null);
    sceneStates.delete(file.path);
  }
}

/**
 * Reads one note's status/helper, reconciles a Bases drag into the real status,
 * writes anything missing, and files the note into its column. Returns true
 * when the note has a status (so the board has at least one card).
 */
async function processKanbanNote(
  app: App,
  title: string,
  path: string,
  file: TFile,
  columns: string[],
  showUnassigned: boolean,
  cards: Record<string, KanbanCard[]>,
  unassigned: KanbanCard[],
  errors: KanbanError[]
): Promise<boolean> {
  const cached = app.metadataCache.getFileCache(file);
  if (!cached) {
    // Not indexed yet. Leave it active so cleanup does not strip its helper;
    // the next rebuild will pick it up once the cache is ready.
    return false;
  }
  const cachedStatus = statusValue(cached.frontmatter?.[KANBAN_STATUS_TAG]);
  const cachedHelper = helperValue(cached.frontmatter?.[KANBAN_HELPER_TAG]);
  const observed = readCachedState(path, cachedStatus, cachedHelper);

  const status = reconcileStatus(
    path,
    observed.status,
    observed.helper,
    columns,
    showUnassigned
  );
  const helper = expectedHelper(status, columns, showUnassigned);

  if (observed.status !== status || observed.helper !== (helper ?? "")) {
    const beforeStatus = observed.status;
    const beforeHelper = observed.helper;
    await app.fileManager.processFrontMatter(
      file,
      (frontmatter: Record<string, unknown>) => {
        if (beforeStatus !== status) {
          if (status === null) {
            delete frontmatter[KANBAN_STATUS_TAG];
          } else {
            frontmatter[KANBAN_STATUS_TAG] = status;
          }
        }
        if (helper === null) {
          delete frontmatter[KANBAN_HELPER_TAG];
        } else {
          frontmatter[KANBAN_HELPER_TAG] = helper;
        }
      }
    );
    recordWrite(path, beforeStatus, beforeHelper, status, helper);
  }
  sceneStates.set(path, { status, helper: helper ?? "" });

  if (status === null) {
    unassigned.push({ title, path });
    return false;
  }

  if (!columns.includes(status)) {
    errors.push({ sceneTitle: title, status });
    return true;
  }

  cards[status].push({ title, path });
  return true;
}

/**
 * Groups scenes into their configured kanban columns by status and keeps the
 * board helper property (`longformKanbanStatus`) in sync.
 *
 * The board must group by a writable note property: Bases only writes a
 * dropped card's group back to the note for an editable property, and formula
 * properties make cards undraggable. The helper is that property. Configured
 * statuses use the column title as their helper value; invalid statuses share
 * "Incorrectly Assigned"; missing statuses use "Unassigned" only when that
 * column is enabled.
 *
 * When `kanbanIncludePlots` is set, notes from the configured Plot Folder are
 * processed exactly like scenes. Character-folder notes are never included.
 */
export async function buildKanban(
  app: App,
  draft: MultipleSceneDraft
): Promise<KanbanResult> {
  const columns = parseKanbanColumns(draft.kanbanColumns);
  if (columns.length === 0) {
    columns.push(...parseKanbanColumns(DEFAULT_KANBAN_COLUMNS));
  }
  const showUnassigned = draft.kanbanShowUnassigned;

  const cards: Record<string, KanbanCard[]> = {};
  for (const column of columns) {
    cards[column] = [];
  }

  const unassigned: KanbanCard[] = [];
  const errors: KanbanError[] = [];
  const activePaths = new Set<string>();
  let hasAnyStatus = false;

  for (let index = 0; index < draft.scenes.length; index++) {
    const scene = draft.scenes[index];
    const next = draft.scenes[index + 1];
    if (next && next.indent > scene.indent) {
      continue;
    }

    const path = scenePath(scene.title, draft, app.vault);
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      continue;
    }

    activePaths.add(path);
    if (
      await processKanbanNote(
        app,
        scene.title,
        path,
        file,
        columns,
        showUnassigned,
        cards,
        unassigned,
        errors
      )
    ) {
      hasAnyStatus = true;
    }
  }

  if (draft.kanbanIncludePlots) {
    for (const note of auxiliaryNoteFiles(app, draft, "plots")) {
      if (activePaths.has(note.path)) {
        continue;
      }
      const file = app.vault.getAbstractFileByPath(note.path);
      if (!(file instanceof TFile)) {
        continue;
      }

      activePaths.add(note.path);
      if (
        await processKanbanNote(
          app,
          note.name,
          note.path,
          file,
          columns,
          showUnassigned,
          cards,
          unassigned,
          errors
        )
      ) {
        hasAnyStatus = true;
      }
    }
  }

  await clearStaleHelpers(app, draft, activePaths);

  return {
    title: draft.title,
    columns,
    cards,
    unassigned,
    errors,
    hasAnyStatus,
  };
}

/** Writes a native Bases kanban beside the compiled manuscript. */
export async function writeKanbanBase(
  app: App,
  draft: MultipleSceneDraft,
  result: KanbanResult
): Promise<void> {
  if (!result.hasAnyStatus) {
    return;
  }

  const path = configuredOutputPath(
    app,
    draft,
    draft.kanbanOutputPath,
    DEFAULT_KANBAN_OUTPUT_PATH,
    ".base"
  );
  await writeGeneratedNote(app, path, renderKanbanBase(app, draft, result));
}

/** Writes each assigned scene's word count into its frontmatter. */
export async function writeKanbanWordCounts(
  app: App,
  draft: MultipleSceneDraft,
  result: KanbanResult
): Promise<void> {
  if (!draft.kanbanEnabled || !draft.kanbanSaveWordCounts) {
    return;
  }

  const storedCounts = get(draftWordCounts)[draft.vaultPath];
  if (!storedCounts || typeof storedCounts !== "object") {
    return;
  }
  const counts = storedCounts;
  // Plot notes have no draft word counts; never write `wordCount` to them.
  const plotFolder = auxiliaryFolder(app, draft, "plots");

  const written = new Set<string>();
  for (const cards of Object.values(result.cards)) {
    for (const card of cards) {
      if (written.has(card.path)) {
        continue;
      }
      written.add(card.path);

      if (isInsidePlotGridDirectory(plotFolder, card.path)) {
        continue;
      }

      const count = counts[card.title];
      if (typeof count !== "number") {
        continue;
      }

      const file = app.vault.getAbstractFileByPath(card.path);
      if (!(file instanceof TFile)) {
        continue;
      }

      const current = app.metadataCache.getFileCache(file)?.frontmatter?.[
        "wordCount"
      ] as unknown;
      if (current === count) {
        continue;
      }

      await app.fileManager.processFrontMatter(
        file,
        (frontmatter: Record<string, unknown>) => {
          frontmatter["wordCount"] = count;
        }
      );
    }
  }
}

/** Quotes a value as a single-quoted YAML scalar. */
function yamlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function renderKanbanBase(
  app: App,
  draft: MultipleSceneDraft,
  result: KanbanResult
): string {
  const showUnassigned = draft.kanbanShowUnassigned;

  // groupOrder is a visibility whitelist: only these groups are shown, in this
  // order. Invalid statuses all share one helper value, so they cannot create
  // extra columns.
  const groupOrder = [...result.columns];
  if (
    result.errors.length > 0 &&
    !groupOrder.includes(KANBAN_INCORRECT_LABEL)
  ) {
    groupOrder.push(KANBAN_INCORRECT_LABEL);
  }
  if (
    showUnassigned &&
    result.unassigned.length > 0 &&
    !groupOrder.includes(KANBAN_UNASSIGNED_LABEL)
  ) {
    groupOrder.push(KANBAN_UNASSIGNED_LABEL);
  }

  const groupOrderLines = groupOrder.map(
    (column) => `      - ${JSON.stringify(column)}`
  );

  // The helper is both the membership marker and the grouped property, so
  // notes without it (unlisted notes, containers, hidden unassigned notes) are
  // excluded. Grouping by a writable note property keeps cards draggable.
  // With Include plots, the board accepts notes from either the scene folder
  // or the configured plot folder; character notes are never included.
  const plotFolder = draft.kanbanIncludePlots
    ? auxiliaryFolder(app, draft, "plots")
    : null;
  const plotFolderFilter =
    plotFolder === null ? null : plotFolder === "" ? "/" : plotFolder;
  const folderFilters = [
    `file.inFolder(${JSON.stringify(sceneFolderPath(draft, app.vault))})`,
  ];
  if (plotFolderFilter !== null) {
    folderFilters.push(
      `file.inFolder(${JSON.stringify(plotFolderFilter)})`
    );
  }

  const filterLines: string[] = ["filters:", "  and:"];
  if (folderFilters.length === 1) {
    filterLines.push(`    - ${yamlQuote(folderFilters[0])}`);
  } else {
    filterLines.push("    - or:");
    for (const filter of folderFilters) {
      filterLines.push(`        - ${yamlQuote(filter)}`);
    }
  }
  filterLines.push(
    `    - ${yamlQuote(`!note.${KANBAN_HELPER_TAG}.isEmpty()`)}`
  );

  // Plot cards have no draft word counts, so with Include plots the word-count
  // column is a display-only formula that blanks plots while scenes keep
  // showing the value written to their `wordCount` property.
  const useWordCountFormula =
    plotFolderFilter !== null && draft.kanbanSaveWordCounts;
  const formulaLines = useWordCountFormula
    ? [
        "formulas:",
        "  kanban_word_count: |-",
        `    if(file.inFolder(${JSON.stringify(
          plotFolderFilter
        )}), "", wordCount)`,
      ]
    : [];
  const propertyLines = useWordCountFormula
    ? [
        "properties:",
        "  formula.kanban_word_count:",
        '    displayName: "Word Count"',
      ]
    : [];

  const cardProperties = ["file.name"];
  if (draft.kanbanSaveWordCounts) {
    cardProperties.push(
      useWordCountFormula ? "formula.kanban_word_count" : "note.wordCount"
    );
  }

  const lines = [
    ...filterLines,
    ...formulaLines,
    "views:",
    "  - type: kanban",
    "    name: Kanban",
    "    groupBy:",
    `      property: note.${KANBAN_HELPER_TAG}`,
    "      direction: ASC",
    "    groupOrder:",
    ...groupOrderLines,
    ...(cardProperties.length > 1
      ? ["    order:", ...cardProperties.map((property) => `      - ${property}`)]
      : []),
    ...propertyLines,
  ];

  return `${lines.join("\n")}\n`;
}
