# Commands in Longform Extended

Longform Extended adds the following commands to the command palette. The
palette only offers a command whose conditions are met, so commands that need a
selected project, an active editor, or an enabled feature stay hidden
otherwise.

| Name | Available when | Description |
| --- | --- | --- |
| Compile current project with current workflow | A project and workflow are selected | Compiles the selected project with its current workflow. |
| Compile project… | At least one project exists | Choose a project, draft, and workflow, then compile. |
| Open current note’s project | The active note is a project index or one of its scenes | Selects that project as the current project. |
| Previous scene | Editing a scene | Opens the previous scene in the project. |
| Previous scene at indent level | Editing a scene | Opens the previous scene at the same indentation level. |
| Next scene | Editing a scene | Opens the next scene in the project. |
| Next scene at indent level | Editing a scene | Opens the next scene at the same indentation level. |
| Indent scene | Editing a scene, subplot, or character note | Increases the note’s indentation by one in the project tree. |
| Unindent scene | Editing a scene, subplot, or character note that is indented | Decreases the note’s indentation by one. |
| Jump to project | Always | Fuzzy-matches project titles and selects one in the pane. |
| Jump to scene in current project | A multi-scene project with at least one scene is selected | Fuzzy-matches the project’s scenes, with their indentation, and opens one. |
| Open Longform Extended pane | Always | Reveals the Longform Extended pane in the sidebar. |
| Reveal current project in navigation | A project is selected | Reveals the project folder in Obsidian’s file explorer. |
| Focus new scene field | A multi-scene project is selected | Opens **Notes → Scenes** and focuses the **New Scene** field. |
| Insert multi-scene frontmatter | Editing a note that is not already part of a project | Turns the note into a multi-scene project index and selects it. |
| Insert single-scene frontmatter | Editing a note that is not already part of a project | Turns the note into a single-scene project index and selects it. |
| Start new writing session | Always | Starts a new writing session immediately. |
| Rebuild timeline | A multi-scene project with the timeline enabled is selected | Regenerates the timeline note and reports the result. |
| Rebuild kanban | A multi-scene project with the kanban enabled is selected | Regenerates the kanban board and its word counts, and reports the result. |
| Rebuild subplot grid | A multi-scene project with the subplot grid enabled is selected | Regenerates the Base and the `plotgrid_*` keys, and reports the result. |

**Indent scene** and **Unindent scene** work on the subplot and character trees
as well as the scene tree. The scene navigation commands only move through the
project’s scene list; they do not move through the subplot or character
sub-tabs.
