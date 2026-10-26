# Kanban

A project with scenes can generate a kanban board at a configured output path.
The board is a native Obsidian Bases file (`.base`), opened in the built-in
Kanban view. It requires **Obsidian 1.14 or newer** (the version that
introduced the Bases Kanban view); no community kanban plugin is needed. Only
multi-scene projects get a board; single-note projects do not.

The board groups notes by their `status` frontmatter property. Each column is a
status, each card is a note in the scene folder, and dragging a card to another
column writes that column's title back into the note's `status` property.

## Configuration

The Kanban section of the Project tab controls the feature:

| Setting | Default | What it does |
| --- | --- | --- |
| **Enable kanban** | On | Turns generation on or off. |
| **Kanban Columns** | `Planned Draft Reviewed` | The columns, in order. |
| **Kanban Output Path** | `Build/$1_kanban.base` | Where the board is written. |
| **Show notes with no status** | Off | Adds a column for notes without a status. |
| **Save word counts** | On | Writes each card scene's word count to its frontmatter. |

Turning **Enable kanban** off stops future rebuilds and removes the **Rebuild
kanban** command for that project, but it does not delete an existing board.

## Kanban Columns

Set the columns in the Project tab under **Kanban Columns**. Titles are
separated by spaces. Quote any title that contains spaces, using single or
double quotes:

```
Planned Draft Reviewed
"To do" Draft "In progress" Done
```

The order you write them in is the order of the columns on the board. The
default is `Planned Draft Reviewed`. Clearing the field falls back to that
default. Matching is exact and case-sensitive: a scene with `status: draft`
does not match a `Draft` column and is treated as an unrecognized status.

Column titles are also the values written to `status` when cards are dragged.

## The Status Property

A scene's column comes from its `status` frontmatter property:

```yaml
---
status: Draft
---
```

The value must match a configured column exactly. Leading and trailing
whitespace is ignored, but case is not.

Dragging a card to another column writes that column's title into the note's
`status` property, so the board and the notes stay in sync. The Base therefore
groups by the writable `note.status` property. It does not group by a formula:
Bases only writes a dropped card's new group back to the note when the grouped
property can be edited, and formula properties are read-only.

Notes with a missing or empty status are treated as unassigned. Notes without a
status are hidden by default; see below.

The board is folder-based rather than scene-list-based: it shows every note
under the project's scene folder whose status matches one of the board's
columns, including notes that are not listed as project scenes. A scene that is
followed by a more-indented scene is treated as a structural container; the
project build skips it for word counts, though the board filter may still show
it if it has a status. The project's scene list still determines which scenes
get word counts.

## Notes Without a Status

By default, notes with a missing or empty `status` are excluded from the board.
Enable **Show notes with no status** in the Project tab to include them; they
appear in the view's `None` column.

A board is only written when at least one scene listed in the project that is
not a structural container has a non-empty status. So enabling **Show notes with
no status** on a project where every listed scene is unassigned does not create
a board.

## Statuses That Are Not Columns

If a note's status does not match any configured column, that status still
appears as its own column. Configured columns come first, in the order you set,
followed by any unrecognized statuses in alphabetical order.

When the board is generated with unrecognized statuses, cards also show a
**Kanban status** property. It reports `Incorrectly assigned` for the
unrecognized values and the status itself for the recognized ones. Add the
column or fix the status, then rebuild the board.

Statuses are collected from every note under the scene folder, not only from
the listed scenes, so an unrecognized status in an unlisted note can add a
column too.

## Word Counts

With **Save word counts** enabled (the default), each listed scene that appears
as a card has its word count written into its frontmatter as `wordCount`:

```yaml
---
status: Draft
wordCount: 1234
---
```

The board shows it as a card property. The value comes from Longform's scene
word counts, and it is updated when those counts change. Scenes with no status,
an unrecognized status, no entry in the project's scene list, or a container
role do not have `wordCount` written. Turning **Save word counts** off stops the
writes and removes the card property, but does not remove `wordCount` values
that were already written.

`wordCount` is a normal frontmatter property, so it also appears in Obsidian's
Properties panel for the scene.

## Output

The board is written to the path set in the Kanban section of the Project tab
(**Kanban Output Path**). The default is `Build/$1_kanban.base`, where `$1` is
replaced with the project title, so a project named *My Book* produces
`Build/My Book_kanban.base`.

Relative paths are resolved against the project folder; start the path with `/`
to resolve it from the vault root instead. If the path does not end in `.base`,
that extension is added. An empty setting falls back to the default, and any
missing folders are created. The board is a build artifact: it is regenerated
from project data, so edits made inside the `.base` file are overwritten on the
next rebuild.

If you change the output path, the existing board is not moved or deleted. A
new board is written at the new path; remove the old one yourself if you no
longer want it.

No board is written when the project has no non-container scene with a status.
In that case an existing board at the configured path is left untouched.

## Updating and Rebuilding

The board refreshes automatically when the plugin loads and when files in the
project change, including notes in the scene folder that are not listed as
project scenes. It also rebuilds when project settings that affect it change,
such as the columns, the show-unassigned setting, save word counts, or the
output path. Word counts are also written when Longform's recorded scene word
counts change.

The plugin ignores its own generated files when watching for changes, including
boards written to a custom output path, so writing the board does not trigger
another rebuild.

To force a rebuild, select the project and run **Rebuild kanban** from the
command palette. The command is only available for a multi-scene project with
the kanban enabled. It reports `Kanban rebuilt.` even when there was nothing to
write.

## Troubleshooting

- **No board was created.** Check that the kanban is enabled, that the project
  is a scenes project, and that at least one listed scene has a non-empty
  `status`. A project whose scenes are all unassigned produces no board even
  with **Show notes with no status** enabled.
- **A note is missing from the board.** It may have no status and
  **Show notes with no status** may be off, or it may sit outside the scene
  folder.
- **A note is in an unexpected column.** Its status may differ in case (for
  example `draft` instead of `Draft`), which makes it an unrecognized status
  and gives it its own column instead of matching the configured one.
- **There is an extra column.** A note has a status that is not in **Kanban
  Columns**. Add the column or correct the note's status, then rebuild.
- **Dragging does not save the new status.** The board groups by the writable
  `note.status` property. If you edit the generated Base to group by a formula
  or another read-only property, drops cannot be written back. Run **Rebuild
  kanban** to restore the generated view.
- **A word count is missing.** **Save word counts** may be off, the scene may
  have no status or an unrecognized status, or the scene may not be listed in
  the project. Rebuild after fixing the status.
- **The board is stale after an external change.** Run **Rebuild kanban**.
  The generated file is a snapshot of the current project data.
