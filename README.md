# Longform Extended

Longform Extended is an [Obsidian](https://obsidian.md) plugin for writing and organizing novels, essays, screenplays, and other long projects. It is a fork of [Longform](https://github.com/kevboh/longform): everything Longform does — scenes, drafts, word counts, writing sessions, and compile workflows — is still here, with configurable note groups and a small set of views and stats around the project.

> [!NOTE]
> **Compatibility:** Longform Extended uses Longform's `longform` frontmatter and project layout, so existing Longform projects keep working without changes.

**For security reasons**, external JavaScript is not supported in the Compile tab.

**Requires Obsidian 1.14 or newer.** The kanban board uses Obsidian's native Bases Kanban view, and the subplot grid uses a plugin-provided Bases view; enable the **Bases** core plugin.

## Features

| Feature | What it does | Docs |
| --- | --- | --- |
| Scenes and drafts | An ordered, nestable scene list with multiple drafts. | [Multiple-scene projects](./docs/MULTIPLE_SCENE_PROJECTS.md) |
| Single-scene projects | Short works that live as one note and reuse the same compile workflow. | [Single-scene projects](./docs/SINGLE_SCENE_PROJECTS.md) |
| Word counts and sessions | Project, draft, and scene counts, plus daily writing goals. | [Word counts and sessions](./docs/WORD_COUNTS.md) |
| Subplots, characters, and custom groups | Built-in Subplots and Characters groups plus any number of custom folders, each with its own tree. | [Subplots, characters, and note groups](./docs/PLOTS_AND_CHARACTERS.md) |
| Compile | Workflow-based steps that turn a project into a manuscript. | [Compile](./docs/COMPILE.md) |
| Autocompile | Recompiles a project and regenerates its status files on a per-project interval. | [Compile](./docs/COMPILE.md#autocompile) |
| Timeline | Chronological scene view driven by a `timeframe` property, with per-level subplot tables. | [Timeline](./docs/TIMELINE.md) |
| Kanban | Status-driven board; dragging a card writes its status back to the note. | [Kanban](./docs/KANBAN.md) |
| Subplot grid | Editable grid of subplots and characters across the scene hierarchy. | [Subplot grid](./docs/PLOT_GRID.md) |
| Overview block | Daily writing-goal bar plus compile, refresh, and open actions, always visible above the tabs. | [Overview](./docs/OVERVIEW.md) |
| Generated files | Where the timeline, kanban, and subplot grid are written. | [Generated files](./docs/GENERATED_FILES.md) |

The additions are deliberately lightweight: no required fields, no per-scene character or plot schema, and no separate story database. Each auxiliary group — Subplots, Characters, and custom groups — is just a name, a folder, an optional template, and an order overlay; folder membership decides which notes belong to it.

## Installation

### From the Community plugins directory

Once Longform Extended is listed, install it from **Settings → Community plugins → Browse**, search for **Longform Extended**, then install and enable it.

### Manually

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/wandrade/longformExtended/releases).
2. Create the folder `.obsidian/plugins/longform-extended/` in your vault.
3. Copy the three files into that folder.
4. Reload Obsidian, then enable **Longform Extended** in **Settings → Community plugins**.

The plugin folder is `longform-extended`, not upstream Longform's `longform/`.

> [!WARNING]
> **Do not enable Longform and Longform Extended at the same time.** Both discover and track the same `longform` projects through their own panes and commands, so enabling both duplicates the UI and can make them compete over the same projects. Disable upstream Longform before enabling Longform Extended.

### From source

```bash
npm install
npm run build
```

`npm run build` writes the release files to the repository root. Copy `main.js`, `manifest.json`, and `styles.css` into the plugin folder as above.

## Getting started

1. **Create a project.** Right-click a folder and choose **Create longform extended project**. Pick **Multi** for a novel or screenplay, or **Single** for a shorter work.
2. **Add scenes.** In the pane's **Notes → Scenes** tab, type a title in **New Scene** and press Enter.
3. **Add subplots and characters.** Use **Notes → Subplots** and **Notes → Characters**. Membership is folder-based; no `type` flag is needed.
4. **Check the Project tab.** Timeline, kanban, and subplot grid are enabled by default. Their outputs go to `Build/` inside the project folder; the Scene, Subplot, and Character Folders are under **Project Metadata**.
5. **Use the Overview block.** The refresh action regenerates every enabled generated file. The compile action runs the current workflow, and the open actions open the configured outputs.

New to Longform or Longform Extended? [Getting Started](./docs/GETTING_STARTED.md) covers creating multi-scene and single-scene projects, drafts, and the inherited workflow. [Longform's own guide](https://github.com/kevboh/longform#getting-started) is the upstream reference.

## Compatibility and migration

- Existing Longform and Longform Extended projects need no migration for note groups or the added views.
- A project with no note-group configuration has the three built-in groups and the default folders. The timeline, kanban, and subplot grid are enabled by default.
- Projects migrated from Longform 1.x get the added features at their defaults. See [Migrating from version 1 to 2](./docs/MIGRATING_FROM_VERSION_1_TO_2.md).
- A migrated project may keep a project-root scene folder (`/`). Because that folder contains the Subplot and Character Folders, the subplot grid will not generate until you choose a distinct, non-nested Scene Folder.
- Every note-group folder must be distinct and non-nested; see [Folders and membership](./docs/PLOTS_AND_CHARACTERS.md#folders-and-membership).

If a project looks out of sync after a frontmatter or folder change, see [Troubleshooting](./docs/TROUBLESHOOTING.md).

## Removed: user-script compile steps

User-script compile steps were removed in 1.0.0 for security and linter compliance. See [Compile](./docs/COMPILE.md#user-script-steps-removed).

## Documentation

| Topic | Document |
| --- | --- |
| Getting started, project creation, and drafts | [GETTING_STARTED.md](./docs/GETTING_STARTED.md) |
| Multiple-scene projects | [MULTIPLE_SCENE_PROJECTS.md](./docs/MULTIPLE_SCENE_PROJECTS.md) |
| Single-scene projects | [SINGLE_SCENE_PROJECTS.md](./docs/SINGLE_SCENE_PROJECTS.md) |
| Index files and frontmatter | [INDEX_FILE.md](./docs/INDEX_FILE.md) |
| Word counts and writing sessions | [WORD_COUNTS.md](./docs/WORD_COUNTS.md) |
| Compile | [COMPILE.md](./docs/COMPILE.md) |
| Timeline | [TIMELINE.md](./docs/TIMELINE.md) |
| Kanban | [KANBAN.md](./docs/KANBAN.md) |
| Subplot grid | [PLOT_GRID.md](./docs/PLOT_GRID.md) |
| Generated files and output paths | [GENERATED_FILES.md](./docs/GENERATED_FILES.md) |
| Subplots, characters, and note groups | [PLOTS_AND_CHARACTERS.md](./docs/PLOTS_AND_CHARACTERS.md) |
| Overview block | [OVERVIEW.md](./docs/OVERVIEW.md) |
| Scene-only styling | [SCENE_ONLY_STYLING.md](./docs/SCENE_ONLY_STYLING.md) |
| Commands | [COMMANDS.md](./docs/COMMANDS.md) |
| Troubleshooting | [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) |
| Migrating from Longform 1.x | [MIGRATING_FROM_VERSION_1_TO_2.md](./docs/MIGRATING_FROM_VERSION_1_TO_2.md) |
| Upstream Longform repository | [Longform](https://github.com/kevboh/longform) |

## Examples

The repository includes four source-only sample projects in [`examples/`](./examples/README.md): a short story, a long story, an essay, and a screenplay. The essay uses Arguments and References in place of plots and characters.

## Development

```bash
npm install
npm run dev        # watch build
npm run lint       # type check and lint
npm run test:unit  # unit tests
npm run build      # production build
```

Bug reports, feature requests, and pull requests are welcome in the [issue tracker](https://github.com/wandrade/longformExtended/issues).

## Support

Sponsorship is deeply appreciated: [github.com/sponsors/wandrade](https://github.com/sponsors/wandrade).

## License and attribution

Longform Extended is dual-licensed.

- The original [Longform](https://github.com/kevboh/longform) code remains under its original license, the Fuck Around and Find Out License. See [LICENSE.md](./LICENSE.md).
- All additions and changes in this fork are under a separate license that allows private use and modification but requires consent for redistribution. See [LICENSE-ADDITIONS.md](./LICENSE-ADDITIONS.md).

Longform is created by Kevin Barrett. Longform Extended is maintained by Werner Thomassen Andrade.

The fork was [explicitly approved by the original author](https://github.com/kevboh/longform/issues/349).
