# Compile

Longform Extended's Compile tab helps you turn a project into a final document. In the tab, you build **workflows** comprising **steps**. Hopefully the built-in steps are sufficient for most use cases. If not, and you'd like to suggest a new step that you think should be included by default, please [suggest it as a GitHub issue](https://github.com/wandrade/longformExtended/issues).

## Steps

Steps are the basic building block of compilation. In Longform Extended, a step takes an input (either all your scenes or a combined manuscript) and returns an output (either transformed scenes or an altered manuscript).

There are three kinds of steps:

1. **Scene** steps, which act on every scene individually. A scene step will take a list of scenes as input and return that list as output. For example, the **Prepend Title** step, given a list of scenes, will insert a header with that scene's title at the top of each scene. It will then pass all the scenes to the next step.
2. **Join** steps, which take a list of scenes and return a single manuscript. Join steps are essential to creating a single document.
3. **Manuscript** steps, which act on a single manuscript document and return that document.

Steps must always be in the above order during compilation. Any number of scene steps, then one join step, then any number of manuscript steps.

Many steps can be of multiple kinds. For example, the **Remove Links** step, which removes both external and internal links, can run as both a scene and manuscript step. Longform Extended figures out how it should be run automatically based on its position relative to other steps.

Steps may sometimes have _options_, which are text or checkbox fields that the step uses to customize its function. A number of the steps built into Longform Extended have options.

### Built-in Steps

Longform Extended comes with a lot of steps for you to add to compilation.

#### Prepend Title

_Scene_

Prepends each scene's title (its note name) before its content. Options:

| Name         | Type | Default | Description                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------ | ---- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title Format | Text | $1      | A format string that lets you customize how the title is inserted. A `$1` in the string will be replaced with the scene title. A `$2`, if present, will be replaced with the scene’s number (first scene is “1,“ it’s child is “1.1,” etc.). Wrapping text in $3{} will repeat that text a number of times equal to the scene’s indentation level plus one—e.g., $3{#} for unindented scenes becomes “#”. |
| Separator    | Text | \n\n    | Some text to insert between the formatted title and the rest of the scene.                                                                                                                                                                                                                                                                                                                                |

#### Remove Comments

_Scene, Manuscript_

Removes markdown and/or HTML comments. Options:

| Name                     | Type    | Default | Description                                         |
| ------------------------ | ------- | ------- | --------------------------------------------------- |
| Remove Markdown Comments | Boolean | true    | If checked, will remove markdown comments (`%%`).   |
| Remove HTML Comments     | Boolean | true    | If checked, will remove HTML comments (`<!-- -->`). |

#### Remove Links

_Scene, Manuscript_

Removes internal and/or external links. Options:

| Name                  | Type    | Default | Description                                       |
| --------------------- | ------- | ------- | ------------------------------------------------- |
| Remove Wikilinks      | Boolean | true    | If checked, will remove internal links (`[[ ]]`). |
| Remove External Links | Boolean | true    | If checked, will remove external links (`[ ]()`). |

#### Remove Strikethroughs

_Scene, Manuscript_

Removes any ~~struck through~~ text (`~~ ~~`).

#### Strip Frontmatter

_Scene, Manuscript._

Removes any [YAML frontmatter](https://help.obsidian.md/Advanced+topics/YAML+front+matter) from the beginning of a scene or manuscript.

#### Concatenate Text

_Join_

Joins scenes into a manuscript by concatenating them together with some optional text between. Options:

| Name      | Type | Default | Description                            |
| --------- | ---- | ------- | -------------------------------------- |
| Separator | Text | \n\n    | Text to put between the joined scenes. |

#### Write to Note

_Manuscript_

Saves the manuscript as Markdown note in your vault. Options:

| Name                     | Type    | Default       | Description                                                                                                                          |
| ------------------------ | ------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Output Path              | Text    | manuscript.md | Path relative to your project at which to save your compiled manuscript. $1, if present, will be replaced with your project’s title. |
| Open Compiled Manuscript | Boolean | true          | If checked, open the compiled manuscript in a new pane.                                                                              |

### User-script steps removed

Longform Extended 1.0.0 removed user-script compile steps. The feature executed arbitrary user-provided `.js` files from the vault and was removed for security and linter compliance. The same `window.eval` loader shipped in Longform 2.1.0 (2025-03-19). ESLint's `no-eval` rule has existed since ESLint v0.0.2; what changed is Obsidian's review enforcement. Obsidian's automated community review launched in May 2026, granting existing releases a temporary exception while scanning new and updated releases and delisting versions that fail. The current preflight toolchain (`obsidian-plugin-validator` 1.0.6 / `eslint-plugin-obsidianmd` 0.4.2, running ESLint 10.13.0) treats `no-eval` as a non-disableable error. Longform's latest release predates that automated review and has not been subjected to it, so the feature was not newly allowed by ESLint.

## Workflows

In Compile, steps are organized into workflows. Longform Extended ships with a default workflow that demonstrates Compile and produces a simple formatted manuscript. Feel free to customize or delete the default workflow.

You can create new workflows to suit each of your projects. Each workflow has a description box you may use to remind yourself what exactly the workflow does. A Longform Extended project remembers its last-used workflow and will select it first when you next open the Compile tab.

Workflows are vault-wide; if you change a workflow within a project, it will change for all projects that use that workflow.

You can drag steps within a workflow to rearrange them.

## The Future

Compile remains a feature that will change over time. [Open issues](https://github.com/wandrade/longformExtended/issues?q=is%3Aissue+is%3Aopen+label%3Acompile) are a good way to track what's on the roadmap. If you think a step should be added or changed, or that compile should behave differently, please open an issue in GitHub.
