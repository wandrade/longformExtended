# Troubleshooting

## Notes and project data

Longform's core never alters note prose. It rewrites a project's
[index file](./INDEX_FILE.md) and, with **Write scene index to frontmatter**
enabled, writes `longform-order` and `longform-number` to scene notes. It never
deletes files based on index changes. Longform Extended follows that rule for
prose: the added views never edit note prose.

The added views do write the frontmatter they document — `status`,
`longformKanbanStatus`, `wordCount`, and `plotgrid_*` — and they update the
project index file's `longform` entry for note-group configuration, display names,
and order overlays. They also write the generated timeline, kanban, and
subplot-grid files. Everything outside those properties and the scene-order keys
is left alone.

## Project desync

Longform Extended bridges project metadata with the state of files on disk.
Malformed or invalid frontmatter can still make the plugin think a project is in
a different state than it really is.

Because projects are inferred from frontmatter, you can usually force a
recalculation:

1. Restart Obsidian, or run the **Reload app without saving** command.
2. Check that the project's `longform` frontmatter is valid; see
   [The Index File](./INDEX_FILE.md).
3. Re-select the project in the Longform Extended pane.

The plugin never deletes files to fix a desync. If you are unsure what changed,
revert the frontmatter edit and reload.

## Obsidian Sync

If scenes disappear or are falsely reported as new after startup, enable
**Wait for Obsidian Sync** in the plugin settings. The plugin then delays project
discovery until Sync finishes. **Enable fallback wait** and **Fallback wait time**
control the delay when Sync's status cannot be detected (default: on, 5 seconds).

## Both plugins enabled

Do not enable Longform and Longform Extended at the same time. Both discover and
track the same `longform` projects through their own panes and commands, so
running both duplicates the UI and can make them compete over the same projects.
Disable upstream Longform before enabling Longform Extended.

## A generated file is missing or stale

- Check that the feature is enabled in the **Project** tab.
- Check that the project is a multi-scene project. Timeline, kanban, and subplot
  grid are not generated for single-scene projects.
- Use the **Status** tab's refresh action, or the feature's **Rebuild**
  command, to force regeneration.
- For the timeline, at least one scene needs a valid timeframe value.
- For the kanban, at least one card note needs a non-empty `status`.
- For the subplot grid, the Scene, Subplot, and Character Folders must be
  distinct and non-nested, the hierarchy needs at least one populated level, and
  at least one Subplot or Character note must exist.

The generated files are build artifacts. Edits made inside them are overwritten
on the next rebuild; edit the source notes and frontmatter instead. If you change
an output path, the old file is not moved or deleted; remove it yourself.

## Feature-specific help

- [Timeline troubleshooting](./TIMELINE.md#troubleshooting)
- [Kanban troubleshooting](./KANBAN.md#troubleshooting)
- [Subplot Grid troubleshooting](./PLOT_GRID.md#troubleshooting)
- [Subplots, Characters, and Extra note groups troubleshooting](./PLOTS_AND_CHARACTERS.md#troubleshooting)
- [Migrating from Longform 1.x](./MIGRATING_FROM_VERSION_1_TO_2.md)
