# Longform Extended examples

Each folder in this directory is a complete, source-only Longform Extended
project. To try one, copy its folder into an Obsidian vault and open the project
note at the folder root (for example, `short-story/The Last Bus.md`). The folders
contain no generated output, so the only setup needed is enabling Longform
Extended and the Bases core plugin.

No project note pins a compile workflow. When you open Compile, the plugin
selects the first available workflow — on a fresh install, the shipped
`Default Workflow` — and remembers that choice for the project.

## The projects

| Folder | Project | Scene/section notes | Grid notes (columns) | Total Markdown files |
| --- | --- | --- | --- | --- |
| `short-story/` | The Last Bus | 5 notes: 2 acts and 3 scenes | 2 plots and 2 characters | 10 |
| `long-story/` | The Salt Road | 7 notes: 3 parts and 4 scenes | 2 plots and 3 characters | 13 |
| `essay/` | The Quiet Cost of Convenience | 5 notes: 2 parts and 3 sections | 2 arguments and 2 references | 10 |
| `screenplay/` | The Last Take | 6 notes: 2 acts and 4 scenes | 2 plots and 2 characters | 11 |

The total includes the project note at the root of each folder. Scene and
section bodies are roughly twenty words; character, plot, argument, and
reference notes have a short description and a one- or two-sentence body.

Every project stays within a limit of seven scene/section notes, including
structural act, part, and group notes. Each structural group has its own note
because Longform filters out hierarchy entries that have no matching file.

## Structure and settings

All four projects use `format: scenes`, `timeFormat: datetime`, and
`kanbanColumns: todo doing done`, except the essay, which uses
`timeFormat: number`. Scene and row notes carry `status`. Structural group notes
have no status.

The essay demonstrates the display-name settings without renaming the grid
folders. Its scene folder is `Sections`, while `plotGridPlotsDir` is `Subplots`
and `plotGridCharactersDir` is `Characters`. The `sceneDisplayName`,
`plotsDisplayName`, and `charactersDisplayName` settings relabel those groups as
`Sections`, `Arguments`, and `References`, so the Notes tabs and reports use
those words even though the notes live in the conventional folders. The project
frontmatter still uses the standard `plots` and `characters` entries to list the
arguments and references. Its grid cells hold claims, evidence, and source-use
notes instead of story beats.

Every row note in every project has a `plotgrid_*` property for each hierarchy
column at every level. Group-level cells describe the row's arc for that act or
part; scene-level cells describe the concrete beat or presence. The keys follow
the plugin's slug rule, such as `plotgrid_the_tide_cave` and
`plotgrid_part_one_the_coast`.

## Generated output

The projects configure Longform Extended to generate
`Build/$1_plotgrid.base`, `Build/$1_timeline.md`, and `Build/$1_kanban.base`.
Those files are created when the project is built or the corresponding action is
run. They are not included here, and the `Build/` folder is absent
from every example.
