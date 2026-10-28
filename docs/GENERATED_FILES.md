# Generated Files

Longform Extended can generate three files for a multi-scene project: the
[Timeline](./TIMELINE.md) note (`.md`), the [Kanban](./KANBAN.md) board
(`.base`), and the [Subplot Grid](./PLOT_GRID.md) (`.base`). Each feature has its
own enable setting and output path in the Project tab.

## Output Paths

- Relative paths resolve against the project folder; a leading `/` resolves from
  the vault root.
- The extension is added if omitted: `.md` for the timeline, `.base` for the
  kanban and grid.
- An empty setting falls back to the feature's default. Missing folders are
  created.
- Changing the path writes a new file but does not move or delete the old one.

Defaults: `Build/$1_timeline.md`, `Build/$1_kanban.base`, and
`Build/$1_plotgrid.base`, where `$1` is the project title.

## Build Artifacts

The generated files are build artifacts: edits inside them are overwritten on
rebuild. Edit the source notes and frontmatter instead. The plugin ignores its
own generated files when watching for changes.

If a file looks stale, use the refresh action on the Status tab or the feature's
**Rebuild** command.
