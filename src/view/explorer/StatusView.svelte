<script lang="ts">
  import { Notice, TFile, setTooltip } from "obsidian";

  import { configuredOutputPath } from "src/model/generated-note";
  import {
    buildKanban,
    writeKanbanBase,
    writeKanbanWordCounts,
  } from "src/model/kanban";
  import { noteGroupSingularName } from "src/model/note-groups";
  import { writePlotGrid } from "src/model/plot-grid";
  import {
    pluginSettings,
    selectedDraft,
    sessions,
  } from "src/model/stores";
  import { findScene } from "src/model/scene-navigation";
  import { buildTimeline, writeTimeline } from "src/model/timeline";
  import {
    DEFAULT_KANBAN_OUTPUT_PATH,
    DEFAULT_PLOT_GRID_OUTPUT_PATH,
    DEFAULT_TIMELINE_OUTPUT_PATH,
    type MultipleSceneDraft,
  } from "src/model/types";

  import Icon from "../components/Icon.svelte";
  import { activeFile } from "../stores";
  import { useApp } from "../utils";

  const app = useApp();

  const REFRESH_TOOLTIP = "Force immediate generation of status files.";
  const OPEN_TIMELINE_TOOLTIP = "Open timeline";
  const OPEN_KANBAN_TOOLTIP = "Open kanban";

  let busy = false;
  let draft: MultipleSceneDraft | null = null;

  function lowerFirst(value: string): string {
    return value.length > 0
      ? `${value[0].toLowerCase()}${value.slice(1)}`
      : value;
  }

  $: draft =
    $selectedDraft && $selectedDraft.format === "scenes"
      ? ($selectedDraft as MultipleSceneDraft)
      : null;
  $: plotGridSingular = draft
    ? noteGroupSingularName(draft, "plots")
    : "Subplot";
  $: plotGridLabel = `${plotGridSingular} grid`;
  $: openPlotGridTooltip = `Open ${lowerFirst(plotGridLabel)}`;
  $: timelineEnabled = !!draft && draft.timelineEnabled;
  $: kanbanEnabled = !!draft && draft.kanbanEnabled;
  $: plotGridEnabled = !!draft && draft.plotGridEnabled;
  $: refreshDisabled =
    busy ||
    !draft ||
    (!timelineEnabled && !kanbanEnabled && !plotGridEnabled);

  /**
   * Words counted toward the session goal for the configured scope, or `null`
   * when the goal bar should not be shown for the current selection.
   */
  let goalWords: number | null = null;
  $: {
    const settings = $pluginSettings;
    const session = $sessions[0] ?? null;

    goalWords = null;
    if (settings && settings.sessionGoal > 0) {
      if (settings.applyGoalTo === "all") {
        goalWords = session?.total ?? 0;
      } else if (!$selectedDraft) {
        goalWords = null;
      } else if (settings.applyGoalTo === "project") {
        goalWords = session?.drafts[$selectedDraft.vaultPath]?.total ?? 0;
      } else if ($selectedDraft.format === "single") {
        goalWords = session?.drafts[$selectedDraft.vaultPath]?.total ?? 0;
      } else {
        const located = $activeFile
          ? findScene($activeFile.path, [$selectedDraft])
          : null;
        const sceneTitle = located
          ? $selectedDraft.scenes[located.index]?.title
          : undefined;
        goalWords =
          sceneTitle === undefined
            ? null
            : session?.drafts[$selectedDraft.vaultPath]?.scenes[sceneTitle] ??
              0;
      }
    }
  }

  let goalTarget = 0;
  let goalPercent = 0;
  let goalComplete = false;
  let goalText = "";
  $: goalTarget = $pluginSettings?.sessionGoal ?? 0;
  $: goalPercent =
    goalWords !== null && goalTarget > 0
      ? Math.min(100, Math.max(0, (goalWords / goalTarget) * 100))
      : 0;
  $: goalComplete =
    goalWords !== null && goalTarget > 0 && goalWords >= goalTarget;
  $: goalText = `${(goalWords ?? 0).toLocaleString()}/${goalTarget.toLocaleString()} words`;

  /** Obsidian tooltip action. */
  function tooltip(node: HTMLElement, text: string) {
    setTooltip(node, text);
    return {
      update(nextText: string) {
        setTooltip(node, nextText);
      },
    };
  }

  function timelinePath(current: MultipleSceneDraft): string {
    return configuredOutputPath(
      app,
      current,
      current.timelineOutputPath,
      DEFAULT_TIMELINE_OUTPUT_PATH,
      ".md"
    );
  }

  function kanbanPath(current: MultipleSceneDraft): string {
    return configuredOutputPath(
      app,
      current,
      current.kanbanOutputPath,
      DEFAULT_KANBAN_OUTPUT_PATH,
      ".base"
    );
  }

  function plotGridPath(current: MultipleSceneDraft): string {
    return configuredOutputPath(
      app,
      current,
      current.plotGridOutputPath,
      DEFAULT_PLOT_GRID_OUTPUT_PATH,
      ".base"
    );
  }

  async function openOutput(path: string, label: string): Promise<void> {
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice(
        `${label} has not been generated yet. Use Refresh to generate the status files.`
      );
      return;
    }

    try {
      await app.workspace.getLeaf(false).openFile(file);
    } catch (error) {
      console.error(
        `[Longform Extended] Failed to open ${label.toLowerCase()}:`,
        error
      );
      new Notice(`Could not open ${label.toLowerCase()}. See the console.`);
    }
  }

  async function refresh(): Promise<void> {
    const current = draft;
    if (
      busy ||
      !current ||
      (!current.timelineEnabled &&
        !current.kanbanEnabled &&
        !current.plotGridEnabled)
    ) {
      return;
    }

    busy = true;
    try {
      if (current.timelineEnabled) {
        const timeline = await buildTimeline(app, current);
        await writeTimeline(app, current, timeline);
      }

      if (current.kanbanEnabled) {
        const kanban = await buildKanban(app, current);
        await writeKanbanBase(app, current, kanban);
        await writeKanbanWordCounts(app, current, kanban);
      }

      if (current.plotGridEnabled) {
        await writePlotGrid(app, current);
      }

      new Notice("Status generation complete.");
    } catch (error) {
      console.error(
        "[Longform Extended] Failed to generate status files:",
        error
      );
      new Notice("Could not generate status files. See the console.");
    } finally {
      busy = false;
    }
  }

  function openTimeline(): void {
    if (!draft || !draft.timelineEnabled) {
      return;
    }
    void openOutput(timelinePath(draft), "Timeline");
  }

  function openKanban(): void {
    if (!draft || !draft.kanbanEnabled) {
      return;
    }
    void openOutput(kanbanPath(draft), "Kanban");
  }

  function openPlotGrid(): void {
    if (!draft || !draft.plotGridEnabled) {
      return;
    }
    void openOutput(plotGridPath(draft), plotGridLabel);
  }
</script>

<div class="longform-extended-status">
  {#if goalWords !== null && goalTarget > 0}
    <div
      class="longform-extended-status-goal"
      class:complete={goalComplete}
    >
      <span class="longform-extended-status-goal-label">Daily goal:</span>
      <div
        class="longform-extended-status-goal-track"
        role="progressbar"
        aria-label="Session word goal"
        aria-valuemin={0}
        aria-valuemax={goalTarget}
        aria-valuenow={goalWords}
      >
        <div
          class="longform-extended-status-goal-fill"
          style={`width: ${goalPercent}%`}
        />
      </div>
      <span class="longform-extended-status-goal-text">{goalText}</span>
    </div>
  {/if}
  {#if draft}
    <div class="longform-extended-status-grid">
      <button
        type="button"
        class="clickable-icon longform-extended-status-button"
        class:busy
        aria-label={REFRESH_TOOLTIP}
        disabled={refreshDisabled}
        use:tooltip={REFRESH_TOOLTIP}
        on:click={refresh}
      >
        <Icon iconName="refresh-cw" />
      </button>
      <button
        type="button"
        class="clickable-icon longform-extended-status-button"
        aria-label={OPEN_TIMELINE_TOOLTIP}
        disabled={!timelineEnabled}
        use:tooltip={OPEN_TIMELINE_TOOLTIP}
        on:click={openTimeline}
      >
        <Icon iconName="calendar-clock" />
      </button>
      <button
        type="button"
        class="clickable-icon longform-extended-status-button"
        aria-label={OPEN_KANBAN_TOOLTIP}
        disabled={!kanbanEnabled}
        use:tooltip={OPEN_KANBAN_TOOLTIP}
        on:click={openKanban}
      >
        <Icon iconName="kanban" />
      </button>
      <button
        type="button"
        class="clickable-icon longform-extended-status-button"
        aria-label={openPlotGridTooltip}
        disabled={!plotGridEnabled}
        use:tooltip={openPlotGridTooltip}
        on:click={openPlotGrid}
      >
        <Icon iconName="layout-grid" />
      </button>
    </div>
  {:else}
    <p class="longform-extended-status-empty">
      Select a scenes project to view status actions.
    </p>
  {/if}
</div>

<style>
  .longform-extended-status {
    padding: var(--size-4-2) 0;
  }

  .longform-extended-status-goal {
    display: flex;
    align-items: center;
    gap: var(--size-4-2);
    margin-bottom: var(--size-4-2);
  }

  .longform-extended-status-goal-label {
    flex: 0 0 auto;
    color: var(--text-muted);
    font-size: var(--font-ui-smaller);
    white-space: nowrap;
  }

  .longform-extended-status-goal-track {
    flex: 1 1 auto;
    height: var(--size-4-2);
    overflow: hidden;
    border-radius: var(--radius-s);
    background-color: var(--background-modifier-border);
  }

  .longform-extended-status-goal-fill {
    width: 0;
    height: 100%;
    border-radius: inherit;
    background-color: var(--color-green, var(--text-success, #3fb950));
    transition: width 0.25s ease, background-color 0.25s ease;
  }

  .longform-extended-status-goal-text {
    flex: 0 0 auto;
    color: var(--text-muted);
    font-size: var(--font-ui-smaller);
    font-variant-numeric: tabular-nums;
    transition: color 0.25s ease;
  }

  .longform-extended-status-goal.complete .longform-extended-status-goal-text,
  .longform-extended-status-goal.complete .longform-extended-status-goal-label {
    color: var(--text-success, var(--color-green, #3fb950));
  }

  .longform-extended-status-goal.complete .longform-extended-status-goal-text,
  .longform-extended-status-goal.complete .longform-extended-status-goal-label {
    font-weight: var(--font-semibold);
  }

  .longform-extended-status-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--size-4-2);
  }

  .longform-extended-status-button {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: var(--size-4-8);
    padding: var(--size-4-2);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    background-color: var(--interactive-normal);
    color: var(--text-normal);
    cursor: pointer;
  }

  .longform-extended-status-button:hover:not(:disabled) {
    background-color: var(--interactive-hover);
  }

  .longform-extended-status-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    color: var(--text-muted);
    background-color: var(--interactive-normal);
  }

  .longform-extended-status-button.busy {
    cursor: progress;
  }

  .longform-extended-status-empty {
    margin: 0;
    color: var(--text-muted);
  }
</style>
