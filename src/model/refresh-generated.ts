import type { App } from "obsidian";

import {
  buildKanban,
  writeKanbanBase,
  writeKanbanWordCounts,
} from "./kanban";
import { writePlotGrid } from "./plot-grid";
import { buildTimeline, writeTimeline } from "./timeline";
import type { MultipleSceneDraft } from "./types";

/**
 * Regenerates a project's enabled status outputs. Each output is gated by its
 * own project setting, so a project with everything disabled is a no-op.
 *
 * Shared by the status buttons and the autocompile scheduler so both run the
 * exact same work.
 */
export async function refreshGeneratedFiles(
  app: App,
  draft: MultipleSceneDraft
): Promise<void> {
  if (draft.timelineEnabled) {
    const timeline = await buildTimeline(app, draft);
    await writeTimeline(app, draft, timeline);
  }

  if (draft.kanbanEnabled) {
    const kanban = await buildKanban(app, draft);
    await writeKanbanBase(app, draft, kanban);
    await writeKanbanWordCounts(app, draft, kanban);
  }

  if (draft.plotGridEnabled) {
    await writePlotGrid(app, draft);
  }
}
