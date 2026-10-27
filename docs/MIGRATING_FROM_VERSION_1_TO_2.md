# Migrating from Longform 1.x to 2.0

Longform 2.0 changed the format and location of [index files](./INDEX_FILE.md)
and the data saved in plugin storage. Longform Extended inherits that migration.
The first time you upgrade, the pane prompts you to migrate your projects.

## Automated Migration (Recommended)

Migration does the following:

- For each project you have marked as a Longform project in 1.0 at `path/to/project-name/Index.md`:
  - Read the metadata from the old index file and append a deprecation notice to
    it. The old index file is left in place; delete it yourself once you have
    checked the migrated project.
  - Check whether it has one draft or more than one draft. If it has one draft:
    - Create a new index file for that draft at `path/to/project-name/project-name.md`
    - Move the draft’s scenes to `path/to/project-name/`
  - If it has more than one draft, for each draft:
    - Create a new index file for that draft at `path/to/project-name/draft-name/draft-name.md`
    - Set the draft’s `title` to be `project-name`
    - Move the draft’s scenes to `path/to/project-name/draft-name/`

The result is a series of Longform 2.0 projects in roughly the same place as
your 1.0 projects, with slightly less folder hierarchy in places. Migrated
projects are ordinary multi-scene projects, so they get the added tabs and
commands with these defaults:

- **Notes → Scenes**, with **Subplots** and **Characters** sub-tabs.
- Timeline, kanban, and subplot grid enabled.
- Timeline output `Build/$1_timeline.md`, kanban output
  `Build/$1_kanban.base`, and subplot grid output `Build/$1_plotgrid.base`.
- Subplot Folder `Subplots` and Character Folder `Characters`.
- Display names **Scenes**, **Subplots**, and **Characters**.
- No extra note groups; the extra-group list is empty.
- No project-specific scene, subplot, or character template; the global
  templates still apply when set.

Migration does not delete the old index files. They are left in place with a
deprecation notice and are no longer used by the migrated project. Their
metadata is not valid after migrating, and you can delete them when you are
satisfied with the result.

### Display names and extra note groups

The per-project display names and extra note groups are optional settings.
An existing or migrated project that does not define them reads the default
display names **Scenes**, **Subplots**, and **Characters**, and an empty extra
note-group list. There is no migration step, destructive action, or folder
change for these features. Adding or removing an extra group is
configuration-only and never deletes its folder or notes. See
[PLOTS_AND_CHARACTERS.md](./PLOTS_AND_CHARACTERS.md#extra-note-groups).

### Migrated projects and the scene folder

A migrated project keeps a project-root scene folder (`/`), which resolves to
the project folder itself. Because the default Subplot and Character Folders
sit inside that folder, the three folders are nested, and subplot grid
generation is blocked until you choose a distinct, non-nested Scene Folder.
See [PLOT_GRID.md](./PLOT_GRID.md#folders). This does not by itself block the
core Longform scene tree, timeline, or kanban generation.

## Migrating Manually

It is technically possible to migrate your projects manually, if you prefer.
This is not recommended, but for completeness, here is how:

1. For each draft in each project you'd like to migrate, create a note to serve as that draft’s index file and use the insert frontmatter commands to insert the relevant frontmatter.
2. If the draft has scenes, list them in the `scenes` entry, and set the `sceneFolder` entry to be the relative path to those scenes.
3. If the draft is part of a multiple-draft project, set the `title` entry to be the name of your project.
4. Finally, after you've created all your notes and have your files arranged as desired, you need to manually edit the saved data in the `.obsidian/plugins/longform-extended/` folder of your vault.
   - Close Obsidian and open `.obsidian/plugins/longform-extended/data.json` in a text editor.
   - Set the `projects` JSON attribute to be `{}` so that it looks like this: `"projects": {},`
   - Set the `version` JSON attribute to be `3` so that it looks like this: `"version": 3,`
   - Save the file and exit the text editor.
   - Open Obsidian.
5. At this point Longform Extended will count your projects as having been migrated. Check each to make sure it looks correct; if not, you likely have a file in the wrong place.
6. When you’re satisfied with your project, you can delete the old, now-unused index files.
