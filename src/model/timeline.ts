import { TFile, type App } from "obsidian";

import {
  DEFAULT_PLOT_GRID_PLOTS_DIR,
  DEFAULT_PLOTS_DISPLAY_NAME,
  DEFAULT_TIMELINE_OUTPUT_PATH,
  singularDisplayName,
  type IndentedScene,
  type MultipleSceneDraft,
  type TimeframeFormat,
} from "./types";
import { scenePath } from "./scene-navigation";
import {
  configuredOutputPath,
  sceneWikilink,
  writeGeneratedNote,
} from "./generated-note";
import {
  isInsidePlotGridDirectory,
  plotGridDeepestColumns,
  plotGridIndents,
  plotGridLevelOptions,
  resolvePlotGridDirectory,
  type PlotGridColumn,
  type PlotGridLevelOption,
} from "./plot-grid";
import {
  compareTimeframes,
  deriveUnits,
  isTimeframeParseError,
  parseTimeframe,
  presentUnits,
  type TimeframeUnit,
  type TimeframeValues,
} from "./timeframe";

const FORMAT_LABELS: Record<TimeframeFormat, string> = {
  "epoch-datetime-dmy": "Epoch date time (num dd/mm/yyyy hh:mm:ss)",
  "epoch-datetime-mdy": "Epoch date time (num mm/dd/yyyy hh:mm:ss)",
  datetime: "Date time (dd/mm/yyyy hh:mm:ss)",
  time: "Time only (hh:mm:ss)",
  number: "Chronological order (num)",
};

export type TimelineError = {
  sceneTitle: string;
  kind: "empty" | "format" | "range" | "inconsistent";
  message: string;
};

export type TimelineEntry = {
  sceneTitle: string;
  values: TimeframeValues;
  /** The vault-relative path to the scene's note. */
  path: string;
};

export type TimelineResult = {
  title: string;
  tagName: string;
  format: TimeframeFormat;
  /** The units every entry uses, coarsest first. */
  units: TimeframeUnit[];
  primaryUnit: TimeframeUnit;
  secondaryUnit: TimeframeUnit;
  entries: TimelineEntry[];
  missing: string[];
  errors: TimelineError[];
};

/** One plot note read from the configured plot folder. */
export type TimelinePlotNote = {
  /** Vault-relative note path. */
  path: string;
  /** Note basename, used as the table row label. */
  name: string;
  /** The note body. */
  body: string;
  frontmatter: Record<string, unknown> | undefined;
};

/** One time-group column in the transposed plot timeline. */
export type TimelinePlotColumn = {
  /** Stable key built from the rendered header lines. */
  key: string;
  /** Up to three lines (primary / between / cadence) joined with `<br>`. */
  header: string;
};

/** One table row: Full Story or a plot note. */
export type TimelinePlotLine = {
  name: string;
  fullStory: boolean;
  /** Scene titles the plot mentions. Empty for Full Story. */
  mentions: Set<string>;
};

/** A note link target: one hierarchy node (scene, chapter, act, …). */
export type TimelinePlotNode = {
  title: string;
  /** Vault-relative path to the node's note in the project's Scenes folder. */
  path: string;
};

/**
 * One hierarchy level rendered as its own table. Levels are ordered deepest
 * first, so the first entry is always the timeline's own (deepest) level.
 */
export type TimelinePlotLevel = {
  /** Zero-based rank of the distinct indent; 0 is the top level. */
  level: number;
  /** Sample node titles for the heading, e.g. `Act 1, Act 2, …`. */
  label: string;
  /**
   * Timeline entry scene title to the entry's node at this level. Empty for
   * the deepest level, whose table links the timeline entries themselves.
   */
  nodes: Map<string, TimelinePlotNode>;
};

export type TimelinePlotTable = {
  columns: TimelinePlotColumn[];
  lines: TimelinePlotLine[];
  /** Timeline scenes no plot note mentions, in timeline order. */
  unmentioned: TimelineEntry[];
  /**
   * Every hierarchy level, deepest first. When this has more than one entry,
   * each level gets its own table; a single level renders exactly as before.
   */
  levels?: TimelinePlotLevel[];
};

/** Collects scene timeframes and validates them against the project format. */
export async function buildTimeline(
  app: App,
  draft: MultipleSceneDraft
): Promise<TimelineResult> {
  const tagName = draft.timeframeTagName;
  const format = draft.timeFormat;
  const entries: TimelineEntry[] = [];
  const missing: string[] = [];
  const errors: TimelineError[] = [];

  for (let index = 0; index < draft.scenes.length; index++) {
    const scene = draft.scenes[index];
    const next = draft.scenes[index + 1];

    // Scenes with children are structural containers, not timeline events.
    if (next && next.indent > scene.indent) {
      continue;
    }

    const path = scenePath(scene.title, draft, app.vault);
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      continue;
    }

    const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
    const hasTag =
      frontmatter !== undefined &&
      Object.prototype.hasOwnProperty.call(frontmatter, tagName);
    // No timeframe property at all is not an error: the scene is simply not
    // on the timeline. A property that exists but is empty is a problem.
    if (!hasTag) {
      missing.push(scene.title);
      continue;
    }
    const raw = frontmatter?.[tagName] as unknown;

    const parsed = parseTimeframe(raw, format);
    if (isTimeframeParseError(parsed)) {
      const { error } = parsed;
      errors.push({
        sceneTitle: scene.title,
        kind: error.kind,
        message:
          error.kind === "empty"
            ? "has an empty timeframe value."
            : error.kind === "range"
            ? `has an out-of-range ${error.unit} value (${error.value}).`
            : `does not match the configured format (${FORMAT_LABELS[format]}).`,
      });
      continue;
    }

    entries.push({
      sceneTitle: scene.title,
      values: parsed.values,
      path,
    });
  }

  const consistent = keepConsistent(entries, errors);
  consistent.sort((a, b) => compareTimeframes(a.values, b.values));
  const [primaryUnit, secondaryUnit] = deriveUnits(
    consistent.map((entry) => entry.values),
    format
  );
  const units =
    consistent.length > 0
      ? presentUnits(format).filter(
          (unit) => consistent[0].values[unit] !== undefined
        )
      : [];

  return {
    title: draft.title,
    tagName,
    format,
    units,
    primaryUnit,
    secondaryUnit,
    entries: consistent,
    missing,
    errors,
  };
}

/** Drops entries whose unit count differs from the majority. */
function keepConsistent(
  entries: TimelineEntry[],
  errors: TimelineError[]
): TimelineEntry[] {
  const counts = new Map<number, number>();
  for (const entry of entries) {
    const count = Object.keys(entry.values).length;
    counts.set(count, (counts.get(count) ?? 0) + 1);
  }
  if (counts.size <= 1) {
    return entries;
  }

  const reference = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const kept: TimelineEntry[] = [];

  for (const entry of entries) {
    const count = Object.keys(entry.values).length;
    if (count === reference) {
      kept.push(entry);
    } else {
      errors.push({
        sceneTitle: entry.sceneTitle,
        kind: "inconsistent",
        message: `uses ${count} time units, but the rest of the project uses ${reference}.`,
      });
    }
  }

  return kept;
}

/** Writes the timeline beside the compiled manuscript. */
export async function writeTimeline(
  app: App,
  draft: MultipleSceneDraft,
  result: TimelineResult
): Promise<void> {
  if (!draft.timelineEnabled) {
    return;
  }

  if (result.entries.length === 0 && result.errors.length === 0) {
    return;
  }

  const path = configuredOutputPath(
    app,
    draft,
    draft.timelineOutputPath,
    DEFAULT_TIMELINE_OUTPUT_PATH,
    ".md"
  );
  // With the subplot grid on, the scene table becomes the transposed plot
  // table; the Mermaid diagram and Problems section are unchanged.
  let plotTable: TimelinePlotTable | null = null;
  if (draft.plotGridEnabled && result.entries.length > 0) {
    plotTable = await buildPlotTimeline(app, draft, result);
  }

  const plotLabel = singularDisplayName(
    draft.plotsDisplayName?.trim() || DEFAULT_PLOTS_DISPLAY_NAME
  );
  const contents = renderTimeline(result, plotTable, plotLabel);
  await writeGeneratedNote(app, path, contents);
}

function sanitize(text: string): string {
  return text.replace(/:/g, " -").replace(/\n/g, " ").trim();
}

function pad(value: number | undefined, length: number): string {
  return value === undefined ? "" : `${value}`.padStart(length, "0");
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function unitLabel(value: number, unit: TimeframeUnit): string {
  if (unit === "year") {
    return pad(value, 4);
  }
  if (unit === "month") {
    return MONTHS[value - 1] ?? pad(value, 2);
  }
  if (unit === "epoch" || unit === "number") {
    return `${value}`;
  }
  return pad(value, 2);
}

/** Formats selected units: months by name, dates with dashes, times with `timeSeparator`. */
function unitValues(
  values: TimeframeValues,
  units: TimeframeUnit[],
  timeSeparator = ":"
): string {
  if (values.number !== undefined) {
    return `${values.number}`;
  }

  const parts: string[] = [];
  if (units.includes("epoch") && values.epoch !== undefined) {
    parts.push(`${values.epoch}`);
  }

  const date = units
    .filter((unit) => unit === "year" || unit === "month" || unit === "day")
    .map((unit) =>
      unit === "month"
        ? MONTHS[(values[unit] ?? 1) - 1] ?? ""
        : pad(values[unit], unit === "year" ? 4 : 2)
    )
    .filter((value) => value.length > 0);
  if (date.length > 0) {
    parts.push(date.join("-"));
  }

  const time = units
    .filter((unit) => unit === "hour" || unit === "minute" || unit === "second")
    .map((unit) => pad(values[unit], 2))
    .filter((value) => value.length > 0);
  if (time.length > 0) {
    parts.push(time.join(timeSeparator));
  }

  return parts.join(" ");
}

/** The basename of a vault path, without a `.md` extension. */
function basenameOf(path: string): string {
  const withoutExtension = path.replace(/\.md$/i, "");
  const slash = withoutExtension.lastIndexOf("/");
  return slash < 0 ? withoutExtension : withoutExtension.slice(slash + 1);
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}

function isWordCharacter(character: string): boolean {
  return character.length > 0 && /[A-Za-z0-9_]/.test(character);
}

/**
 * True when `title` appears as a whole title, not as part of a longer word.
 * This keeps "Scene 1" from matching "Scene 10" while still allowing prose
 * punctuation around the title.
 */
function containsExactTitle(text: string, title: string): boolean {
  if (title.length === 0) {
    return false;
  }
  let from = 0;
  while (from <= text.length) {
    const index = text.indexOf(title, from);
    if (index < 0) {
      return false;
    }
    const before = index > 0 ? text.charAt(index - 1) : "";
    const after = text.charAt(index + title.length);
    if (!isWordCharacter(before) && !isWordCharacter(after)) {
      return true;
    }
    from = index + 1;
  }
  return false;
}


function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key) as boolean;
}

/** True for an empty scalar, an empty array, or an object with no keys. */
function isEmptyCell(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0 || value.every(isEmptyCell);
  }
  if (typeof value === "object") {
    return Object.keys(value).length === 0;
  }
  return false;
}

/** Appends every scalar inside a frontmatter value to `out`. */
function appendFrontmatterText(value: unknown, out: string[]): void {
  if (value === null || value === undefined) {
    return;
  }
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    out.push(`${value}`);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      appendFrontmatterText(item, out);
    }
    return;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      appendFrontmatterText(record[key], out);
    }
  }
}

type TimelineColumnParts = {
  /** Stable identity of the time group. */
  key: string;
  /** Up to three `<br>`-joined header lines. */
  header: string;
};

/**
 * The three header parts for an entry: the primary unit's value, the units
 * between the primary and secondary units, and the cadence down to the
 * smallest unit. Empty and duplicate parts are omitted from the header but
 * kept in the key, so the time-group identity is unchanged by suppression.
 */
function timelineColumnParts(
  result: TimelineResult,
  entry: TimelineEntry
): TimelineColumnParts {
  const primary = result.primaryUnit;
  const secondary = result.secondaryUnit;
  const present = result.units;
  const primaryIndex = present.indexOf(primary);
  const secondaryIndex = present.indexOf(secondary);
  const between =
    secondary === primary
      ? []
      : present.slice(primaryIndex + 1, secondaryIndex + 1);
  const below = present.slice(secondaryIndex + 1);

  const primaryValue = entry.values[primary];
  const primaryLine =
    primaryValue === undefined ? "" : unitLabel(primaryValue, primary);
  const betweenLine =
    between.length > 0 ? unitValues(entry.values, between) : "";
  const cadenceLine =
    below.length > 0 ? unitValues(entry.values, below, ":") : "";

  return {
    key: [primaryLine, betweenLine, cadenceLine].join("\u0000"),
    header: uniqueHeaderParts([primaryLine, betweenLine, cadenceLine]).join(
      "<br>"
    ),
  };
}

/**
 * The rendered header tiers, empty tiers omitted and duplicate strings kept
 * only at their first occurrence. A tier that repeats an earlier one (for
 * example a cadence that renders the same as the secondary tier) would add no
 * information, so it is dropped.
 */
function uniqueHeaderParts(parts: string[]): string[] {
  const unique: string[] = [];
  for (const part of parts) {
    if (part.length > 0 && !unique.includes(part)) {
      unique.push(part);
    }
  }
  return unique;
}

/**
 * The distinct time groups across the timeline, in chronological order. The
 * entries are already sorted, so first occurrence is chronological.
 */
export function timelinePlotColumns(
  result: TimelineResult
): TimelinePlotColumn[] {
  const columns: TimelinePlotColumn[] = [];
  const seen = new Set<string>();

  for (const entry of result.entries) {
    const parts = timelineColumnParts(result, entry);
    if (seen.has(parts.key)) {
      continue;
    }
    seen.add(parts.key);
    columns.push({ key: parts.key, header: parts.header });
  }

  return columns;
}

/**
 * The scenes a plot note mentions. A scene is mentioned by a non-empty
 * scene-level `plotgrid_*` cell (mapped through the project's current grid
 * columns) or by its exact title / wikilink in the note body or frontmatter.
 */
export function plotTimelineMentions(
  note: TimelinePlotNote,
  entries: TimelineEntry[],
  columns: PlotGridColumn[]
): Set<string> {
  const frontmatter = note.frontmatter ?? {};
  const texts: string[] = [note.body];
  for (const key of Object.keys(frontmatter)) {
    appendFrontmatterText(frontmatter[key], texts);
  }
  const text = texts.join("\n");

  const links = new Set<string>();
  const linkPattern = /\[\[([^\]]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(text)) !== null) {
    const inner = match[1];
    const pipe = inner.indexOf("|");
    const targetPart = pipe >= 0 ? inner.slice(0, pipe) : inner;
    const aliasPart = pipe >= 0 ? inner.slice(pipe + 1) : "";
    // A table-escaped link (`[[Target\|Alias]]`) leaves a trailing backslash.
    const target = targetPart.split("#")[0].trim().replace(/\\$/, "");
    if (target.length > 0) {
      links.add(target);
      links.add(basenameOf(target));
    }
    const alias = aliasPart.split("#")[0].trim();
    if (alias.length > 0) {
      links.add(alias);
    }
  }

  const mentions = new Set<string>();
  for (const column of columns) {
    if (!hasOwn(frontmatter, column.key)) {
      continue;
    }
    if (isEmptyCell(frontmatter[column.key])) {
      continue;
    }
    mentions.add(column.title);
  }

  for (const entry of entries) {
    const path = entry.path.replace(/\.md$/i, "");
    if (
      containsExactTitle(text, entry.sceneTitle) ||
      links.has(entry.sceneTitle) ||
      links.has(path) ||
      links.has(basenameOf(path))
    ) {
      mentions.add(entry.sceneTitle);
    }
  }

  return mentions;
}

/**
 * Reads every Markdown note under the configured plot folder, deduplicated by
 * path.
 */
export async function readTimelinePlotNotes(
  app: App,
  draft: MultipleSceneDraft
): Promise<TimelinePlotNote[]> {
  const folder = resolvePlotGridDirectory(
    app,
    draft,
    draft.plotGridPlotsDir,
    DEFAULT_PLOT_GRID_PLOTS_DIR
  );
  const seen = new Set<string>();
  const notes: TimelinePlotNote[] = [];
  const files = app.vault
    .getMarkdownFiles()
    .filter((file) => isInsidePlotGridDirectory(folder, file.path))
    .sort((left, right) => compareStrings(left.path, right.path));

  for (const file of files) {
    if (seen.has(file.path)) {
      continue;
    }
    seen.add(file.path);
    notes.push({
      path: file.path,
      name: file.basename || basenameOf(file.path),
      body: await app.vault.read(file),
      frontmatter: app.metadataCache.getFileCache(file)?.frontmatter,
    });
  }

  return notes;
}

/**
 * A heading sample taken from a level option. `plotGridLevelOptions` formats
 * its label as `level - (titles)`, so the parenthesized part is reused as-is;
 * this keeps the `, …` truncation marker when there are more nodes.
 */
function timelineLevelLabel(
  option: PlotGridLevelOption | undefined
): string {
  if (!option) {
    return "";
  }
  const prefix = `${option.level} - (`;
  return option.label.startsWith(prefix) && option.label.endsWith(")")
    ? option.label.slice(prefix.length, -1)
    : option.titles.join(", ");
}

/**
 * Maps every timeline entry's scene to its ancestor node at `level`. A scene
 * that sits above `level`, or whose ancestor chain skips that indent, has no
 * node there and is omitted.
 */
function timelineNodesAtLevel(
  app: App,
  draft: MultipleSceneDraft,
  level: number,
  entries: TimelineEntry[]
): Map<string, TimelinePlotNode> {
  const indents = plotGridIndents(draft.scenes);
  const nodes = new Map<string, TimelinePlotNode>();
  if (level < 0 || level >= indents.length) {
    return nodes;
  }

  const wanted = new Set(entries.map((entry) => entry.sceneTitle));
  const ancestors: IndentedScene[] = [];

  for (const scene of draft.scenes) {
    while (
      ancestors.length > 0 &&
      ancestors[ancestors.length - 1].indent >= scene.indent
    ) {
      ancestors.pop();
    }

    const sceneLevel = indents.indexOf(scene.indent);
    if (level <= sceneLevel && wanted.has(scene.title)) {
      const node =
        level === sceneLevel
          ? scene
          : ancestors.find(
              (ancestor) => ancestor.indent === indents[level]
            );
      if (node) {
        nodes.set(scene.title, {
          title: node.title,
          path: scenePath(node.title, draft, app.vault),
        });
      }
    }

    ancestors.push(scene);
  }

  return nodes;
}

/**
 * The hierarchy levels for the timeline, deepest first. The deepest level is
 * the existing entry table; each shallower level maps every timeline entry to
 * its ancestor node at that level. Labels come from `plotGridLevelOptions`, so
 * they describe the same levels as the generated plot-grid view.
 */
function buildTimelinePlotLevels(
  app: App,
  draft: MultipleSceneDraft,
  entries: TimelineEntry[]
): TimelinePlotLevel[] {
  const indents = plotGridIndents(draft.scenes);
  if (indents.length === 0) {
    return [];
  }

  const options = new Map(
    plotGridLevelOptions(draft.scenes).map((option) => [option.level, option])
  );
  const deepest = indents.length - 1;
  const levels: TimelinePlotLevel[] = [];

  for (let level = deepest; level >= 0; level--) {
    levels.push({
      level,
      label: timelineLevelLabel(options.get(level)),
      nodes:
        level === deepest
          ? new Map<string, TimelinePlotNode>()
          : timelineNodesAtLevel(app, draft, level, entries),
    });
  }

  return levels;
}

/**
 * Builds the transposed plot timeline: Full Story first, then Main if it
 * exists, then the other plot notes alphabetically. Scenes no plot mentions
 * are collected for the trailing section.
 */
export async function buildPlotTimeline(
  app: App,
  draft: MultipleSceneDraft,
  result: TimelineResult
): Promise<TimelinePlotTable> {
  const notes = await readTimelinePlotNotes(app, draft);
  // Timeline entries are scenes, so scene-mention matching uses the deepest
  // hierarchy level's columns. A shallower level's act/chapter cells would
  // name structural nodes that are not timeline entries.
  const columns = plotGridDeepestColumns(draft.scenes);
  const rows: { note: TimelinePlotNote; mentions: Set<string> }[] = [];
  const mentioned = new Set<string>();

  for (const note of notes) {
    const mentions = plotTimelineMentions(note, result.entries, columns);
    rows.push({ note, mentions });
    for (const title of mentions) {
      mentioned.add(title);
    }
  }

  const mainIndex = rows.findIndex(
    (row) => row.note.name.toLowerCase() === "main"
  );
  const main = mainIndex >= 0 ? rows[mainIndex] : null;
  const others = rows
    .filter((_row, index) => index !== mainIndex)
    .sort((left, right) => {
      const byName = compareStrings(left.note.name, right.note.name);
      return byName !== 0
        ? byName
        : compareStrings(left.note.path, right.note.path);
    });

  const lines: TimelinePlotLine[] = [
    { name: "Full Story", fullStory: true, mentions: new Set<string>() },
  ];
  if (main) {
    lines.push({
      name: main.note.name,
      fullStory: false,
      mentions: main.mentions,
    });
  }
  for (const row of others) {
    lines.push({
      name: row.note.name,
      fullStory: false,
      mentions: row.mentions,
    });
  }

  return {
    columns: timelinePlotColumns(result),
    lines,
    unmentioned: result.entries.filter(
      (entry) => !mentioned.has(entry.sceneTitle)
    ),
    levels: buildTimelinePlotLevels(app, draft, result.entries),
  };
}

/** Resolves the link target for one timeline entry in a level's table. */
type TimelinePlotNodeFor = (entry: TimelineEntry) => TimelinePlotNode | null;

/**
 * Renders one level's transposed table: the same Plot/time-column layout for
 * every level, with each cell holding the unique nodes that level contributes
 * for the matching scenes. Links are deduplicated by path and joined with
 * `<br>`, in timeline order.
 */
function renderTimelinePlotLevel(
  result: TimelineResult,
  columns: TimelinePlotColumn[],
  lines: TimelinePlotLine[],
  nodeFor: TimelinePlotNodeFor,
  plotLabel: string
): string {
  const header = [plotLabel, ...columns.map((column) => column.header)];

  const rendered = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
  ];

  for (const line of lines) {
    const cells = [line.name];
    for (const column of columns) {
      const links: string[] = [];
      const seen = new Set<string>();
      for (const entry of result.entries) {
        if (timelineColumnParts(result, entry).key !== column.key) {
          continue;
        }
        if (!line.fullStory && !line.mentions.has(entry.sceneTitle)) {
          continue;
        }
        const node = nodeFor(entry);
        if (node === null || seen.has(node.path)) {
          continue;
        }
        seen.add(node.path);
        links.push(sceneWikilink(node.path, node.title, true));
      }
      cells.push(links.join("<br>"));
    }
    rendered.push(`| ${cells.join(" | ")} |`);
  }

  return rendered.join("\n");
}

/** A generic, per-level heading such as `### Level 2 — Scene 1, Scene 2, …`. */
function timelineLevelHeading(level: TimelinePlotLevel): string {
  return level.label.length > 0
    ? `### Level ${level.level} — ${level.label}`
    : `### Level ${level.level}`;
}

/** Renders the transposed plot timeline tables, plus the unmentioned section. */
export function renderTimelinePlotTable(
  result: TimelineResult,
  table: TimelinePlotTable,
  plotLabel: string = singularDisplayName(DEFAULT_PLOTS_DISPLAY_NAME)
): string {
  const levels = table.levels ?? [];
  const entryTable = renderTimelinePlotLevel(
    result,
    table.columns,
    table.lines,
    (entry) => ({ title: entry.sceneTitle, path: entry.path }),
    plotLabel
  );

  const sections: string[] = [];
  if (levels.length > 1) {
    // The levels are deepest first, matching the requested table order: the
    // deepest table links the timeline entries; the rest link ancestors.
    for (let index = 0; index < levels.length; index++) {
      const level = levels[index];
      const rendered =
        index === 0
          ? entryTable
          : renderTimelinePlotLevel(
              result,
              table.columns,
              table.lines,
              (entry) => level.nodes.get(entry.sceneTitle) ?? null,
              plotLabel
            );
      // A blank line is required between the heading and the table so Obsidian
      // parses the table header and separator instead of treating them as
      // heading text.
      sections.push(`${timelineLevelHeading(level)}\n\n${rendered}`);
    }
  } else {
    sections.push(entryTable);
  }

  let rendered = sections.join("\n\n");
  if (table.unmentioned.length > 0) {
    rendered +=
      "\n\n### These scenes have not been mentioned in any subplot line\n" +
      "Fill them in in the subplot grid or mention them in the subplot notes.\n\n" +
      table.unmentioned
        .map((entry) => sceneWikilink(entry.path, entry.sceneTitle, true))
        .join("\n");
  }
  return rendered;
}

/** Builds the Mermaid timeline. */
function renderMermaid(result: TimelineResult): string {
  const primary = result.primaryUnit;
  const secondary = result.secondaryUnit;
  const lines = [
    "```mermaid",
    "timeline",
    `    title ${sanitize(result.title)}`,
  ];

  if (primary === "number") {
    lines.push("    section Timeline");
    for (const entry of result.entries) {
      lines.push(
        `        ${entry.values.number} : ${sanitize(entry.sceneTitle)}`
      );
    }
    lines.push("```");
    return lines.join("\n");
  }

  const present = result.units;
  const primaryIndex = present.indexOf(primary);
  const secondaryIndex = present.indexOf(secondary);
  const between =
    secondary === primary
      ? []
      : present.slice(primaryIndex + 1, secondaryIndex + 1);
  const below = present.slice(secondaryIndex + 1);

  const primaryGroups = new Map<string, TimelineEntry[]>();
  for (const entry of result.entries) {
    const key = `${entry.values[primary] ?? ""}`;
    const group = primaryGroups.get(key) ?? [];
    group.push(entry);
    primaryGroups.set(key, group);
  }

  const sortedPrimary = [...primaryGroups.entries()].sort(
    (a, b) => Number(a[0]) - Number(b[0])
  );

  for (const [primaryValue, primaryEntries] of sortedPrimary) {
    lines.push(`    section ${unitLabel(Number(primaryValue), primary)}`);

    if (between.length === 0) {
      for (const entry of primaryEntries) {
        const periodLabel = unitLabel(Number(entry.values[primary]), primary);
        const time =
          below.length > 0
            ? unitValues(entry.values, below, ":")
            : unitValues(entry.values, present, ":");
        lines.push(
          `        ${periodLabel} : ${time}<br>${sanitize(entry.sceneTitle)}`
        );
      }
      continue;
    }

    const periods = new Map<string, TimelineEntry[]>();
    for (const entry of primaryEntries) {
      const key = between.map((unit) => entry.values[unit]).join("|");
      const group = periods.get(key) ?? [];
      group.push(entry);
      periods.set(key, group);
    }

    const sortedPeriods = [...periods.entries()].sort((a, b) => {
      const left = a[0].split("|").map(Number);
      const right = b[0].split("|").map(Number);
      for (let index = 0; index < left.length; index++) {
        if (left[index] !== right[index]) {
          return left[index] - right[index];
        }
      }
      return 0;
    });

    for (const [, periodEntries] of sortedPeriods) {
      const label = unitValues(periodEntries[0].values, between);
      const continuation = " ".repeat(8 + label.length + 1);

      periodEntries.forEach((entry, index) => {
        const time =
          below.length > 0
            ? unitValues(entry.values, below, ":")
            : unitValues(entry.values, present, ":");
        const event = `${time}<br>${sanitize(entry.sceneTitle)}`;
        const prefix =
          index === 0 ? `        ${label} : ` : `${continuation}: `;
        lines.push(`${prefix}${event}`);
      });
    }
  }

  lines.push("```");
  return lines.join("\n");
}

/** Renders the plain four-column entry table. */
function renderEntryTable(result: TimelineResult): string {
  const primary = result.primaryUnit;
  const secondary = result.secondaryUnit;
  const present = result.units;
  const primaryIndex = present.indexOf(primary);
  const secondaryIndex = present.indexOf(secondary);
  const between: TimeframeUnit[] =
    secondary === primary
      ? []
      : present.slice(primaryIndex + 1, secondaryIndex + 1);
  const below = present.slice(secondaryIndex + 1);

  const table = ["| | | | |", "| --- | --- | --- | --- |"];

  let lastPrimaryKey: string | null = null;
  let lastPeriodKey: string | null = null;
  for (const entry of result.entries) {
    const primaryValue = entry.values[primary];
    const primaryKey = `${primaryValue ?? ""}`;
    const periodKey = between
      .map((unit) => `${entry.values[unit] ?? ""}`)
      .join("|");
    const firstOfPrimary = primaryKey !== lastPrimaryKey;
    const firstOfPeriod = firstOfPrimary || periodKey !== lastPeriodKey;

    const primaryCell =
      firstOfPrimary && primaryValue !== undefined
        ? unitLabel(primaryValue, primary)
        : "";
    const periodCell =
      between.length > 0 ? unitValues(entry.values, between) : "";
    const cadenceCell =
      below.length > 0
        ? unitValues(entry.values, below, ":")
        : unitValues(entry.values, present, ":");

    table.push(
      `| ${primaryCell} | ${
        firstOfPeriod ? periodCell : ""
      } | ${cadenceCell} | ${sceneWikilink(
        entry.path,
        entry.sceneTitle,
        true
      )} |`
    );

    lastPrimaryKey = primaryKey;
    lastPeriodKey = periodKey;
  }

  return table.join("\n");
}

export function renderTimeline(
  result: TimelineResult,
  plotTable: TimelinePlotTable | null = null,
  plotLabel: string = singularDisplayName(DEFAULT_PLOTS_DISPLAY_NAME)
): string {
  const parts: string[] = [];

  if (result.errors.length > 0) {
    // One heading per distinct message, then the scenes that produced it.
    const grouped = new Map<string, string[]>();
    for (const error of result.errors) {
      const titles = grouped.get(error.message) ?? [];
      titles.push(error.sceneTitle.trim());
      grouped.set(error.message, titles);
    }

    const problems = ["## Problems", ""];
    for (const [message, titles] of grouped) {
      const heading = `${message.charAt(0).toUpperCase()}${message
        .slice(1)
        .replace(/\.$/, "")}`;
      problems.push(`**${heading}**`, "");
      for (const title of titles) {
        problems.push(`- ${title}`);
      }
      problems.push("");
    }
    problems.push(
      "Scenes with an empty or invalid timeframe are left out of the timeline below."
    );
    parts.push(problems.join("\n"));
  }

  if (result.entries.length > 0) {
    const table = plotTable
      ? renderTimelinePlotTable(result, plotTable, plotLabel)
      : renderEntryTable(result);
    parts.push(`${renderMermaid(result)}\n\n${table}`);
  }

  if (result.missing.length > 0) {
    const missing = ["## Scenes without a timeframe", ""];
    for (const title of result.missing) {
      missing.push(`- ${title.trim()}`);
    }
    parts.push(missing.join("\n"));
  }

  return `# Story Timeline\n\n${parts.join("\n\n")}\n`;
}
