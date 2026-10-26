<!-- TODO: Set up your donation link (GitHub Sponsors, Ko-fi, or similar), then update `fundingUrl` in manifest.json and the Sponsorship section below. -->
# Longform Extended

> [!NOTE]
> **This is a fork.** Longform Extended is [Longform](https://github.com/kevboh/longform) with a few added visualization tools, and nothing else. It is meant to be the exact same plugin as Longform, so you should be able to use the two interchangeably without any trouble. If you already use Longform, you should not need to change a thing.

## What This Is

Longform Extended is a plugin for [Obsidian](https://obsidian.md) that helps you write and edit novels, screenplays, and other long projects. It keeps everything Longform does — a series of notes, or _scenes_, organized into an ordered manuscript, single-note projects for shorter works, drafts, word counts, and compile workflows — exactly as they are, and adds a small set of lightweight views on top. Your notes and frontmatter stay exactly as Longform expects them, so nothing about your existing projects changes.

## What This Is Not

Longform Extended is not a full writing suite in the style of heavier plugins that bolt on elaborate metadata systems and story databases. There are no new required fields, no per-scene character or plot schema, and no overcomplicated configuration. It is just Longform, plus a few extra visualization tools.

## Added Features

### Implemented

- **Timeline view** — see your scenes laid out along a timeline, driven by a
  per-scene `timeframe` value and a project-wide time format, with transposed
  plot and subplot tables when the subplot grid is enabled (see
  [Timeline](#timeline)).
- **Kanban board** — a status-driven board written to a configurable output
  path (see [Kanban](#kanban)).
- **Notes tab** — **Scenes**, **Subplots**, and **Characters** sub-tabs to
  browse, create, rename, reorder, and nest notes, with optional templates (see
  [Subplots and Characters](#subplots-and-characters)).
- **Subplot Grid** — an editable table of the subplots and characters in your
  Subplot and Character Folders across the levels of your scene hierarchy (see
  [Subplot Grid](#subplot-grid)).

### Wishlist

- **Corkboard** — a board of scene cards you can drag to rearrange.

## Timeline

Longform Extended can generate a timeline for every project with scenes. The
note contains a Mermaid timeline diagram and a table, both ordered by a
per-scene timeframe value, so you can see the order of your story at a glance.
When the subplot grid is enabled, the table is a transposed plot and subplot
table instead of the scene table. It is enabled by default. See
[TIMELINE.md](./docs/TIMELINE.md) for the full documentation.

The Timeline section of the Project tab controls it:

- **Enable timeline** turns generation on or off. Turning it off stops future
  updates but leaves an existing timeline note in place.
- **Timeframe Tag Name** is the frontmatter property read from each scene.
- **Time Format** describes how timeframe values are written.
- **Timeline Output Path** is where the note is written.

### Timeframe Tag Name

The property that holds a scene's timeframe value. It defaults to `timeframe`,
so a scene might have:

```yaml
---
timeframe: "04/03/2026 09:30"
---
```

Rename it if `timeframe` clashes with something else in your vault, but use the
same property for every scene. Scenes with no timeframe value are quietly left
off the timeline; they are not reported as errors.

### Time Format

Choose the format whose biggest unit matches your story's span — smaller units
can be left off. The options are:

- **Epoch date time (num dd/mm/yyyy hh:mm:ss)** — an epoch number, then a
  day-first date, then a time, e.g. `2 04/03/2026 09:30:00`. The `num` is an
  epoch: a number for a span larger than a year, handy when a story crosses
  ages.
- **Epoch date time (num mm/dd/yyyy hh:mm:ss)** — the same, with a month-first
  date.
- **Date time (dd/mm/yyyy hh:mm:ss)** — a day-first date and a time, e.g.
  `04/03/2026 09:30:00`.
- **Time only (hh:mm:ss)** — just a time, for a story that stays within one
  day, e.g. `09:30:00`.
- **Chronological order (num)** — a single number that just orders scenes, like
  `1`, `2`, `3`.

You don't have to fill in every unit. You can drop units from right to left —
from the smallest up:

- `04/03/2026 09:30` — seconds omitted.
- `04/03/2026 09` — seconds and minutes omitted.
- `04/03/2026` — the whole time omitted.

You cannot drop units from left to right, so you can't drop the epoch or the
date and keep the time. Use the same number of units for every scene; mixed
values are reported as inconsistent. The exact minimum depends on the format
(see [Partial values](./docs/TIMELINE.md#partial-values)).

### Timeline Output Path

Where the timeline note is written. It defaults to `Build/$1_timeline.md`,
where `$1` is replaced with the project title. Relative paths are resolved
against the project folder; start with `/` to write from the vault root. The
`.md` extension is added if you leave it off, and any missing folders are
created. Changing the path writes a new note but does not move or delete the
old one. See [TIMELINE.md](./docs/TIMELINE.md#output) for details.

### Plot and Subplot Tables

When the subplot grid is enabled, the timeline note's scene table is replaced
by a transposed plot and subplot table. Its first column is headed **Subplot**.
Its rows are **Full Story**, then **Main** if a note named `Main` exists (the
main plot), then every other subplot note in the **Subplot Folder**,
alphabetically; those other subplot notes are the subplots. Its columns are the
timeline's time groups, each headed by the primary value, the units between the
primary and secondary unit, and the cadence. Each cell lists links to the scenes
for that row at that time.

When the hierarchy has more than one populated level, the timeline repeats this
table for each level, deepest first and then the levels above it (for example
Level 2, then Level 1, then Level 0), under generic headings such as
`Level 2 — Scene 1, Scene 2, …`. The deepest table links scene notes; shallower
tables link each scene's ancestor node at that level. Level labels are generic:
act, chapter, and scene names are only sample node titles. A single-level
hierarchy gets one table with no level heading.

The main plot and each subplot mention a scene through a non-empty scene-level
subplot-grid cell, a wikilink, or the scene's exact title in that row's note.
The timeline uses the subplot grid's deepest (scene) level for these mentions;
it has no level setting of its own. Scenes that neither the main plot nor any
subplot mentions are listed after the tables under
**These scenes have not been mentioned in any subplot line**. Disable the
subplot grid to get the original scene table back. See
[TIMELINE.md](./docs/TIMELINE.md#the-plot-and-subplot-tables) for details.

### When It Updates

The timeline refreshes automatically when the plugin loads and when files in
the project change. Run **Rebuild timeline** from the command palette to force
a rebuild; the command is available when a scenes project with the timeline
enabled is selected.

If any scene has an invalid or inconsistent timeframe, the note is replaced
with a **Problems** list and the diagram is omitted until you fix them. The
generated timeline is a build artifact: edits made inside it are overwritten on
the next rebuild.

## Kanban

A Kanban board is generated for each scenes project as a native Obsidian Bases
file (`.base`) with a Kanban view. It requires **Obsidian 1.14 or newer**; no
community kanban plugin is needed. Each card is a listed scene, or a note from
the Subplot Folder when **Include subplots** is enabled. The board shows exactly the configured
columns, and dragging a card between them writes the column title back into that
note's `status` frontmatter. The board is enabled by default. See
[KANBAN.md](./docs/KANBAN.md) for the full documentation.

The Kanban section of the Project tab controls it:

- **Enable kanban** turns generation on or off. Turning it off stops future
  updates but leaves an existing board in place.
- **Kanban Columns** lists the columns, in board order.
- **Show notes with no status** includes unassigned notes in an `Unassigned`
  column (off by default).
- **Save word counts** writes each card scene's word count to its frontmatter.
- **Include subplots** adds notes from the Subplot Folder to the board alongside
  project scenes (on by default). Character Folder notes are never included.
- **Kanban Output Path** is where the board is written.

### Kanban Columns

Titles are separated by spaces. Quote any title that contains spaces, using
single or double quotes:

```
Planned Draft Reviewed
"To do" Draft "In progress" Done
```

The order you write them in is the order of the columns. The default is
`Planned Draft Reviewed`, and clearing the field falls back to it. Matching is
case-sensitive: `draft` does not match `Draft`.

### Status

A card note's column comes from its `status` frontmatter:

```yaml
---
status: Draft
---
```

Dragging a card to another column writes that column title into `status`, so
the board and the notes stay in sync. Notes with a missing or empty status are
hidden unless **Show notes with no status** is enabled. Statuses that don't
match a configured column all share a single `Incorrectly Assigned` column
instead of becoming columns of their own; add the column or fix the status,
then rebuild. Notes from the Subplot Folder follow the same status, drag,
unknown-status, and unassigned rules as scenes.

The board includes scenes that are listed in the project and are not
structural containers. Unlisted notes in the scene folder are excluded even if
they have a status. With **Include subplots** on, it also includes the notes in
the Subplot Folder; notes in the Character Folder are never included.

A board is only generated when at least one scene, or (with **Include subplots**)
at least one note in the Subplot Folder, has a non-empty status, even if **Show
notes with no status** is enabled.

The board groups by the writable, plugin-managed `longformKanbanStatus`
frontmatter property rather than by `status` directly: Bases only writes a
dropped card's group back for an editable note property, and grouping by a
formula would make cards undraggable. The plugin mirrors the helper to `status`
and refreshes the helper when statuses change. See
[KANBAN.md](./docs/KANBAN.md#the-status-property) for details.

### Word Counts

With **Save word counts** enabled (the default), listed scenes with a
recognized status have their word count written to their frontmatter as
`wordCount`, and the board shows it as a card property. Scenes that are
containers, have no status, have an unrecognized status, or have no place in the
project's scene list do not get a word count written. Turning the setting off
stops the writes but leaves any existing `wordCount` values in place.

Notes in the Subplot Folder never get a word count generated or written. With
**Include subplots** off, the board shows `note.wordCount` for scenes as before.
With it on, the **Word Count** card property is computed by a display formula:
scenes keep their count and subplot cards are blank. With **Save word counts**
off, no word-count card property appears at all.

### Kanban Output Path

Where the kanban Base is written. It defaults to `Build/$1_kanban.base`, where
`$1` is replaced with the project title. Relative paths are resolved against
the project folder; start with `/` to write from the vault root. The `.base`
extension is added if you leave it off, and any missing folders are created.
Changing the path writes a new board but does not move or delete the old one.
See [KANBAN.md](./docs/KANBAN.md#output) for details.

### When It Updates

The board refreshes automatically when the plugin loads and when files in the
project change, and word counts are updated when Longform's scene counts change.
Toggling **Include subplots** regenerates the board; when it is on, changes to notes
in the Subplot Folder also refresh it. Run **Rebuild kanban** from the command
palette to force a rebuild; the command is available when a scenes project with
the kanban enabled is selected. The generated board is a build artifact: edits
made inside it are overwritten on the next rebuild.

## Subplot Grid

A subplot grid tracks your subplots and characters across the structure of your story.
It is generated for each project with scenes as a native Obsidian Bases file
(`.base`) with a transposed, editable view: notes from your Subplot and
Character Folders appear as columns, and the level you choose in the view
appears as rows. Cells write back to the notes' frontmatter, so the grid is a view of your
data rather than a separate database. It requires
**Obsidian 1.14 or newer**, and it is enabled by default. See
[PLOT_GRID.md](./docs/PLOT_GRID.md) for the full documentation.

The Subplot Grid section of the Project tab controls it:

- **Enable subplot grid** turns generation on or off. Turning it off stops future
  updates but leaves an existing Base and its `plotgrid_*` keys in place.
- **Subplot Grid Output Path** is where the Base is written.

The **Level** selector lives in the generated Subplot Grid view, above the table.

The **Scene Folder**, **Subplot Folder**, and **Character Folder** settings live in
the **Project Metadata** section of the Project tab. They share the same folder
autocomplete, which suggests folders relative to the project folder. All three
are project-folder-relative; a leading `/` does not mean the vault root. (That
rule applies only to output file paths.) New projects default the Scene Folder
to `Scenes`, the Subplot Folder to `Subplots`, and the Character Folder to
`Characters`. Existing projects may keep a custom Subplot Folder. For example,
`Subplots/Main.md` is the main plot. Migrated legacy projects may still have a
project-root scene folder (`/`); choose a distinct, non-nested scene folder
before the subplot grid can generate. The
output path resolves against the project folder; start it with `/` to write from
the vault root.

The three folders must be pairwise distinct and non-nested: no two may be the
same folder, and none may be a subfolder of another. If the configuration is
invalid, the Project tab shows an error and generation is blocked with a Notice
until the paths are fixed. Folder membership is the only thing that makes a
note a subplot or a character; there is no `type` frontmatter flag to add.

### Levels

The **Subplot Grid** view has a **Level** dropdown above the table. It is not a
project setting and is not stored in the project frontmatter; an old
`plotGridLevel` value is removed when the project is saved.

A level is the zero-based rank of the distinct indentation values in the
project's scene list, not a raw indentation number:

```
Act 1                    level 0
  Chapter 1              level 1
    Scene 1              level 2
    Scene 2
  Chapter 2
    Scene 3
Act 2                    level 0
  Chapter 3              level 1
    Scene 4              level 2
```

For that hierarchy:

- Level 0 makes the `Act 1` and `Act 2` rows.
- Level 1 makes the `Chapter 1`, `Chapter 2`, and `Chapter 3` rows.
- Level 2 makes the scene rows.

The dropdown lists **All** plus each populated level, with labels built from the
hierarchy, such as `0 - (Act 1 - The Beginning, Act 2 - The Choice)`,
`1 - (Chapter 1 - Arrival, …)`, and `2 - (Scene 1 - The Train, …)`. The default
is level 0 when it exists, otherwise the first populated level, otherwise
**All**.

Selecting a level filters the rows to that level; **All** shows every level.
Rows follow the **Scenes** tab/tree document order. For **All**, levels are
grouped top-down (level 0, level 1, and so on) in tree order. Selecting a level
does not regenerate the Base.

The Base generates and preserves every level's `plotgrid_*` keys, but the
custom view shows only the selected level's rows. The native fallback table
shows all levels' columns.

Structural nodes need their own notes in the scene folder, as scenes do
elsewhere in Longform; otherwise Longform drops them and the levels shift.

### The Grid

The generated Base contains a custom **Subplot Grid** view with a **Level**
dropdown above the table, subplot and character notes as clickable column headers,
and the selected level's nodes as rows, plus a native **Subplot Grid (Table)**
view as a fallback. The main plot comes first: a note named `Main` is the main
plot, then the other subplots alphabetically, then the characters
alphabetically. The native fallback uses the same order. Because the Subplot and
Character Folders are distinct, headers show `(subplot)` or `(character)` on a
separate line above the name. Each cell shows only the value stored for that
row's hierarchy node; a higher level does not mirror values from deeper levels.

Click a cell to edit it. Text, number, and checkbox values get a matching
editor; Enter or clicking away commits, and Escape cancels. Only scalar
`plotgrid_*` values are editable. Lists and objects are read-only, and edits go
to that column's subplot or character note, not to the `.base` file. The Base is a
build artifact: manual edits to its YAML or views are overwritten when it is
regenerated.

### When It Updates

The grid refreshes automatically when the plugin loads and when project
settings, the scene hierarchy, or files in the project, scene, or Subplot and
Character Folders change. Run **Rebuild subplot grid** from the command palette
to force a rebuild; the command is available when a scenes project with the
subplot grid enabled is selected.

In the Status tab, **Refresh** regenerates the timeline, kanban board, and
subplot grid together, and **Open subplot grid** opens the configured Base. If
it has not been generated yet, a notice asks you to use Refresh.

## Subplots and Characters

Multi-scene projects get a **Notes** tab, with **Scenes**, **Subplots**, and
**Characters** sub-tabs; the pane opens on **Notes → Scenes** by default. The
**Subplots** and **Characters** sub-tabs list the Markdown notes in the project's
**Subplot Folder** and **Character Folder**, and let you create, rename, reorder,
and nest those notes from the pane. Single-note projects have only the
**Project** and **Compile** tabs; **Notes** and **Status** redirect to
**Project**. There is no `type` flag: folder membership decides whether a note
is a subplot or a character. See
[PLOTS_AND_CHARACTERS.md](./docs/PLOTS_AND_CHARACTERS.md) for the full
documentation.

The sub-tabs are organizational. The subplot grid and timeline read the folders
directly, so sub-tab order and indentation do not change the grid or the timeline
plot and subplot tables.

### Creating Notes

The **New Subplot** and **New Character** fields at the bottom of each sub-tab create
a note in the configured folder. Press Enter to create and open it, or
Shift+Enter to create it without opening. Duplicate names, and names with
invalid filename characters, are rejected with an inline error.

New notes use the project's **Subplot Template** or **Character Template** from
**Project Metadata**, next to **Scene Template**. If a project template is not
set, the global **New subplot template** or **New character template** in plugin
settings applies. Both default to none. Templates are processed like scene
templates: Templater if enabled, otherwise the core Templates plugin. See
[Templates](./docs/PLOTS_AND_CHARACTERS.md#templates).

### Organizing Notes

Drag a note to reorder it, or drag horizontally to indent it; the global
**Indent scene** and **Unindent scene** commands also work on the active subplot
or character note. Notes with children can be collapsed. Click a note to open
it.

The right-click menu (desktop) provides inline rename, delete, open in new pane,
and add-new above or below. Inline rename commits with Enter and cancels with
Escape or a click away; it writes the renamed note to the root of its configured
folder. Deleted notes are moved to the trash.

The folders own membership. The project note stores only an order/indent
overlay: notes missing from it are appended alphabetically at the top level,
deleted entries are pruned, and reordering or indenting changes the overlay
rather than the notes. The overlay is keyed by basename, so duplicate basenames
in nested subfolders collapse to the first path. See
[Membership and order](./docs/PLOTS_AND_CHARACTERS.md#membership-and-order-overlay).

## Longform

Longform is a plugin for [Obsidian](https://obsidian.md) that helps you write and edit novels, screenplays, and other long projects. It lets you organize a series of notes, or _scenes_, into an ordered manuscript. It also supports single-note projects for shorter works.

Major features include:

- A dedicated sidebar that collects your projects from across your vault;
- A [reorderable, nestable list](./docs/MULTIPLE_SCENE_PROJECTS.md) of scenes;
- Scene/draft/project [word counts](./docs/WORD_COUNTS.md#word-counts-for-projects-drafts-and-scenes);
- Daily [writing session goals](./docs/WORD_COUNTS.md#writing-sessions-and-word-count-goals) with lots of options to help fit your writing style;
- A [workflow-based compilation tool](./docs/COMPILE.md) that can create manuscripts from your projects;
- Support for [single-scene projects](/docs/SINGLE_SCENE_PROJECTS.md) so that your shorter works can use the same workflows and tooling as your longer ones;
- Plus lots of commands, modals, and menu items to help you manage your work.

A Getting Started guide follows; there is also reasonably-complete [documentation](./docs/).

## Installing

Longform is in the Community Plugins section of Obsidian’s settings. You may also install it manually by copying the `main.js`, `manifest.json`, and `styles.css` files from a release into a `longform/` folder in the `.obsidian/plugins` folder of your vault. The Community Plugins interface is preferred.

## Getting Started

Longform works by searching your vault for any note that contains a frontmatter entry named `longform` (don’t worry if you don’t know what that means; Longform includes tools to help you generate these files). You can think of these notes as the “spines” or tables of contents of your projects. Let‘s walk through creating two different Longform projects: a novel and a short story.

### Creating a Novel

1. To begin, find or create a folder somewhere in your vault in which you’d like to create your novel. Right-click it and select `Create Longform Project`.

![Create Longform Project menu item](./docs/res/walkthrough-create-longform-project.png)

2. A `Create Project` modal will appear. This modal lets us choose between Multi- and Single-scene project types. We’re creating a novel, so we’ll stick with Multi. The text under the project type switch explains a little about how each type of project works.

3. In the `Title` field, enter your novel’s title. For this example we’ll use `My Great Novel`. The modal tells us the type of project we’re creating and the location of the _Index File_ it will create in our vault. We’ll get into what Index Files are in a moment.

![A filled-out create multi-scene project modal](./docs/res/walkthrough-create-multi.png)

> **Note**
>
> You don’t have to use this menu item and modal to create Longform projects. As you will see shortly, Longform projects are one or more notes organized around some YAML frontmatter. You can always create a note yourself somewhere in your vault and use the `Insert Multi-Scene Frontmatter` and `Insert Single-Scene Frontmatter` commands to populate the note—Longform will recognize it automatically. Although not recommended, you can also author the YAML frontmatter manually, too.

4. Click `Create`. Longform has created the promised file. If we switch to the [Longform pane](./docs/THE_LONGFORM_PANE.md) in the sidebar the project is already selected. You should see three tabs: Scenes, Project, and Compile, and Scenes should be selected.

![The newly-created project in the Longform pane](./docs/res/walkthrough-multi-fresh-pane.png)

5. That _New Scene_ placeholder is a text field—click it and enter something that sounds like the first scene of a novel, maybe “The Sun Rises on Dublin,” and press enter. You should now be editing a so-named note, and your scene should appear in the Scenes tab:

![the "My Great Novel" novel with a freshly-created scene](./docs/res/multi-walkthrough-2.png)

6. Your editor also now has the scene open and ready to write. If you click the small `My Great Novel/Index.md` link under your project name, you’ll be taken back to the index file where you’ll see your new scene listed under the `scenes` frontmatter entry:

```yaml
scenes:
  - The Sun Rises on Dublin
```

This is how Longform tracks your work.

> **Warning**
>
> You should probably avoid editing the `longform` frontmatter in your index file directly unless you really know what you’re doing. Longform supports direct editing of it and will do its best to sync, but it’s easy to accidentally mess things up. You can always revert your changes, though: Longform will never delete files based on changes in the index file.

7. You’re now ready to write your novel. Keep adding scenes as needed. If you’d like to add structure to your novel you can drag scenes left or right (or use the indent/Unindent commands) to create folders of scenes with parent scenes. [The full documentation for multiple-scene projects](./docs/MULTIPLE_SCENE_PROJECTS.md) might be useful.

8. When you’re ready to generate a single manuscript for your readers, use the [Compile](./docs/COMPILE.md) feature. Congratulations! You’ve written a novel.

### Creating a Short Story

Longform also supports [single-scene projects](./docs/SINGLE_SCENE_PROJECTS.md) that live as a single note in your vault. Let’s create one.

1. Right-click the enclosing folder as before and select the `Create Longform Project` menu item.

2. In the Create Project modal, choose `Single`. Let’s write something noirish and call it `On the Rooftops`.

![Creating a single-scene Longform project in the Create Project modal](./docs/res/walkthrough-create-single.png)

3. Click Create. Because this is a single-scene project, there is only one note associated with it and Longform will open it automatically. The frontmatter at the top tells Longform how to track your project; we’ll write the story in the note itself.

4. Write your story! When you’re ready, you can use the Compile tab to generate a manuscript. Single-scene projects can use scene and manuscript steps in any order.

## Drafts & Projects

Longform supports the creation of multiple _drafts_ for a given project. Under the hood, drafts are just different Longform projects with the same title—they are then grouped together by Longform and presented as different versions of the same project.

To create a new draft of a project use the new draft (+) button in the Project tab, or create an entirely new project somewhere and set the title in the Project tab to be the same as your existing project.

You can rename drafts by right-clicking them in the Project tab and selecting Rename, or by setting the `draftTitle` attribute in their `longform` frontmatter.

## Compiling

The Compile tab allows you to create custom workflows that turn your project into a manuscript. See [COMPILE.md](https://github.com/kevboh/longform/blob/main/docs/COMPILE.md) for more.

> [!TIP]
> You can find more compile steps for various use cases in the [community collection of compile steps](https://github.com/obsidian-community/longform-compile-steps).

## Scene-only Styling

Longform will automatically attach a `.longform-leaf` class to the container panes of any notes that are part of a Longform project. This means you can add custom CSS snippets to Obsidian that style your writing environment and _only_ your writing environment. For example, I prefer a dark theme for Obsidian but a light theme for writing, so my writing snippet looks something like this:

```css
/* Set some variables for the entire leaf. */
.longform-leaf {
  --background-primary: white;
  --background-primary-alt: white;
  --background-secondary: white;
  --background-secondary-alt: white;
}

/* Style the editor. */
.longform-leaf .markdown-source-view {
  --background-primary: white;
  --background-primary-alt: white;
  --background-secondary: white;
  --background-secondary-alt: white;
  --text-selection: #aaa;
  --text-normal: black;
  color: black;
  background-color: white;
}

/* Style text selection. */
.longform-leaf .suggestion-item.is-selected {
  background-color: var(--text-accent);
}

/* Style the header of the leaf. */
.longform-leaf .view-header {
  background-color: white;
}

/* Style the text content of the leaf header. */
.longform-leaf .view-header-title {
  --text-normal: black;
}
```

Longform’s own UI will always use existing Obsidian CSS theme variables when possible, so it should always look at home in your theme.

## Troubleshooting

First, the most important bit: **Longform is built specifically to never alter the contents on your notes.** The only note it rewrites is a project’s index file. As such, Longform can’t delete or lose your notes.

Longform does a lot of complex tracking to bridge a project’s metadata with the state of files on disk. Although it tries to cover lots of edge cases, it is possible to cause desync between what Longform thinks is happening with projects and what’s actually going on. Most often this occurs when a project’s frontmatter is malformed or invalid in some way. Because projects are inferred from frontmatter, if your frontmatter is correct you can always restart Obsidian (or choose the "reload without saving" command) to force Longform to recalculate projects.

## Sponsorship

Any [sponsorship](https://github.com/sponsors/wandrade) is deeply appreciated, although by no means necessary.

## License

This fork is dual-licensed.

- The original [Longform](https://github.com/kevboh/longform) code remains under its original license, the Fuck Around and Find Out License. See [LICENSE.md](./LICENSE.md). You can view that license’s history [here](https://git.sr.ht/~boringcactus/fafol/tree/master/LICENSE.md).
- All additions and changes made in this fork are under a separate license that allows private use and modification but requires consent for redistribution. See [LICENSE-ADDITIONS.md](./LICENSE-ADDITIONS.md).
