# Compile

Longform Extended's Compile tab helps you turn a project into a final document. In the tab, you build **workflows** comprising **steps**. If a step should be included by default, please [suggest it as a GitHub issue](https://github.com/wandrade/longformExtended/issues).

## Steps

Steps are the basic building block of compilation. In Longform Extended, a step takes an input (either all your scenes or a combined manuscript) and returns an output (either transformed scenes or an altered manuscript).

There are three kinds of steps:

1. **Scene** steps, which act on every scene individually. For example, the **Prepend Title** step inserts a header with each scene's title at the top of that scene and passes all the scenes to the next step.
2. **Join** steps, which take a list of scenes and return a single manuscript. Join steps are essential to creating a single document.
3. **Manuscript** steps, which act on a single manuscript document and return that document.

Step order depends on project type. Multi-scene workflows run scene steps, then
at most one Join, then manuscript steps (a Join is optional). Single-scene
workflows allow Scene and Manuscript steps in any order and reject Join.

Many steps can be of multiple kinds. For example, the **Remove Links** step, which removes both external and internal links, can run as both a scene and manuscript step. Longform Extended figures out how it should be run automatically based on its position relative to other steps.

Steps may sometimes have _options_, which are text, multiline text, or checkbox fields that the step uses to customize its function.

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

#### Add Frontmatter

_Manuscript_

Prepends YAML frontmatter to the compiled manuscript. Options:

| Name        | Type           | Default | Description                 |
| ----------- | -------------- | ------- | --------------------------- |
| Frontmatter | Multiline text | (empty) | The frontmatter to prepend. |

#### Save as Note

_Manuscript_

Saves the manuscript as Markdown note in your vault. Options:

| Name                     | Type    | Default       | Description                       |
| ------------------------ | ------- | ------------- | --------------------------------- |
| Output path              | Text    | manuscript.md | Path for the compiled manuscript. |
| Open Compiled Manuscript | Boolean | true          | If checked, open the compiled manuscript in a new pane. |

Output paths may start with `/` for the vault root; otherwise they are relative
to the project. `./` and `../` are supported, and `.md` is added if you omit it.
`$1` is replaced with the project title.

### User-script steps removed

Longform Extended 1.0.0 removed user-script compile steps. The feature executed arbitrary user-provided `.js` files from the vault and was removed for security and linter compliance. Built-in compile steps and workflows are unchanged. A saved workflow that references a removed step must be updated to use a built-in step.

## Workflows

In Compile, steps are organized into workflows. Longform Extended ships with a default workflow that demonstrates Compile and produces a simple formatted manuscript. Feel free to customize or delete the default workflow.

You can create new workflows to suit each of your projects. Each workflow has a description box you may use to remind yourself what exactly the workflow does. A Longform Extended project remembers its last-used workflow and will select it first when you next open the Compile tab.

Workflows are vault-wide; if you change a workflow within a project, it will change for all projects that use that workflow.

You can drag steps within a workflow to rearrange them.

## Autocompile

Autocompile is a per-project setting in the **Autocompile** section of the
Project tab. Set a whole number of minutes to have Longform Extended compile the
project with its selected workflow on that interval, then regenerate the
timeline, kanban board, and subplot grid. Each generated file is rebuilt only
when that output's own enable setting is on. The first run happens after the
first interval has elapsed, not when the plugin or project starts. Leaving the
field empty or setting it to `0` turns the timer off.

A missing workflow, or one that fails validation, skips the compile step. The
status refresh still runs. Autocompile has no visible progress display.

## The Future

Compile remains a feature that will change over time. [Open issues](https://github.com/wandrade/longformExtended/issues?q=is%3Aissue+is%3Aopen+label%3Acompile) are a good way to track what's on the roadmap.
