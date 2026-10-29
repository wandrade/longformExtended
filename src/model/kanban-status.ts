import type { App, TFile } from "obsidian";

import {
  DEFAULT_KANBAN_COLUMNS,
  KANBAN_STATUS_TAG,
  type MultipleSceneDraft,
} from "./types";

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

/** The first configured column, falling back to the first default column. */
export function defaultKanbanStatus(
  draft: MultipleSceneDraft
): string | null {
  const configured = parseKanbanColumns(draft.kanbanColumns);
  if (configured.length > 0) {
    return configured[0];
  }
  return parseKanbanColumns(DEFAULT_KANBAN_COLUMNS)[0] ?? null;
}

/** True when a frontmatter value already holds a non-empty status. */
function hasStatusValue(raw: unknown): boolean {
  if (raw === undefined || raw === null) {
    return false;
  }
  if (typeof raw === "string") {
    return raw.trim() !== "";
  }
  return true;
}

/**
 * Seeds a newly created scene or subplot note with the board's first column so
 * it appears on the generated kanban without a manual edit. Existing
 * frontmatter, including a status supplied by a template, is preserved. The
 * grouping helper (`longformKanbanStatus`) is left for the kanban rebuild.
 */
export async function applyDefaultKanbanStatus(
  app: App,
  file: TFile,
  draft: MultipleSceneDraft
): Promise<void> {
  if (!draft.kanbanEnabled) {
    return;
  }

  const status = defaultKanbanStatus(draft);
  if (status === null) {
    return;
  }

  await app.fileManager.processFrontMatter(
    file,
    (frontmatter: Record<string, unknown>) => {
      if (hasStatusValue(frontmatter[KANBAN_STATUS_TAG])) {
        return;
      }
      frontmatter[KANBAN_STATUS_TAG] = status;
    }
  );
}
