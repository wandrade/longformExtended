# Getting Started

Longform Extended is an [Obsidian](https://obsidian.md) plugin for writing and
editing novels, screenplays, essays, and other long projects. It is a fork of
[Longform](https://github.com/kevboh/longform).

A Longform project is one or more notes organized around a `longform` frontmatter
entry in an [index file](./INDEX_FILE.md). Longform Extended finds projects by
scanning the vault for that entry, so you can create a project with the built-in
tools or author the frontmatter yourself.

Longform Extended keeps Longform's core workflow and adds configurable note
groups, a timeline, a kanban board, an editable subplot grid, and an Overview
block above the tabs.

## Inherited from Longform

- A dedicated pane that collects projects from across the vault.
- A reorderable, nestable [scene list](./MULTIPLE_SCENE_PROJECTS.md).
- Scene, draft, and project [word counts](./WORD_COUNTS.md#word-counts-for-projects-drafts-and-scenes).
- Daily [writing session goals](./WORD_COUNTS.md#writing-sessions-and-word-count-goals).
- A workflow-based [compile](./COMPILE.md) tool.
- [Single-scene projects](./SINGLE_SCENE_PROJECTS.md) for shorter works.
- Commands, modals, and menu items; see [Commands](./COMMANDS.md).

Longform itself is available in Obsidian's Community plugins directory, or
installs manually into `.obsidian/plugins/longform/`. Longform Extended installs
into `.obsidian/plugins/longform-extended/`. Do not enable both at the same time;
see [Both plugins enabled](./TROUBLESHOOTING.md#both-plugins-enabled).

## Added by Longform Extended

- Built-in **Subplots** and **Characters** groups plus any number of custom note
  groups; see [Subplots, Characters, and Extra note groups](./PLOTS_AND_CHARACTERS.md).
- Generated [Timeline](./TIMELINE.md), [Kanban](./KANBAN.md), and
  [Subplot Grid](./PLOT_GRID.md) files, configured in the Project tab.
- The [Overview block](./OVERVIEW.md) with a daily goal bar, a compile action,
  and the generated-file actions.

## Creating a Multi-scene Project (Novel)

Multi-scene projects are for works made of many notes: novels, screenplays,
collections, and so on.

1. In the file explorer, right-click the folder where the project should live and
   choose **Create longform extended project**.
2. In the **Create project** modal, choose **Multi**.
3. Enter a **Title**.
4. The modal shows the index file path it will create, typically
   `<folder>/<Title>/Index.md`. Click **Create**.

   ![The Create project modal for a multi-scene project](./res/walkthrough-create-multi.png)

5. The pane opens the new project on **Notes → Scenes**. A multi-scene project has
   **Notes**, **Project**, and **Compile** tabs, with an always-visible
   **Overview** block above them.
6. In **Notes → Scenes**, click **New Scene**, type a title, and press Enter. The
   scene note is created in the project's Scene Folder (default `Scenes`) and
   opens in the editor. Shift+Enter creates the note without opening it. With the
   timeline enabled, the note gets the configured timeframe property, empty
   unless a template already set it. With the kanban enabled, its `status` is
   set to the first kanban column, unless a template already set one.
7. The scene is added to the index file's `scenes` array:

   ```yaml
   scenes:
     - The Sun Rises on Dublin
   ```

8. Add structure by dragging scenes left or right, or with the **Indent scene**
   and **Unindent scene** commands; see
   [Multi-scene projects](./MULTIPLE_SCENE_PROJECTS.md#scene-indentation--nesting).
9. The added views are enabled by default. Timeline, kanban, and subplot grid
   outputs are written under `Build/` in the project folder; see the feature docs
   below.
10. When the manuscript is ready, compile it from the **Compile** tab; see
    [Compile](./COMPILE.md).

> [!WARNING]
> Avoid editing the `longform` frontmatter directly unless you know how it works.
> Longform Extended supports direct editing and tries to sync, but malformed
> metadata can cause desync. You can always revert the edit. It never deletes
> files based on index changes; see [The Index File](./INDEX_FILE.md).

## Creating a Single-scene Project (Short Story)

Single-scene projects are for works that live as one note: short stories, essays,
and similar pieces.

1. In the file explorer, right-click the enclosing folder and choose
   **Create longform extended project**.
2. In the **Create project** modal, choose **Single**.
3. Enter a **Title** and click **Create**.

   ![The Create project modal for a single-scene project](./res/walkthrough-create-single.png)

4. Longform Extended creates one note at `<folder>/<Title>.md` and opens it. The
   frontmatter at the top tells the plugin how to track the project; write the
   work in the note itself.
5. When ready, use the **Compile** tab to generate a manuscript. Single-scene
   projects can use scene and manuscript steps in any order; see
   [Compile](./COMPILE.md).

Single-scene projects have only **Project** and **Compile** tabs. Choosing
**Notes** redirects to **Project**. They do not show the **Overview** block. The
timeline, kanban, and subplot grid are multi-scene features and are not
generated for single-scene projects.

## Drafts and Projects

Longform Extended supports multiple drafts for a project. Under the hood, drafts
are separate Longform projects with the same `title`; the plugin groups them and
presents them as versions of the same project.

- **Create a draft:** use the new-draft (+) button in the **Project** tab. The
  **New Draft** modal asks for a draft name/version and, for multi-scene
  projects, offers **Copy Scenes** to copy every scene from the current draft
  into the new one. Only scenes are copied; subplot, character, and custom-group
  entries are not, and a single-scene draft is created as an empty note.
- **Create a draft from scratch:** create another project and set its `title` to
  the same value as the existing project.
- **Rename a draft:** right-click it in the **Project** tab and choose Rename, or
  set `draftTitle` in the index file's `longform` frontmatter.
- Each draft has its own index file, scenes, project settings, word counts, and
  last-used compile workflow.

`title` groups drafts, and `draftTitle` is the label shown in the pane. See
[The Index File](./INDEX_FILE.md) for both fields.

## What Longform Extended Is Not

Longform Extended is not a full writing suite. There are no new required
fields, no per-scene character or plot schema, and no overcomplicated
configuration. A custom note group is just a name, a folder, an optional template,
and an order overlay; folder membership decides which notes belong to it.

## Next Steps

- [Multiple-scene projects](./MULTIPLE_SCENE_PROJECTS.md)
- [Single-scene projects](./SINGLE_SCENE_PROJECTS.md)
- [The Index File](./INDEX_FILE.md)
- [Word counts and writing sessions](./WORD_COUNTS.md)
- [Compile](./COMPILE.md)
- [Timeline](./TIMELINE.md)
- [Kanban](./KANBAN.md)
- [Subplot Grid](./PLOT_GRID.md)
- [Subplots, Characters, and Extra note groups](./PLOTS_AND_CHARACTERS.md)
- [Overview block](./OVERVIEW.md)
- [Commands](./COMMANDS.md)
- [Troubleshooting](./TROUBLESHOOTING.md)
