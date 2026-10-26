import { get } from "svelte/store";
import { Notice } from "obsidian";

import type { CommandBuilder } from "./types";
import { selectedDraft } from "../model/stores";
import {
  plotGridDirectoryConflictMessage,
  writePlotGrid,
  type PlotGridResult,
} from "../model/plot-grid";

function resultNotice(result: PlotGridResult): string {
  switch (result.reason) {
    case "written":
      return `Subplot grid rebuilt (${result.columns} columns, ${result.notes} notes).`;
    case "invalid-dirs":
      return `Subplot grid not rebuilt: ${plotGridDirectoryConflictMessage(
        result.conflicts ?? []
      )}`;
    case "no-columns":
      return "Subplot grid not rebuilt: the scene hierarchy has no columns.";
    case "no-notes":
      return "Subplot grid not rebuilt: no subplot or character notes found.";
    case "disabled":
      return "Subplot grid is disabled for this project.";
  }
}

export const rebuildPlotGrid: CommandBuilder = (plugin) => ({
  id: "longform-extended-rebuild-plot-grid",
  name: "Rebuild subplot grid",
  checkCallback(checking: boolean) {
    const draft = get(selectedDraft);
    if (checking) {
      return !!draft && draft.format === "scenes" && draft.plotGridEnabled;
    }
    if (!draft || draft.format !== "scenes" || !draft.plotGridEnabled) {
      return;
    }

    void (async () => {
      try {
        const result = await writePlotGrid(plugin.app, draft);
        new Notice(resultNotice(result));
      } catch (error) {
        console.error(
          "[Longform Extended] Failed to rebuild subplot grid:",
          error
        );
        new Notice("Could not rebuild subplot grid. See the console.");
      }
    })();
  },
});
