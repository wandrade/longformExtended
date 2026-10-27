# Kanban

A project with scenes can generate a kanban board at a configured output path.
The board is a native Obsidian Bases file (`.base`), opened in the built-in
Kanban view. It requires **Obsidian 1.14 or newer** (the version that
introduced the Bases Kanban view); no community kanban plugin is needed. Only
multi-scene projects get a board; single-note projects do not.

The board shows the project's listed scenes in the configured columns. With
**Include subplots** enabled (the default), it also shows the notes in the
configured **Subplot Folder**; notes in the **Character Folder** are never
included. Extra note groups are never included either. Dragging a card to
another column updates that note's real `status` frontmatter, so the board and
the notes stay in sync.

## Configuration

The Kanban section of the Project tab controls the feature:

| Setting | Default | What it does |
| --- | --- | --- |
| **Enable kanban** | On | Turns generation on or off. |
| **Kanban Columns** | `Planned Draft Reviewed` | The columns, in order. |
| **Kanban Output Path** | `Build/$1_kanban.base` | Where the board is written. |
| **Show notes with no status** | Off | Adds an `Unassigned` column when notes have no status. |
| **Save word counts** | On | Writes each card scene's word count to its frontmatter. |
| **Include subplots** | On | Includes notes from the Subplot Folder on the board. The visible label follows the project's Subplots Display Name. |

Turning **Enable kanban** off stops future rebuilds and removes the **Rebuild
kanban** command for that project, but it does not delete an existing board.

**Include subplots** adds the notes in the configured **Subplot Folder** as
candidate cards, whether or not they are listed in the project's scenes. The
Subplot Folder defaults to `Subplots`; existing projects may keep a custom
folder. There is no `type` flag: membership in the Subplot Folder is the only
requirement. Notes in the **Character Folder** are never included, and neither
are notes in extra note groups. Notes from the Subplot Folder use the same
column grouping, drag-to-update `status`, unknown-status, and unassigned
behavior as scenes. Toggling **Include subplots** regenerates the board.

The checkbox's visible label follows the project's **Subplots Display Name**, so
a display name of `Threads` makes it read **Include threads**. This is a label
change only: the setting, the stored `kanbanIncludePlots` key, and the Subplot
Folder are unchanged. See
[PLOTS_AND_CHARACTERS.md](./PLOTS_AND_CHARACTERS.md#display-names).

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
default. Matching is exact and case-sensitive: a note with `status: draft`
does not match a `Draft` column and is treated as an unrecognized status.

Column titles are also the values written to `status` when cards are dragged.

`Incorrectly Assigned` and `Unassigned` are reserved titles used by the two
synthetic columns described below. Do not add them to **Kanban Columns**; if
you do, the synthetic column merges with the configured one.

## The Status Property

A card note's column comes from its `status` frontmatter property:

```yaml
---
status: Draft
---
```

The value must match a configured column exactly. Leading and trailing
whitespace is ignored, but case is not. Notes from the Subplot Folder use the
same property and the same rules as scenes.

The generated board does not group directly by `status`. It groups by a
plugin-managed helper property, `longformKanbanStatus`, because Bases only
writes a dropped card's new group back to the note when the grouped property is
a writable note property. Grouping by a formula would make the cards
undraggable. The helper also collapses every unrecognized status into a single
column instead of creating one column per value:

| Note status | Helper value | Board column |
| --- | --- | --- |
| A configured column, e.g. `Draft` | `Draft` | `Draft` |
| Any other non-empty value | `Incorrectly Assigned` | `Incorrectly Assigned` |
| Missing or empty and **Show notes with no status** is on | `Unassigned` | `Unassigned` |
| Missing or empty and **Show notes with no status** is off | no helper | not shown |

When you drag a card:

- **To a configured column:** Bases writes that column title into
  `longformKanbanStatus`. The plugin then writes the same value into `status`
  and regenerates the board.
- **To `Unassigned`:** the plugin clears `status` (removes the property).
- **To `Incorrectly Assigned`:** there is no status to assign, so the plugin
  restores the helper and the card snaps back to its previous column. To fix an
  invalid status, drag the card into a configured column instead.

`longformKanbanStatus` is managed by the plugin for both scene cards and cards
from the Subplot Folder.
You can see it in Obsidian's Properties panel, but do not edit it by hand: the
next rebuild overwrites it.
If you edit `status` directly, the helper follows on the next rebuild. Edits to
the helper made while the plugin is disabled are not replayed; the next build
trusts `status` and rewrites the helper.

## What Appears on the Board

The board shows:

- Scenes that are listed in the project and are not structural containers (a
  scene followed by a more-indented scene is a container).
- When **Include subplots** is on, the notes in the configured Subplot Folder.
  They do not need to be listed in the project's scenes.

Notes in the Character Folder are never shown, and notes in extra note groups
are never shown. The helper property is the board's membership marker, so the
plugin also removes it from notes in the scene folder that are not listed
scenes. Consequently:

- Notes in the scene folder that are not in the project's scene list never
  appear, even if they have a `status`.
- Structural containers never appear.
- Notes from the Subplot Folder appear only when **Include subplots** is on.
- A scene or note from the Subplot Folder that has no status appears only when
  **Show notes with no status** is enabled.

The generated Base filters to the scene folder and, when **Include subplots**
is on, the Subplot Folder as an OR choice, and always requires a non-empty
`longformKanbanStatus` helper. With **Include subplots** off, the folder filter
is the scene folder only. Membership otherwise comes from the helper property.

## Notes Without a Status

By default, notes with a missing or empty `status` are excluded from the board.
Enable **Show notes with no status** in the Project tab to include them. They
appear in a single column labeled exactly `Unassigned` (not the Bases `None`
column), and that column is omitted when no card note is unassigned.

A board is only written when at least one scene, or (with **Include subplots**)
at least one note from the Subplot Folder, has a non-empty status. So enabling
**Show notes with no status** on a project where every card note is unassigned
does not create a board.

## Statuses That Are Not Columns

If a card note's status does not match any configured column, it appears in a
single column labeled exactly `Incorrectly Assigned`. That column is placed
after the configured columns and is omitted when every card note's status is
recognized. Unrecognized status values never become their own columns.

A value is unrecognized when it differs at all, including by case: `draft` does
not match `Draft`. Fix the note's `status`, add the value to **Kanban Columns**,
or drag the card into a configured column.

## Word Counts

With **Save word counts** enabled (the default), each listed scene that appears
as a card in a configured column has its word count written into its frontmatter
as `wordCount`:

```yaml
---
status: Draft
wordCount: 1234
---
```

The value comes from Longform Extended's scene word counts, and it is updated when those
counts change. Scenes with no status, an unrecognized status, no entry in the
project's scene list, or a container role do not have `wordCount` written.
Turning **Save word counts** off stops the writes and removes the card property,
but does not remove `wordCount` values that were already written.

No word count is generated or written to notes in the Subplot Folder. The
board's **Word Count** card property depends on the two settings:

- **Include subplots off:** scenes show `note.wordCount` as before.
- **Include subplots on:** the board uses a display formula for the card property.
  It shows a scene's `wordCount` and is empty for cards from the Subplot Folder.
- **Save word counts off:** no word-count card property appears, regardless of
  **Include subplots**.

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

No board is written when no card note has a status. With **Include subplots**
off, that means no non-container scene with a status; with it on, a note from
the Subplot Folder with a status is enough. In that case an existing board at
the configured path is left untouched.

## Updating and Rebuilding

The board refreshes automatically when the plugin loads and when files in the
project change, including notes in the scene folder that are not listed as
project scenes. When **Include subplots** is on, changes to notes in the Subplot
Folder also refresh the board. A drag updates the helper property, which
triggers a rebuild;
the rebuild writes the new `status` and then regenerates the board. These
writes are idempotent, and the plugin ignores its own generated files, so the
update does not loop.

It also rebuilds when project settings that affect it change, such as the
columns, the show-unassigned setting, save word counts, include subplots, or the
output path. Word counts are also written when Longform Extended's recorded scene word
counts change.

The plugin ignores its own generated files when watching for changes, including
boards written to a custom output path, so writing the board does not trigger
another rebuild.

To force a rebuild, select the project and run **Rebuild kanban** from the
command palette. The command is only available for a multi-scene project with
the kanban enabled. It reports `Kanban rebuilt.` even when there was nothing to
write.

The Status tab's **Open kanban** action opens the configured board and is
disabled when the kanban is off. **Refresh** regenerates every enabled generated
file, including the board. If the board has not been generated, a notice asks
you to use **Refresh**. See [Status tab](../README.md#status-tab).

## Troubleshooting

- **No board was created.** Check that the kanban is enabled, that the project
  is a scenes project, and that at least one scene, or (with **Include
  subplots**) at least one note from the Subplot Folder, has a non-empty
  `status`. A project whose card notes are all unassigned produces no board even
  with **Show notes with no status** enabled.
- **A note is missing from the board.** A scene may be unlisted in the project,
  be a structural container, have no status with **Show notes with no status**
  off, or sit outside the scene folder. A note from the Subplot Folder is
  missing when **Include subplots** is off or the note is not in that folder.
  Notes in the Character Folder and notes in extra note groups are never
  shown.
- **A note is in an unexpected column.** Its status may differ in case (for
  example `draft` instead of `Draft`), which makes it unrecognized and puts it
  in `Incorrectly Assigned`.
- **A card will not stay in `Incorrectly Assigned`.** That column is a holding
  area for invalid statuses, not an assignable status, so cards dropped there
  snap back. Drag the card into a configured column to assign it.
- **Dragging does not save the new status.** The board must group by the
  writable `note.longformKanbanStatus` property. If you edit the generated Base
  to group by a formula or another property, drops cannot be written back. Run
  **Rebuild kanban** to restore the generated view.
- **The helper property seems stale or manual edits are lost.**
  `longformKanbanStatus` is plugin-managed. Edit `status` instead, then rebuild;
  the helper follows the real status.
- **A word count is missing.** **Save word counts** may be off, the scene may
  have no status or an unrecognized status, or the scene may not be listed in
  the project. Rebuild after fixing the status. Cards from the Subplot Folder
  intentionally show no word count: those notes never get `wordCount` written.
- **Subplots are missing.** Enable **Include subplots**. Only notes in the
  Subplot Folder are candidates, and they still need a status (or **Show notes
  with no status**) to appear.
- **An extra group's note is missing from the board.** Extra note groups are
  not kanban inputs in this iteration, even with **Include subplots** on. Only
  the Subplot Folder is included. See
  [Extra note groups](./PLOTS_AND_CHARACTERS.md#extra-note-groups).
- **The Include checkbox uses an unexpected word.** Its label follows the
  project's **Subplots Display Name**. This changes the label only; it does not
  change the Subplot Folder or which notes are included. Clear the display-name
  field to return to **Include subplots**. See
  [Display Names](./PLOTS_AND_CHARACTERS.md#display-names).
- **The board is stale after an external change.** Run **Rebuild kanban**.
  The generated file is a snapshot of the current project data.
