# Subplot Grid

A project with scenes can generate a subplot grid: a table that tracks your
subplots and characters across the structure of your story. Conceptually, each
subplot or character is a row and each hierarchy node is a column. Cells are editable, and
an edit is written back into the corresponding subplot or character note's
frontmatter.

The grid is a native Obsidian Bases file (`.base`), opened in this plugin's
custom transposed view, which puts the subplot and character notes in columns and
the hierarchy nodes in rows for easier reading. A **Level** dropdown above the
table chooses which level's rows to display, or **All**.

The `.base` is generated from project data. Edit cells in the grid, not in the
Base file: regeneration overwrites the file.

## Requirements

- **Obsidian 1.14 or newer.** This is the plugin's minimum version; it includes
  the Bases view API used by the custom view and the native Kanban view used by
  the kanban feature.
- **Longform Extended enabled.** The custom view is registered by the plugin.
- **The Bases core plugin enabled.** If it is disabled, the custom view is not
  available; the generated Base still includes a native table view as a
  fallback.
- **A multi-scene project.** Single-note projects do not get a subplot grid.
- **Markdown notes in the configured folders.** Every Markdown note under
  the Subplot Folder is a row (the note named `Main` is the main plot; the
  others are subplots), and every Markdown note under the Character Folder is a
  character row. There is no frontmatter type flag to add: folder membership
  is the only thing that decides membership. See [Folders](#folders).

## Configuration

The Subplot Grid section of the Project tab controls the feature:

| Setting | Default | What it does |
| --- | --- | --- |
| **Enable subplot grid** | On | Turns generation on or off. |
| **Subplot Grid Output Path** | `Base/$1_plotgrid.base` | Where the Base is written. |

The **Level** selector is part of the generated view, not the Project tab. See
[Levels](#levels).

Turning **Enable subplot grid** off stops future rebuilds and removes the
**Rebuild subplot grid** command for that project; the Status tab's
**Open subplot grid** action stays visible but is disabled. Turning it off does not delete an
existing Base or the `plotgrid_*` keys already in notes.

These folders are not configured in the Subplot Grid section. **Scene Folder**,
**Subplot Folder**, and **Character Folder** are configured in **Project
Metadata**. See [Folders](#folders).

### Folders

**Scene Folder**, **Subplot Folder**, and **Character Folder** all live in
the **Project Metadata** section of the Project tab. They share the same folder
autocomplete, which suggests folders relative to the project folder. All three
are project-folder-relative; a leading `/` does not mean the vault root. (That
rule applies only to output file paths.) New projects default the scene folder
to `Scenes`, the Subplot Folder to `Subplots`, and the Character Folder to
`Characters`. Existing projects may keep a custom Subplot Folder. An empty
Subplot or Character Folder setting falls back to its default. For example,
`Subplots/Main.md` is the main plot, and other notes under `Subplots/` are
subplots.

Migrated legacy projects may still have a project-root scene folder (`/`),
which resolves to the project folder itself.
That folder contains the subplot and character folders, so the configuration is
nested. Choose a distinct, non-nested scene folder before the subplot grid will
generate.

The three folders must be pairwise **distinct** and **non-nested**: no two
may be the same folder, and none may be a subfolder of another. If the
configuration breaks this rule, the Project tab shows an error and generation
is blocked with a Notice. No Base or `plotgrid_*` keys are written until the
paths are fixed.

Every Markdown note under the Subplot Folder is a row, and every Markdown note
under the Character Folder is a character row. The note named `Main` is the
main plot; the other notes in the Subplot Folder are subplots. There is no
`type` frontmatter field to add, and a note outside those folders is never a
row: folder membership is the only source of truth. Nested subfolders are
included. Other file types are ignored.

The same folders feed the **Notes → Subplots** and **Notes → Characters**
sub-tabs, but the sub-tabs keep only a project-level order and indentation
overlay. The subplot grid does not use that overlay: it scans the folders directly
and applies its own row order (`Main` first, then subplots, then characters).
New subplot and character notes are created in these folders with the project
templates. See
[PLOTS_AND_CHARACTERS.md](./PLOTS_AND_CHARACTERS.md).

## Levels

The subplot grid generates rows for every populated level of the hierarchy. The
generated **Subplot Grid** view has a **Level** dropdown above the table; choosing
a level filters the view to that level's rows. This selector is not a project
setting and is not stored in the project frontmatter. Any legacy
`plotGridLevel` value is dropped when the project is saved.

A level is the **zero-based rank of the distinct indentation values** in the
project's scene list, not a raw indentation number:

```
Act 1                    rank 0
  Chapter 1              rank 1
    Scene 1              rank 2
    Scene 2
  Chapter 2
    Scene 3
Act 2                    rank 0
  Chapter 3
    Scene 4
```

For that hierarchy:

- **Level 0** produces the `Act 1` and `Act 2` rows.
- **Level 1** produces the `Chapter 1`, `Chapter 2`, and `Chapter 3` rows.
- **Level 2** produces the scene rows.

The dropdown lists **All** first, then each populated level. Labels are built
from the hierarchy and show up to three node titles, for example:

```
All
0 - (Act 1 - The Beginning, Act 2 - The Choice)
1 - (Chapter 1 - Arrival, …)
2 - (Scene 1 - The Train, …)
```

Only levels that contain nodes appear. The default selection is level 0 when it
exists; otherwise the first populated level, otherwise **All**. Selecting a
level filters the table; **All** shows every level.

Rows follow the **Scenes** tab/tree document order for the selected level.
**All** groups the levels top-down (level 0, level 1, and so on), with each
level's rows in tree order. Selecting a level does not regenerate the Base.

All levels' `plotgrid_*` keys are generated and preserved. The custom view
shows only the selected level's rows; other levels' keys stay in the notes,
hidden, so switching back restores them. The native fallback table is not
filtered by the dropdown: it shows all levels' columns.

The act/chapter/scene hierarchy is only an example; levels are ranks. If the
top level is chapters, for example, level 0 is that top level. Structural nodes
need their own note files in the scene folder, as scenes do elsewhere in
Longform; otherwise Longform drops them and the levels shift.

### Structural Notes Must Exist

Longform builds its in-memory scene hierarchy from entries in the project's
`scenes` frontmatter that have a matching note directly in the scene
folder. Structural nodes are not special: if you add one to the hierarchy but
never create its note, Longform filters it out.

The symptom is that a level seems to collapse or shift. A project whose
hierarchy lists structural nodes and scenes but only has scene notes will lose
the structural nodes, making level 0 a deeper level. To fix it, create a note
in the scene folder named exactly like each structural entry, as with any other
Longform scene, then reload the project or run **Rebuild subplot grid**. Those
nodes then stay in the hierarchy and become rows.

## Data and YAML

The rows are the Markdown notes under the Subplot and Character Folders. There
is no `type` flag: folder membership decides membership. In the custom view a
note named `Main` in the Subplot Folder is the main plot and comes first, then
the other subplots, then the characters, each group alphabetical by note name.

Each row note gets one frontmatter key for each hierarchy node at every
populated level. The key is built from the node's title, not from its ancestor
path:

- The prefix is `plotgrid_`.
- The title is lowercased, runs of non-alphanumeric characters become one `_`,
  and leading or trailing `_` characters are removed.
- If two nodes at the same level produce the same key, `_2`, `_3`, and so on
  are appended.

For a project that uses simple titles, level 1 might produce:

```yaml
---
plotgrid_chapter_1: ""
plotgrid_chapter_2: ""
plotgrid_chapter_3: ""
---
```

At level 0, `Act 1: The Beginning` slugs to `act_1_the_beginning`, so the key
becomes `plotgrid_act_1_the_beginning`. At level 1, a chapter named
`Chapter 1 - Arrival` becomes `plotgrid_chapter_1_arrival`, regardless of which
act contains it. Keys written by an earlier version from the ancestor path
(for example `plotgrid_act_1__chapter_1_arrival`) are migrated for the
generated column on the next generation: the value moves to the new key when
that cell is empty, and only that migrated legacy key is removed. A non-empty
value already stored under the new key is kept, and keys and values belonging
to other levels are never deleted.

The plugin maintains these keys:

- Missing keys for any populated level are added with an empty string value.
- Every existing `plotgrid_*` key is kept. Choosing a level in the view does
  not delete keys for other levels; the custom view simply does not display
  them.
- Values of existing `plotgrid_*` keys and every key outside the namespace are
  never modified. Unrelated frontmatter keeps its value and its order.
- A note is written only when a generated key needs to be added or a legacy key
  needs migrating. An unchanged note is not rewritten.
- Empty cells are empty strings (`""`), which is why the keys are added that
  way.

The `plotgrid_` namespace is managed by the plugin. You can see the keys in
Obsidian's Properties panel, but edit cells in the grid rather than editing
these keys by hand. Keys for other levels remain in the note but are not shown
until you choose that level in the view. Do not use the namespace for your own
properties: every `plotgrid_*` key is treated as plugin data.

Every Markdown note under the subplot and character folders receives these
keys. There is no flag to opt out with, so keep reference notes, templates,
or other unrelated Markdown out of those folders if you do not want them in the
grid.

## The Generated Base

The Base is written to the path set in **Subplot Grid Output Path**. The default is
`Base/$1_plotgrid.base`, where `$1` is replaced with the project title. Relative
paths are resolved against the project folder; start the path with `/` to write
from the vault root. If the path does not end in `.base`, that extension is
added. An empty setting falls back to the default, and missing folders are
created.

The generated file contains:

- A filter over the subplot and character folders, OR-combined. Because the
  folders are distinct and non-nested, a note matches at most one of them,
  and folder membership alone decides whether it is a subplot or a character.
- The custom transposed view **Subplot Grid** first. It has a **Level** dropdown
  above the table, shows the selected level's hierarchy nodes as rows, and
  shows the notes as columns. A note named `Main` (the main plot) comes first,
  then the other subplots, then the characters, each group alphabetical by note
  name.
- A native table view **Subplot Grid (Table)** as a fallback. Its rows are notes
  and its columns are the properties for all levels; it is not filtered by the
  custom view's Level dropdown. The fallback uses the same order: `Main` first,
  then subplots, then characters.
- Column display names set to the hierarchy titles, and a row-label formula.

In the custom view, each note header is a link that opens the source note.
Because the subplot and character folders are distinct, the label is
`(subplot)` or `(character)` on its own line above the name. The native table
uses a row-label formula that emits the same prefix; its row style may keep the
prefix and name on one line.

Each cell displays only the value stored for that hierarchy node at its own
level. A higher-level row does not show or mirror values from deeper levels.

The `.base` is a build artifact. If you edit its YAML or adjust the views inside
it, those edits are overwritten the next time the Base is regenerated. Edit the
cells in the grid instead: those edits go to the note frontmatter and survive.

No Base is written when the feature is disabled, when the hierarchy has no
populated levels, when there are no notes under the folders, or when the three
folders are not distinct and non-nested. In those cases an existing Base at
the configured path is left untouched.

## Editing

Click a cell to edit it. The editor follows the value's type:

- A text value gets a text field.
- A number gets a number field.
- A boolean gets a checkbox.

Press Enter or click away to commit; press Escape to cancel. A checkbox also
commits immediately when toggled. The new value is written to the row note's
frontmatter under that column's `plotgrid_*` key, using Obsidian's frontmatter
API.

Only `plotgrid_*` cells are editable in the custom view. `file.*` and
`formula.*` properties are not offered as rows, and list or object values are
shown read-only rather than being replaced with text. The custom view keeps
focus while a write refreshes the grid, so editing a cell does not close the
editor mid-entry.

Clicking a note header opens that subplot or character note.

## Updating and Rebuilding

The subplot grid refreshes automatically:

- when the plugin loads;
- when project settings that affect it change (enabled, output path, or the
  three folders);
- when the scene hierarchy changes (titles or indentation);
- when files in the project, scene folder, or the subplot and character
  folders are created, modified, deleted, renamed, or re-indexed.

Generated outputs are excluded from triggering rebuilds, including Bases written
to custom output paths, so writing the grid does not loop. Choosing a level in
the view is client-side and does not rebuild the Base. Automatic skips (for
example, a hierarchy with no populated levels) are logged to the developer
console once per reason rather than shown as notices.

To force a rebuild, select the project and run **Rebuild subplot grid** from the
command palette. The command is only available for a multi-scene project with
the subplot grid enabled. It reports either the number of columns and notes
written or the reason nothing was written.

The Status tab provides two related actions:

- **Refresh** regenerates every enabled status file for the selected project:
  the timeline, the kanban board, and the subplot grid.
- **Open subplot grid** opens the configured Base. It is disabled when the
  subplot grid is off. If the file has not been generated, a notice asks you to use
  **Refresh**.

Changing the output path writes a new Base at the new path but does not move or
delete the old one.

## Troubleshooting

- **No Base was created.** Check that the subplot grid is enabled, that the project
  is a scenes project, that the hierarchy has at least one populated level, and
  that the subplot and character folders contain Markdown notes. An existing Base
  is left untouched when nothing is written; the console explains the skip.
- **The dropdown's level 0 shows deeper nodes than expected.** The structural
  nodes probably have no notes. Longform keeps only entries with matching notes
  directly in the scene folder. Create the missing structural notes, then
  rebuild.
- **A level is missing from the dropdown.** Only populated levels appear.
  Levels with no nodes are omitted, and structural nodes without note files do
  not survive Longform's filtering.
- **A note is missing from the grid.** Confirm it is a Markdown file under the
  subplot or character folder. Folder membership is the only requirement;
  there is no `type` flag to add. The folders are project-folder-relative; a
  leading `/` does not mean the vault root. Check for a misspelled folder name.
- **The grid will not generate after editing a folder.** The Scene Folder,
  Subplot Folder, and Character Folder must be pairwise distinct and
  non-nested. Change the paths so none equals or contains another, then
  rebuild. Generation is blocked with a Notice while the configuration is
  invalid. A migrated project whose Scene Folder is still the project root
  (`/`) hits this rule because the project root contains the subplot and
  character folders.
- **A note is in the wrong group.** Subplots come from the Subplot Folder and
  characters from the Character Folder. Move the note to the other folder
  rather than adding frontmatter.
- **A previous level's keys are still in the frontmatter.** This is expected.
  Choosing a level in the view preserves every level's `plotgrid_*` keys and
  values; only the selected level's rows are shown in the grid. Choose that
  level to see and edit them. Legacy ancestor-path keys migrate for the
  generated columns, and other-level data is never deleted.
- **My edits to the Base disappeared.** The Base is generated. Change cells in
  the grid (which writes the notes) rather than editing the `.base` file.
- **The custom view is missing.** Enable Obsidian's Bases core plugin and reload
  the plugin after updating it. The generated Base also includes a native table
  view as a fallback.
- **The subplot grid stops updating after an update.** Reload Obsidian or disable
  and re-enable the plugin so the new code is loaded, then rebuild.
- **An old Base remains after changing the output path.** Changing the path
  writes a new file but does not remove the old one; delete it yourself.
