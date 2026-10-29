# Word Counts & Writing Sessions

Longform Extended includes a set of tools to help you count the number of words in your projects and to track your writing sessions as you work toward some number of written words.

## Word Counts for Projects, Drafts, and Scenes

Word counts are tracked per project, draft, and scene. Check word counts in the **Project** tab, or turn on **Show word counts in status bar** to show the focused project's count in the status bar. For performance reasons, word counts are updated on a delay.

The status bar count shows scene (if a multi-scene project) and draft word counts for the given focused pane. Clicking it shows the Project tab of the corresponding project. If the scene and draft have the same number of words, the scene count is omitted to save space; the draft count is shown, or the project count when those also match.

## Writing Sessions and Word Count Goals

Longform Extended also supports writing sessions. A session is a span of time in which you write against a word count goal. It notifies you when you’ve hit your goal.

The relevant settings and their defaults are:

| Setting | Default | What it does |
| --- | --- | --- |
| **Show word counts in status bar** | On | Shows the focused project’s count in Obsidian’s status bar. |
| **Start new writing sessions each day** | On | Starts a new session automatically each day; turn it off to carry one session across days. |
| **Session word count goal** | `500` | The target number of words. |
| **Goal applies to** | Words written across all projects | Counts words across all projects, per project, or per scene/single-scene note. |
| **Notify on goal reached** | On | Shows a notice when a goal is met. |
| **Count deletions against goal** | Off | Treats deleted words as negative progress. |
| **Sessions to keep** | `30` | How many past sessions are stored. |

## The Daily Goal Bar

The **Overview** block at the top of a multi-scene project shows a **Daily
goal** bar above the action buttons. It shows words written against the goal,
fills in as you write, and its label turns green and bold when the goal is
met.

The bar uses the latest writing session and the **Goal applies to** setting:

- **Words written across all projects** — all words in the current session.
- **Each project individually** — words in the selected draft’s session; drafts that share a project title are counted separately.
- **Each scene or single-scene project** — words in the active scene, or in the
  single-scene project when one is selected.

The bar is hidden when the goal is `0` or less, and when the selected scope has
no measurable target (for example, the per-scene scope with no active scene).
Single-scene projects do not show the **Overview** block, so the bar is not
shown for them. See [Overview](./OVERVIEW.md).
The same progress is reflected in the **Project** tab’s word-count section and
in goal notifications; see [Commands](./COMMANDS.md) for **Start new writing
session**.

## Session Storage

By default, session data is stored in the plugin's `data.json`, alongside the
other Longform Extended settings. **Store session data** can instead write a
dedicated `sessions.json` in the `longform-extended/` plugin folder, or a `.json`
file at **Session storage file** in your vault (default `longform-sessions.json`).
A separate file can help with selective sync or Git.

Only `data.json` is read when the plugin loads. The plugin-folder and vault-file
modes write session data but do not read it back, so session history is not
restored after a restart. Use the default **With longform extended settings**
option if you need sessions to persist across restarts.
