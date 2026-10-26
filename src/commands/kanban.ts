import { get } from "svelte/store";
import { Notice } from "obsidian";

import type { CommandBuilder } from "./types";
import { selectedDraft } from "../model/stores";
import {
  buildKanban,
  writeKanbanBase,
  writeKanbanWordCounts,
} from "../model/kanban";

export const rebuildKanban: CommandBuilder = (plugin) => ({
  id: "longform-extended-rebuild-kanban",
  name: "Rebuild kanban",
  checkCallback(checking: boolean) {
    const draft = get(selectedDraft);
    if (checking) {
      return !!draft && draft.format === "scenes" && draft.kanbanEnabled;
    }
    if (!draft || draft.format !== "scenes" || !draft.kanbanEnabled) {
      return;
    }

    void (async () => {
      try {
        const result = await buildKanban(plugin.app, draft);
        await writeKanbanBase(plugin.app, draft, result);
        await writeKanbanWordCounts(plugin.app, draft, result);
        new Notice("Kanban rebuilt.");
      } catch (error) {
        console.error("[Longform Extended] Failed to rebuild kanban:", error);
        new Notice("Could not rebuild kanban. See the console.");
      }
    })();
  },
});
