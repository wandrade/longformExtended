import { TFile, type App } from "obsidian";
import { get } from "svelte/store";

import { auxiliaryFolder, auxiliaryNoteFiles } from "./auxiliary-notes";
import {
  configuredOutputPath,
  writeGeneratedNote,
} from "./generated-note";
import { parseKanbanColumns } from "./kanban-status";
import { isInsidePlotGridDirectory } from "./plot-grid";
import { sceneFolderPath, scenePath } from "./scene-navigation";
import { draftWordCounts } from "./stores";
import {
  DEFAULT_KANBAN_COLUMNS,
  DEFAULT_KANBAN_OUTPUT_PATH,
  KANBAN_INCORRECT_LABEL,
  KANBAN_STATUS_TAG,
  type MultipleSceneDraft,
} from "./types";

export { parseKanbanColumns };

export type KanbanCard = { title: string; path: string };
export type KanbanResult = {
  title: string;
  columns: string[];
  cards: Record<string, KanbanCard[]>;
  unassigned: KanbanCard[];
  hasIncorrectStatus: boolean;
  hasAnyStatus: boolean;
};

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

/**
 * Reads one note's status and files it into its column. A non-empty status
 * that matches no configured column is rewritten to the reserved
 * "Incorrectly Assigned" value, so it stays visible in one shared column.
 * Reports whether the note has a status and whether it was rewritten.
 */
async function processKanbanNote(
  app: App,
  title: string,
  file: TFile,
  columns: string[],
  cards: Record<string, KanbanCard[]>,
  unassigned: KanbanCard[]
): Promise<{ hasStatus: boolean; incorrect: boolean }> {
  const cached = app.metadataCache.getFileCache(file);
  if (!cached) {
    // Not indexed yet; the next rebuild will pick it up once the cache is ready.
    return { hasStatus: false, incorrect: false };
  }
  const status = statusValue(cached.frontmatter?.[KANBAN_STATUS_TAG]);

  if (status === null) {
    unassigned.push({ title, path: file.path });
    return { hasStatus: false, incorrect: false };
  }

  if (!columns.includes(status)) {
    if (status !== KANBAN_INCORRECT_LABEL) {
      await app.fileManager.processFrontMatter(
        file,
        (frontmatter: Record<string, unknown>) => {
          frontmatter[KANBAN_STATUS_TAG] = KANBAN_INCORRECT_LABEL;
        }
      );
    }
    return { hasStatus: true, incorrect: true };
  }

  cards[status].push({ title, path: file.path });
  return { hasStatus: true, incorrect: false };
}

/**
 * Groups scenes into their configured kanban columns by their `status`.
 *
 * The generated board groups by `note.status`, a writable note property, so
 * Bases writes a dragged card's new column back to the note directly. Notes
 * whose status matches no configured column are rewritten to the reserved
 * "Incorrectly Assigned" label; notes with no status are collected in
 * `unassigned`.
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

  const cards: Record<string, KanbanCard[]> = {};
  for (const column of columns) {
    cards[column] = [];
  }

  const unassigned: KanbanCard[] = [];
  const activePaths = new Set<string>();
  let hasAnyStatus = false;
  let hasIncorrectStatus = false;

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
    const sceneResult = await processKanbanNote(
      app,
      scene.title,
      file,
      columns,
      cards,
      unassigned
    );
    if (sceneResult.hasStatus) {
      hasAnyStatus = true;
    }
    if (sceneResult.incorrect) {
      hasIncorrectStatus = true;
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
      const noteResult = await processKanbanNote(
        app,
        note.name,
        file,
        columns,
        cards,
        unassigned
      );
      if (noteResult.hasStatus) {
        hasAnyStatus = true;
      }
      if (noteResult.incorrect) {
        hasIncorrectStatus = true;
      }
    }
  }

  return {
    title: draft.title,
    columns,
    cards,
    unassigned,
    hasIncorrectStatus,
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
  // order. Unrecognized statuses are rewritten to one reserved value, so they
  // share a single "Incorrectly Assigned" column when any were found.
  const groupOrder = [...result.columns];
  if (
    result.hasIncorrectStatus &&
    !groupOrder.includes(KANBAN_INCORRECT_LABEL)
  ) {
    groupOrder.push(KANBAN_INCORRECT_LABEL);
  }

  const groupOrderLines = groupOrder.map(
    (column) => `      - ${JSON.stringify(column)}`
  );

  // `note.status` is both the grouped property and the membership marker:
  // grouping by a writable note property keeps cards draggable and lets Bases
  // write a drop back to the note. Notes without a status are excluded unless
  // Show notes with no status is on, in which case Bases renders them in its
  // own None group. With Include plots, the board accepts notes from either
  // the scene folder or the configured plot folder; character notes are never
  // included.
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
  if (!showUnassigned) {
    filterLines.push(
      `    - ${yamlQuote(`!note.${KANBAN_STATUS_TAG}.isEmpty()`)}`
    );
  }

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
    `      property: note.${KANBAN_STATUS_TAG}`,
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
