import { TFile, type App } from "obsidian";
import { get } from "svelte/store";

import {
  configuredOutputPath,
  writeGeneratedNote,
} from "./generated-note";
import { sceneFolderPath, scenePath } from "./scene-navigation";
import { draftWordCounts } from "./stores";
import {
  DEFAULT_KANBAN_COLUMNS,
  DEFAULT_KANBAN_OUTPUT_PATH,
  KANBAN_STATUS_TAG,
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

/** Groups scenes into their configured kanban columns by status. */
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
  const errors: KanbanError[] = [];
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

    const status =
      app.metadataCache.getFileCache(file)?.frontmatter?.[KANBAN_STATUS_TAG];
    if (status === undefined || status === null || `${status}`.trim() === "") {
      unassigned.push({ title: scene.title, path });
      continue;
    }

    hasAnyStatus = true;
    const value = `${status}`.trim();
    if (!columns.includes(value)) {
      errors.push({ sceneTitle: scene.title, status: value });
      continue;
    }

    cards[value].push({ title: scene.title, path });
  }

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
  const counts = storedCounts as Record<string, number>;

  const written = new Set<string>();
  for (const cards of Object.values(result.cards)) {
    for (const card of cards) {
      if (written.has(card.path)) {
        continue;
      }
      written.add(card.path);

      const count = counts[card.title];
      if (typeof count !== "number") {
        continue;
      }

      const file = app.vault.getAbstractFileByPath(card.path);
      if (!(file instanceof TFile)) {
        continue;
      }

      const current =
        app.metadataCache.getFileCache(file)?.frontmatter?.["wordCount"];
      if (current === count) {
        continue;
      }

      await app.fileManager.processFrontMatter(file, (frontmatter) => {
        frontmatter["wordCount"] = count;
      });
    }
  }
}

/** Quotes a value as a single-quoted YAML scalar. */
function yamlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Statuses in the scene folder that do not match a configured column.
 * groupOrder is a whitelist, so every group the board should show must be
 * listed. Scan the folder because the Base's folder filter can show notes that
 * are not listed as project scenes.
 */
function collectExtraStatuses(
  app: App,
  draft: MultipleSceneDraft,
  result: KanbanResult
): string[] {
  const folder = sceneFolderPath(draft, app.vault);
  const prefix = folder.endsWith("/") ? folder : `${folder}/`;
  const configured = new Set(result.columns);
  const extra = new Set<string>();

  const add = (raw: unknown): void => {
    if (raw === undefined || raw === null) {
      return;
    }
    const value = `${raw}`.trim();
    if (value !== "" && !configured.has(value)) {
      extra.add(value);
    }
  };

  for (const error of result.errors) {
    add(error.status);
  }
  for (const file of app.vault.getMarkdownFiles()) {
    if (!file.path.startsWith(prefix)) {
      continue;
    }
    add(app.metadataCache.getFileCache(file)?.frontmatter?.[KANBAN_STATUS_TAG]);
  }

  return [...extra].sort();
}

function renderKanbanBase(
  app: App,
  draft: MultipleSceneDraft,
  result: KanbanResult
): string {
  const columnList = result.columns.map((c) => JSON.stringify(c)).join(",");
  const showUnassigned = draft.kanbanShowUnassigned;

  // Invalid statuses used to map to a single "Incorrectly assigned" group.
  // Grouping by the real property turns each value into its own column, so
  // keep the configured columns first and append the invalid values.
  const extraStatuses = collectExtraStatuses(app, draft, result);
  const showIncorrect = extraStatuses.length > 0;
  const groupOrder = [...result.columns, ...extraStatuses];

  // groupOrder is a visibility whitelist. Notes with no status are grouped
  // under the view's "None" group, which is only shown when null is listed.
  const groupOrderLines = groupOrder.map(
    (column) => `      - ${JSON.stringify(column)}`
  );
  if (showUnassigned) {
    groupOrderLines.push("      - null");
  }

  const filters = [
    `file.inFolder(${JSON.stringify(sceneFolderPath(draft, app.vault))})`,
  ];
  if (!showUnassigned) {
    // isEmpty() is true for an empty or absent string property.
    filters.push("!status.isEmpty()");
  }

  // Grouping must use a writable note property: Bases only writes a dropped
  // card's new group back to the note when the grouped property can be edited.
  // A formula property here would make the cards undraggable. This formula is
  // display-only and flags statuses that aren't configured columns.
  const formula = `if(status, if([${columnList}].contains(status), status, "Incorrectly assigned"), "Unassigned")`;

  const cardProperties = ["file.name"];
  if (showIncorrect) {
    cardProperties.push("formula.kanban_status");
  }
  if (draft.kanbanSaveWordCounts) {
    cardProperties.push("note.wordCount");
  }

  const lines = [
    "filters:",
    "  and:",
    ...filters.map((filter) => `    - ${yamlQuote(filter)}`),
    ...(showIncorrect
      ? ["formulas:", "  kanban_status: |-", `    ${formula}`]
      : []),
    "views:",
    "  - type: kanban",
    "    name: Kanban",
    "    groupBy:",
    "      property: note.status",
    "      direction: ASC",
    "    groupOrder:",
    ...groupOrderLines,
    ...(cardProperties.length > 1
      ? ["    order:", ...cardProperties.map((property) => `      - ${property}`)]
      : []),
  ];

  return `${lines.join("\n")}\n`;
}
