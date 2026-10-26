# Timeline

The Timeline is a note that lays your scenes out along a time axis, so you can
see the order of your story at a glance. Each scene is placed at the point
described by a timeframe value in its frontmatter. Only multi-scene projects
get a timeline; single-note projects do not.

The generated note contains two views of the same data:

- a Mermaid `timeline` diagram, grouped by the project's primary and secondary
  time units;
- a table listing each scene's value and a link to the scene note.

A scene that is followed by a more-indented scene is treated as a structural
container (a part or act), not a timeline event, and is skipped.

## Configuration

The Timeline section of the Project tab controls the feature:

| Setting | Default | What it does |
| --- | --- | --- |
| **Enable timeline** | On | Turns generation on or off. |
| **Timeframe Tag Name** | `timeframe` | The frontmatter property read from each scene. |
| **Time Format** | Date time (dd/mm/yyyy hh:mm:ss) | How timeframe values are written. |
| **Timeline Output Path** | `Build/$1_timeline.md` | Where the note is written. |

Turning **Enable timeline** off stops future rebuilds and removes the
**Rebuild timeline** command for that project, but it does not delete an
existing timeline note.

## The Timeframe Property

The timeframe value lives in a frontmatter property that defaults to
`timeframe`:

```yaml
---
timeframe: "04/03/2026 09:30"
---
```

Quote date and time values; this keeps Obsidian's YAML parser from coercing
them. The `Chronological order (num)` format also accepts an unquoted number:

```yaml
---
timeframe: 3
---
```

The tag name must be the same for every scene in the project. You can rename
the property per project in the Timeline section of the Project tab; an empty
name is ignored. Scenes that do not have the property, or whose value is blank
or `null`, are left off the timeline.

## Time Formats

Each project picks a time format that describes how its timeframe values are
written. Choose the format whose biggest unit matches your story's span.

| Format | Example | Use When |
| --- | --- | --- |
| Epoch date time (num dd/mm/yyyy hh:mm:ss) | `2 04/03/2026 09:30:00` | The story spans ages, with a day-first date. |
| Epoch date time (num mm/dd/yyyy hh:mm:ss) | `2 03/04/2026 09:30:00` | The story spans ages, with a month-first date. |
| Date time (dd/mm/yyyy hh:mm:ss) | `04/03/2026 09:30:00` | The story spans years or days. |
| Time only (hh:mm:ss) | `09:30:00` | The story stays within a single day. |
| Chronological order (num) | `1`, `2`, `3` | Scenes are just ordered, with no real time. |

The order is fixed for each format. Dates are written with slashes; times are
written with colons. The day, month, hour, minute, and second accept one or two
digits; the year must have four. Units are separated by one or more spaces or
tabs. Leading zeros are accepted and normalized in the output.

## Partial Values

You do not have to fill in every unit. You can drop units from right to left,
from the smallest up, and the parser accepts the longest form it can match.

For a **Date time** project (minimum three units):

- `04/03/2026 09:30:15` — all six units.
- `04/03/2026 09:30` — seconds omitted.
- `04/03/2026 09` — seconds and minutes omitted.
- `04/03/2026` — the whole time omitted.

The other formats have the same rule with their own minimum:

- **Time only** — `09:30:15` or `09:30`. At least hour and minute.
- **Epoch date time** — `2 04/03/2026 09:30:15` down to `2 04/03/2026`. The
  epoch and the full date are required.
- **Chronological order** — a single number; nothing can be dropped.

You cannot drop units from left to right, so you cannot drop the epoch or the
date and keep the time. Every scene must use the same number of units. If they
differ, the most common count becomes the project's reference count and the
other scenes are reported as inconsistent. When counts tie, the count of the
first scene in project order wins.

A defined zero is a value, not an omission: `04/03/2026 00:30` keeps the zero
hour.

## The Diagram and Table

Scenes are sorted chronologically by the parsed values, largest unit first. A
scene set in an earlier period (a flashback) therefore sorts to the top. Scenes
with identical values keep their project order.

The diagram's grouping is derived from how the values move through the story:

- The **primary** unit is the coarsest unit that changes between scenes. Its
  value labels each Mermaid `section`.
- The **cadence** is the coarsest unit that changes on at least half of the
  steps between consecutive scenes.
- The **secondary** unit is one level coarser than the cadence. Its values
  group the events inside a section.

For example, if the year changes between scenes and the story advances hour by
hour within a single day, the primary is the year and the secondary is the day.
Each section is a year, each period is a month and day, and each event shows
the time on its first line (`09:30`, or `09:30:15` when seconds exist) and the
scene title on its second line.

Mermaid centers event text; it does not expose per-line alignment. Month values
are written by name (`Mar`, `Dec`) in the diagram and table; other units are
numeric. Dates use dashes and times use colons. For the
**Chronological order (num)** format, the diagram is a single `Timeline`
section with one numbered entry per scene.

## Problems

Invalid or inconsistent values are collected into a `## Problems` section. If
there is at least one problem, the note contains only the problems list: the
diagram and table are omitted until the values are fixed.

A value can fail in these ways:

- **Wrong format** — it does not match the configured format, for example a
  time-only value in a Date time project, a two-digit year, or a value that
  drops a unit from the left.
- **Out of range** — month must be `1`–`12`, day `1`–`31`, hour `0`–`23`, and
  minute and second `0`–`59`.
- **Inconsistent** — it uses a different number of units than the rest of the
  project.
- **Empty/unreadable** — a value that is neither a string nor a number, such as
  `false` or an object, is reported as an empty timeframe. Blank and `null`
  values are treated as missing, not as problems.

There is no calendar validation: `31/02/2026` is accepted because the day is in
range. Years and epoch numbers have no range limit.

Scenes with no timeframe value are different: they are not problems and are not
listed in the Problems section. They are silently left out of the timeline. If
no scene has a value and there are no problems, no timeline is written, and an
existing timeline file is left untouched.

## Output

The timeline is written to the path set in the Timeline section of the Project
tab (**Timeline Output Path**). The default is `Build/$1_timeline.md`, where
`$1` is replaced with the project title, so a project named *The Clearing*
produces `Build/The Clearing_timeline.md`.

Relative paths are resolved against the project folder; start the path with `/`
to resolve it from the vault root instead. If the path does not end in `.md`,
that extension is added. An empty setting falls back to the default, and any
missing folders are created. The note is a build artifact: it is regenerated
from scene data, so edits made inside it are overwritten on the next rebuild.

If you change the output path, the existing note is not moved or deleted. A
new note is written at the new path on the next rebuild (changing the path
itself triggers one); remove the old one yourself if you no longer want it.

## Updating and Rebuilding

The timeline refreshes automatically when the plugin loads and when files in
the project change. It also rebuilds when project settings that affect it
change, such as the time format, timeframe tag name, or output path. The plugin
ignores its own generated notes when watching for changes, including notes
written to a custom output path, so writing the timeline does not trigger
another rebuild.

To force a rebuild, select the project and run **Rebuild timeline** from the
command palette. The command is only available for a multi-scene project with
the timeline enabled. It reports `Timeline rebuilt.` even when there was nothing
to write.

## Troubleshooting

- **No timeline file.** Check that the timeline is enabled, that the project is
  a scenes project, and that at least one scene has a valid timeframe value. If
  every scene is missing a value, no file is written. Check the configured
  output path as well.
- **A scene is missing from the timeline.** Its timeframe property may be
  missing, blank, or `null`, or its scene file may not exist. A scene followed
  by a more-indented scene is a container and is skipped by design.
- **The note contains only Problems.** At least one scene has an invalid or
  inconsistent value; the whole diagram is withheld until every listed problem
  is fixed. Scenes with missing values are not listed, so they can be absent
  without a problem entry.
- **Scenes are in an unexpected order.** Confirm the project's **Time Format**
  matches how the values are written. For the epoch formats, the epoch number
  sorts before the calendar date.
- **An old timeline remains after changing the output path.** Changing the
  path generates a note at the new path but does not remove the old one; delete
  the old note yourself.
