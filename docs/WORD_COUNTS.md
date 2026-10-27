# Word Counts & Writing Sessions

Longform Extended includes a set of tools to help you count the number of words in your projects and to track your writing sessions as you work toward some number of written words.

## Word Counts for Projects, Drafts, and Scenes

Word counts are tracked per project, draft, and scene. You can always check your word counts in the **Project** tab, and if you turn on the **Show word counts in status bar** setting the word count for the currently-focused project, if applicable, will be shown in the status bar. For performance reasons, word counts are updated on a delay.

The status bar count will show scene (if a multi-scene project) and draft word counts for the given focused pane. Clicking it will show the Project tab of the corresponding project. If the scene and draft have the same number of words, the scene count is omitted to save space; the draft count is shown, or the project count when those also match.

## Writing Sessions and Word Count Goals

Longform Extended also includes support for writing sessions. Sessions are some length of time in which you are writing against a word count goal. Longform Extended will notify you when you’ve hit your goal. This behavior is customizable via a number of settings.

The relevant settings and their defaults are:

| Setting | Default | What it does |
| --- | --- | --- |
| **Show word counts in status bar** | On | Shows the focused project’s count in Obsidian’s status bar. |
| **Start new writing sessions each day** | On | Starts a new session automatically each day; turn it off to carry one session across days. |
| **Session word count goal** | `500` | The target number of words. |
| **Goal applies to** | All projects | Counts words across all projects, per project, or per scene/single-scene note. |
| **Notify on goal reached** | On | Shows a notice when a goal is met. |
| **Count deletions against goal** | Off | Treats deleted words as negative progress. |
| **Sessions to keep** | `30` | How many past sessions are stored. |

## The Daily Goal Bar

The **Status** tab of a multi-scene project shows a **Daily goal** bar above the
status actions. It reads `words written / goal words`, fills in as you write,
and its label turns green and bold when the goal is met.

The bar uses the latest writing session and the **Goal applies to** setting:

- **All projects** — all words in the current session.
- **Each project individually** — words in the selected project’s session.
- **Each scene or single-scene project** — words in the active scene, or in the
  single-scene project when one is selected.

The bar is hidden when the goal is `0` or less, and when the selected scope has
no measurable target (for example, the per-scene scope with no active scene).
Single-scene projects have no **Status** tab, so the bar is not shown for them.
The same progress is reflected in the **Project** tab’s word-count section and
in goal notifications; see [Commands](./COMMANDS.md) for **Start new writing
session**.

## Session Storage

By default, the data comprising your sessions is stored in the same file as other plugin settings. The **Store session data** setting can instead write a dedicated `sessions.json` in the `longform-extended/` plugin folder, or a `.json` file at **Session storage file** in your vault. The vault default is `longform-sessions.json`. You might want a separate file if you’d like to keep your session data per-device via `.gitignore`, for example.
