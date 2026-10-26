# Subplots and Characters

Multi-scene projects get a **Notes** tab in the Longform Extended pane, with
**Scenes**, **Subplots**, and **Characters** sub-tabs. The pane opens on
**Notes → Scenes** by default. The **Subplots** and **Characters** sub-tabs list
the Markdown notes in the project's **Subplot Folder** and **Character Folder**,
and let you create, rename, reorder, and nest those notes without leaving the
pane. Single-note projects have only the **Project** and **Compile** tabs;
**Notes** and **Status** redirect to **Project**.

Membership comes from the configured folders. There is no `type` flag or other
frontmatter marker to add: a Markdown note under the Subplot Folder is a
subplot (the note named `Main` is the main plot), and a Markdown note under the
Character Folder is a character. New projects default the Subplot Folder to
`Subplots` and the Character Folder to `Characters`; existing projects may keep
a custom Subplot Folder. For example, `Subplots/Main.md` is the main plot, and
other notes under `Subplots/` are subplots. The folder settings, their defaults,
and the distinct/non-nested rule are described in
[PLOT_GRID.md](./PLOT_GRID.md#folders).

The sub-tabs are organizational. The subplot grid and the timeline read the
folders directly, so changing a note's position or indentation in these sub-tabs
does not change the grid or the tables. See
[Relationship to the subplot grid and timeline](#relationship-to-the-subplot-grid-and-timeline).

## Creating Notes

Each sub-tab has a **New Subplot** or **New Character** field at the bottom.

- Press **Enter** to create the note and open it.
- Press **Shift+Enter** to create the note without opening it.
- Press **Escape** to clear the field.

A name that matches an existing entry in that sub-tab, or that contains
characters that are not valid in a file name, is rejected with an inline error
and no note is created. Duplicate and invalid-name notices use the subplot or
character wording. The note is written to the configured folder at its root;
missing parent folders are created.

Notes created outside the pane are picked up from the folder on the next sync
and added to the sub-tab. They are not created through the template workflow.

### Templates

New notes use a template when one is configured:

- **Per project:** **Subplot Template** and **Character Template** are in the
  **Project Metadata** section of the Project tab, next to **Scene Template**.
- **Global fallback:** **New subplot template** and **New character template**
  in the plugin settings, under **Composition**. They apply to every project
  and are overridden by a project's own template.
- The defaults for all three template settings are none. An empty project
  template falls back to the global setting.

Templates are processed the same way as scene templates. If Templater is
enabled, it processes the template; otherwise, if Obsidian's core Templates
plugin is enabled, that is used. With neither enabled, the new note is created
empty. Template errors are logged, and the note remains created.

The **Add new subplot/character above** and **Add new subplot/character below**
menu items also create their note through this template workflow, using a unique
`Untitled` name and opening the new note.

## Organizing the Tree

The Subplots and Characters sub-tabs use the same tree behavior as the Scenes
sub-tab:

- **Reorder** by dragging a note up or down.
- **Indent** by dragging a note horizontally, or with the global **Indent
  scene** and **Unindent scene** commands while the subplot or character note is
  active. Unindent is unavailable at the top level.
- **Collapse** a note that has children with its disclosure arrow.
- **Open** a note by clicking it. Modifier-click and middle-click follow
  Obsidian's usual link behavior.
- **Rename** inline from the right-click menu: Enter commits, and Escape or
  clicking away cancels. The renamed note is written to the root of its
  configured folder, even if it was previously in a nested subfolder.
- **Delete** from the right-click menu. The note is moved to the trash.
- **Add above** or **Add below** from the right-click menu. The new note is
  created in the configured folder and opened.
- **Open in new pane** from the right-click menu.

The right-click menu is available on desktop.

## Membership and Order Overlay

The configured folders are the source of truth for membership. Every Markdown
note under the Subplot Folder or Character Folder is a member, including notes
in nested subfolders; other file types are ignored.

The project note stores a small order/indent overlay that records only the
displayed order and indentation. It does not decide which notes exist. The
overlay is reconciled with the folders when the project loads or syncs:

- Entries whose notes are gone are removed.
- Notes that are missing from the overlay are appended at the top level
  (indent 0), in alphabetical order.
- Creation adds the note and an overlay entry at the requested position.
- Reordering and indenting change only the overlay; the notes are not moved.
- Deleting a note removes its entry.
- Renaming or moving a note updates its entry. A rename within the same tree
  keeps its position and indentation; moving a note out removes the entry, and
  moving one in appends it at the top level.

The overlay is keyed by basename. If two notes in nested subfolders share a
basename, only the first one in path order appears in the sub-tab; the overlay
cannot represent both. Keep subplot and character basenames unique. The inline
rename always targets the configured folder root, so renaming a note from a
nested subfolder also moves it to that root.

## Relationship to the Subplot Grid and Timeline

The subplot grid and timeline do not use the sub-tab overlay:

- The **subplot grid** scans the Subplot and Character Folders for its rows. Its
  row order is its own: `Main` first (the main plot), then the other subplots,
  then characters, alphabetical within each group. Sub-tab order and
  indentation do not affect the grid.
- The **timeline plot and subplot tables** read the Subplot Folder for their
  rows. Sub-tab order and indentation do not affect which subplots appear, their
  order, or which scenes they mention.

Both features still require the folders to be pairwise distinct and
non-nested. See [PLOT_GRID.md](./PLOT_GRID.md#folders).

## Troubleshooting

- **A note is missing from the sub-tab.** Check that it is a Markdown file under
  the configured folder, including a nested subfolder, and that its basename is
  unique. Other file types and duplicate basenames are not listed.
- **A note is in the sub-tab but not in the subplot grid or timeline.** Both
  features scan the same folders, so check the subplot grid's level and output
  settings, or the timeline's timeframes. Sub-tab membership is not the cause.
- **The template was not applied.** Templates apply to notes created from the
  New field or the add-above/add-below menu. Check the project template first,
  then the global fallback, and confirm Templater or the core Templates plugin
  is enabled.
- **A note was moved after renaming.** Inline rename always writes to the root
  of the configured folder; move the note back into a subfolder afterwards if
  you want it nested on disk.
- **The Notes sub-tabs are missing.** Subplots and Characters are available only
  for multi-scene projects, under **Notes**.
