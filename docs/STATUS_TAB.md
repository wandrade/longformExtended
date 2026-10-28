# Status Tab

Multi-scene projects have a **Status** tab in the Longform Extended pane. It holds
the daily writing-goal bar and the actions that work with the generated files.
Single-scene projects do not have a Status tab; choosing **Status** redirects to
**Project**.

## Daily Goal Bar

The bar shows the current session's progress toward the writing goal; its label
turns green and bold when the goal is met. It uses the latest writing session and
the **Goal applies to** setting, and is hidden when the goal is `0` or less or
when the selected scope has no measurable target.

![The daily goal bar before the goal is met](./res/status-goal-not-reached.png)

![The daily goal bar when the goal is met](./res/status-goal-reached.png)

See [Word counts and sessions](./WORD_COUNTS.md#the-daily-goal-bar) for the
scopes, settings, and storage options.

## Actions

The Status tab has four icon actions:

- **Refresh** (tooltip: “Force immediate generation of status files.”)
  regenerates every enabled generated file for the selected project: the
  timeline, the kanban board, and the subplot grid. It also writes the kanban
  word counts. It is disabled while it runs, and when no generated file is
  enabled.
- **Open timeline** opens the configured timeline note. It is disabled when the
  timeline is off.
- **Open kanban** opens the configured kanban board. It is disabled when the
  kanban is off.
- **Open subplot grid** opens the configured subplot-grid Base. It is disabled
  when the subplot grid is off.

If an open action's file has not been generated yet, a notice asks you to use
the refresh action. Only the subplot-grid action's tooltip follows the project's
display names, so a Subplots display name of `Threads` produces an “Open thread
grid” tooltip. The timeline and kanban tooltips are fixed. See
[Display names](./PLOTS_AND_CHARACTERS.md#display-names).

## Related

- [Timeline](./TIMELINE.md#updating-and-rebuilding)
- [Kanban](./KANBAN.md#updating-and-rebuilding)
- [Subplot Grid](./PLOT_GRID.md#updating-and-rebuilding)
- [Word counts and sessions](./WORD_COUNTS.md)
