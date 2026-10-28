# The Index File

The Index File is a note with a `longform` frontmatter entry. You can think of it as the “root” of a project: it tells Longform Extended what kind of project it is, where the scenes are, and other metadata.

## The `longform` Entry

The `longform` frontmatter entry is how Longform Extended discovers, tracks, and reasons about projects. It contains the following properties:

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| format | `"single"` or `"scenes"` | Required | Whether this is a [single-](./SINGLE_SCENE_PROJECTS.md) or [multi-](./MULTIPLE_SCENE_PROJECTS.md) scene project. |
| title | `string` | Index file name | The project title. Projects with the same title are grouped as drafts of one project. |
| draftTitle | `string` | None | The draft’s display name in the Project tab and draft pickers. When absent, the draft’s vault path is shown. |
| workflow | `string` | None | The last workflow selected for this draft in Compile. |
| sceneFolder | `string` | `/` when absent | The folder holding the scenes, relative to the index file’s folder. New projects use `Scenes`. A leading `/` does not mean the vault root. |
| scenes | nested `string[]` | `[]` | The scene tree. Each array level is one indentation level, as described in [Multi-scene projects](./MULTIPLE_SCENE_PROJECTS.md#scene-indentation--nesting). |
| sceneTemplate | `string` | None | Template note for new scenes. |
| ignoredFiles | `string[]` | `[]` | Scene names, without `.md`, that Longform Extended should not prompt to add. Wildcards are allowed. |

## Added Feature Settings

Multi-scene index files also store the settings for the Timeline, Kanban, and
Subplot Grid sections of the Project tab. Longform Extended writes these fields
when it saves the project; a field that is absent uses its default, so older
projects need no migration.

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| plots | nested `string[]` | `[]` | The order and indentation shown in **Notes → Subplots**. Folder membership still decides which notes are subplots. |
| characters | nested `string[]` | `[]` | The order and indentation shown in **Notes → Characters**. Folder membership still decides which notes are characters. |
| sceneDisplayName | `string` | `Scenes` | Presentation label for the built-in Scenes group. Omitted when it equals the default. Does not change `sceneFolder`. |
| plotsDisplayName | `string` | `Subplots` | Presentation label for the built-in Subplots group. Omitted when it equals the default. Does not change `plotGridPlotsDir`. |
| charactersDisplayName | `string` | `Characters` | Presentation label for the built-in Characters group. Omitted when it equals the default. Does not change `plotGridCharactersDir`. |
| noteGroups | `{ name, folder, template, entries }[]` | `[]` | Extra note groups, in sub-tab order. `folder` defaults to the name with spaces replaced by underscores; `template` is optional; `entries` is an order/indent overlay only. Omitted when the list is empty. |
| plotTemplate | `string` | None | Project-specific template for new subplots. Falls back to the global **New subplot template**. |
| characterTemplate | `string` | None | Project-specific template for new characters. Falls back to the global **New character template**. |
| timeframeTagName | `string` | `timeframe` | Frontmatter property read for each scene’s timeline value. |
| timeFormat | `string` | `datetime` | One of the five [time formats](./TIMELINE.md#time-formats). |
| timelineEnabled | `boolean` | `true` | Whether the timeline is generated. Only `false` is stored. |
| timelineOutputPath | `string` | `Build/$1_timeline.md` | Timeline output path. |
| kanbanColumns | `string` | `Planned Draft Reviewed` | Kanban columns, in order. |
| kanbanOutputPath | `string` | `Build/$1_kanban.base` | Kanban output path. |
| kanbanShowUnassigned | `boolean` | `false` | Whether notes with no status get an `Unassigned` column. Only `true` is stored. |
| kanbanSaveWordCounts | `boolean` | `true` | Whether scene word counts are written to `wordCount`. Only `false` is stored. |
| kanbanEnabled | `boolean` | `true` | Whether the kanban board is generated. Only `false` is stored. |
| kanbanIncludePlots | `boolean` | `true` | Whether **Include subplots** is on. Only `false` is stored. |
| plotGridEnabled | `boolean` | `true` | Whether the subplot grid is generated. Only `false` is stored. |
| plotGridOutputPath | `string` | `Build/$1_plotgrid.base` | Subplot Grid output path. |
| plotGridPlotsDir | `string` | `Subplots` | Subplot Folder, relative to the project folder. |
| plotGridCharactersDir | `string` | `Characters` | Character Folder, relative to the project folder. |

### Display Names and Extra note groups

`sceneDisplayName`, `plotsDisplayName`, and `charactersDisplayName` change
labels only. They do not change folder settings, note paths, frontmatter keys,
or data. A display name is omitted from the saved `longform` entry when it is
blank or equal to its default. Missing keys read as `Scenes`, `Subplots`, and
`Characters`.

`noteGroups` is also omitted when the list is empty, which is the default. Each
entry has this shape:

```yaml
longform:
  noteGroups:
    - name: Locations
      folder: World/Locations
      template: Templates/Location.md
      entries:
        - Harbor
        - - Docks
```

- `name` is required and is also the group's display label.
- `folder` is relative to the project folder. When it is missing or empty, the
  default folder is derived from the name with spaces replaced by underscores
  (`Magic System` → `Magic_System`). A folder value present in the file is used
  as stored; it is not rewritten.
- `template` is an optional vault-relative path to an existing template note used
  when creating notes in this group. When it is missing or empty, new notes are
  created empty and the key is omitted when the project is saved. This is
  independent of the built-in
  `plotTemplate` and `characterTemplate` settings.
- `entries` is the order/indent overlay for the sub-tab. It does not decide
  membership: every Markdown note under `folder`, including nested subfolders,
  is a member. The overlay is reconciled with the folder when the project loads
  or syncs.
- Duplicate or empty names are discarded when the file is read, and malformed
  entries are ignored. Configured order is preserved.

Removing a group from `noteGroups` is a configuration change only. It never
deletes the group's folder or notes. The
order/indent overlays for the built-in Scenes, Subplots, and Characters groups
remain in the separate `scenes`, `plots`, and `characters` arrays.

All configured group folders must be pairwise distinct and non-nested; see
[Folders and membership](./PLOTS_AND_CHARACTERS.md#folders-and-membership).
The subplot grid additionally requires its Scene, Subplot, and Character
Folders to satisfy the rule before it generates; see
[PLOT_GRID.md](./PLOT_GRID.md#folders). An older `plotGridLevel` value is no
longer used: the level is chosen in the generated view, and the legacy key is
removed when the project is saved.

## Scene Frontmatter

With **Write scene index to frontmatter** enabled (plugin settings →
Composition, off by default), every scene note gets `longform-order` and
`longform-number`; `longform-order` is also written when a scene is created.
Both keys are plugin-managed. **Show scene numbers in scenes tab** changes the
tree display only and writes no frontmatter.

## Other Frontmatter

You’re free to put any other frontmatter you’d like in the index file as long as that frontmatter is outside the `longform` entry. Longform Extended will leave it alone.
