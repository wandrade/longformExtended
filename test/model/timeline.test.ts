import { describe, expect, it } from "vitest";

import { TFile, type App } from "obsidian";

import {
  buildPlotTimeline,
  buildTimeline,
  plotTimelineMentions,
  readTimelinePlotNotes,
  renderTimeline,
  renderTimelinePlotTable,
  timelinePlotColumns,
  writeTimeline,
  type TimelineEntry,
  type TimelinePlotTable,
  type TimelineResult,
} from "src/model/timeline";
import type { MultipleSceneDraft } from "src/model/types";
import type { TimeframeUnit } from "src/model/timeframe";

function makeDraft(
  overrides: Partial<MultipleSceneDraft> = {}
): MultipleSceneDraft {
  return {
    format: "scenes",
    title: "Book",
    titleInFrontmatter: true,
    draftTitle: null,
    vaultPath: "Books/My/Book.md",
    workflow: null,
    sceneFolder: "Scenes",
    scenes: [],
    ignoredFiles: null,
    unknownFiles: [],
    sceneTemplate: null,
    plotTemplate: null,
    characterTemplate: null,
    plots: [],
    characters: [],
    sceneDisplayName: "Scenes",
    plotsDisplayName: "Subplots",
    charactersDisplayName: "Characters",
    noteGroups: [],
    timeframeTagName: "timeframe",
    timeFormat: "datetime",
    kanbanColumns: "Planned Draft Reviewed",
    kanbanShowUnassigned: false,
    kanbanSaveWordCounts: true,
    kanbanEnabled: true,
    kanbanIncludePlots: true,
    kanbanOutputPath: "Build/$1_kanban.base",
    timelineEnabled: true,
    timelineOutputPath: "Build/$1_timeline.md",
    plotGridEnabled: true,
    plotGridOutputPath: "",
    plotGridPlotsDir: "/Bible/Plots",
    plotGridCharactersDir: "/Bible/Characters",
    autocompileMinutes: null,
    ...overrides,
  };
}

function entry(
  sceneTitle: string,
  path: string,
  values: TimelineEntry["values"]
): TimelineEntry {
  return { sceneTitle, path, values };
}

function makeResult(overrides: Partial<TimelineResult> = {}): TimelineResult {
  return {
    title: "Book",
    tagName: "timeframe",
    format: "datetime",
    units: ["year", "month", "day", "hour", "minute", "second"],
    primaryUnit: "day",
    secondaryUnit: "hour",
    entries: [],
    missing: [],
    errors: [],
    ...overrides,
  };
}

type FakeWorld = {
  app: App;
  bodies: Map<string, string>;
  frontmatter: Map<string, Record<string, unknown>>;
  generated: Map<string, string>;
};

function fileAt(path: string): TFile {
  const file = new TFile();
  const name = path.slice(path.lastIndexOf("/") + 1);
  Object.assign(file, {
    path,
    name,
    basename: name.replace(/\.md$/i, ""),
  });
  return file;
}

function makeWorld(files: string[]): FakeWorld {
  const bodies = new Map<string, string>();
  const frontmatter = new Map<string, Record<string, unknown>>();
  const fileObjects = new Map<string, TFile>();
  for (const file of files) {
    bodies.set(file, "");
    frontmatter.set(file, {});
    fileObjects.set(file, fileAt(file));
  }

  const project = fileAt("Books/My/Book.md");
  Object.assign(project, { parent: { path: "Books/My" } });
  const generated = new Map<string, string>();
  const folders = new Set<string>();

  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => {
        if (path === "Books/My/Book.md") {
          return project;
        }
        return fileObjects.get(path) ?? null;
      },
      getMarkdownFiles: () => Array.from(fileObjects.values()),
      read: async (file: TFile) => bodies.get(file.path) ?? "",
      createFolder: async (path: string) => {
        folders.add(path);
      },
      adapter: {
        exists: async (path: string) =>
          generated.has(path) || folders.has(path) || bodies.has(path),
        read: async (path: string) => generated.get(path) ?? "",
        write: async (path: string, contents: string) => {
          generated.set(path, contents);
        },
      },
    },
    metadataCache: {
      getFileCache: (file: { path: string }) => ({
        frontmatter: frontmatter.get(file.path),
      }),
    },
  } as unknown as App;

  return { app, bodies, frontmatter, generated };
}

describe("plot timeline columns", () => {
  it("orders distinct time groups chronologically and omits empty lines", () => {
    const result = makeResult({
      entries: [
        entry("A", "Scenes/A.md", {
          year: 2026,
          month: 3,
          day: 4,
          hour: 9,
          minute: 30,
          second: 0,
        }),
        entry("B", "Scenes/B.md", {
          year: 2026,
          month: 3,
          day: 5,
          hour: 10,
          minute: 0,
          second: 0,
        }),
        entry("C", "Scenes/C.md", {
          year: 2026,
          month: 3,
          day: 4,
          hour: 9,
          minute: 30,
          second: 0,
        }),
      ],
    });

    expect(timelinePlotColumns(result).map((column) => column.header)).toEqual([
      "04<br>09<br>30:00",
      "05<br>10<br>00:00",
    ]);
  });

  it("renders one line for the number format", () => {
    const result = makeResult({
      format: "number",
      units: ["number"],
      primaryUnit: "number",
      secondaryUnit: "number",
      entries: [entry("A", "Scenes/A.md", { number: 3 })],
    });

    expect(timelinePlotColumns(result)).toEqual([
      { key: "3\u0000\u0000", header: "3" },
    ]);
  });

  it("keeps three header tiers and suppresses duplicate rendered tiers", () => {
    const columnHeader = (
      units: TimeframeUnit[],
      primaryUnit: TimeframeUnit,
      secondaryUnit: TimeframeUnit,
      values: TimelineEntry["values"]
    ): string =>
      timelinePlotColumns(
        makeResult({
          units,
          primaryUnit,
          secondaryUnit,
          entries: [entry("A", "Scenes/A.md", values)],
        })
      )[0].header;

    // Distinct primary / between / cadence tiers are all kept, in order.
    expect(
      columnHeader(
        ["day", "hour", "minute", "second"],
        "day",
        "hour",
        { day: 1, hour: 8, minute: 30, second: 0 }
      )
    ).toBe("01<br>08<br>30:00");

    // primary == secondary: the between tier is empty, cadence is distinct.
    expect(
      columnHeader(["day", "hour", "minute"], "day", "day", {
        day: 1,
        hour: 8,
        minute: 0,
      })
    ).toBe("01<br>08:00");

    // The cadence renders the same as the secondary tier and is omitted.
    expect(
      columnHeader(["year", "month", "day"], "year", "month", {
        year: 5,
        month: 3,
        day: 4,
        number: 7,
      })
    ).toBe("0005<br>7");

    // All three tiers render the same string: show it once.
    expect(
      columnHeader(["number", "day", "hour"], "number", "day", {
        number: 5,
        day: 5,
        hour: 5,
      })
    ).toBe("5");

    // Every tier is empty.
    expect(
      columnHeader(["day", "hour", "minute"], "day", "hour", {})
    ).toBe("");
  });
});

describe("plot timeline mentions", () => {
  const columns = [
    { key: "plotgrid_scene_1", title: "Scene 1", path: ["Scene 1"] },
    { key: "plotgrid_scene_2", title: "Scene 2", path: ["Scene 2"] },
  ];

  it("combines non-empty cells, exact titles, and wikilinks", () => {
    const entries = [
      entry("Scene 1", "Scenes/Scene 1.md", {}),
      entry("Scene 2", "Scenes/Scene 2.md", {}),
      entry("Scene 3", "Scenes/Scene 3.md", {}),
    ];
    const mentions = plotTimelineMentions(
      {
        path: "Bible/Plots/Main.md",
        name: "Main",
        body:
          "Scene 2 happens here, and [[Scenes/Scene 3|an alias]] is linked.",
        frontmatter: {
          plotgrid_scene_1: "yes",
          plotgrid_scene_2: "",
          other: "Scene 4 is not in the timeline.",
        },
      },
      entries,
      columns
    );

    expect(Array.from(mentions).sort()).toEqual([
      "Scene 1",
      "Scene 2",
      "Scene 3",
    ]);
  });

  it("treats an empty cell as unmentioned", () => {
    const mentions = plotTimelineMentions(
      {
        path: "Bible/Plots/Main.md",
        name: "Main",
        body: "",
        frontmatter: { plotgrid_scene_1: "" },
      },
      [entry("Scene 1", "Scenes/Scene 1.md", {})],
      columns
    );

    expect(mentions.size).toBe(0);
  });
});

describe("plot timeline rows", () => {
  it("reads only the configured plot folder, deduped", async () => {
    const { app, bodies } = makeWorld([
      "Books/My/Bible/Plots/Main.md",
      "Books/My/Bible/Plots/Sub/A Plot.md",
      "Books/My/Bible/Characters/Mara.md",
      "Elsewhere.md",
    ]);
    bodies.set("Books/My/Bible/Plots/Main.md", "main body");

    const notes = await readTimelinePlotNotes(app, makeDraft());

    expect(notes.map((note) => note.path)).toEqual([
      "Books/My/Bible/Plots/Main.md",
      "Books/My/Bible/Plots/Sub/A Plot.md",
    ]);
    expect(notes[0].body).toBe("main body");
  });

  it("puts Full Story, Main, then the other plots alphabetically", async () => {
    const { app, bodies, frontmatter } = makeWorld([
      "Books/My/Bible/Plots/Z Plot.md",
      "Books/My/Bible/Plots/A Plot.md",
      "Books/My/Bible/Plots/Main.md",
      "Books/My/Bible/Characters/Mara.md",
    ]);
    const draft = makeDraft({
      scenes: [
        { title: "Act 1", indent: 0 },
        { title: "Scene 1", indent: 1 },
        { title: "Scene 2", indent: 1 },
        { title: "Scene 3", indent: 1 },
        { title: "Scene 4", indent: 1 },
      ],
    });
    bodies.set("Books/My/Bible/Plots/Main.md", "Scene 1");
    bodies.set("Books/My/Bible/Plots/A Plot.md", "[[Scenes/Scene 2]]");
    bodies.set("Books/My/Bible/Plots/Z Plot.md", "Nothing relevant.");
    frontmatter.set("Books/My/Bible/Plots/A Plot.md", {
      plotgrid_scene_3: "present",
    });

    const result = makeResult({
      entries: [
        entry("Scene 1", "Scenes/Scene 1.md", {}),
        entry("Scene 2", "Scenes/Scene 2.md", {}),
        entry("Scene 3", "Scenes/Scene 3.md", {}),
        entry("Scene 4", "Scenes/Scene 4.md", {}),
      ],
    });
    const table = await buildPlotTimeline(app, draft, result);

    expect(table.lines.map((line) => line.name)).toEqual([
      "Full Story",
      "Main",
      "A Plot",
      "Z Plot",
    ]);
    expect(table.lines[1].mentions.has("Scene 1")).toBe(true);
    expect(table.lines[2].mentions.has("Scene 2")).toBe(true);
    expect(table.lines[2].mentions.has("Scene 3")).toBe(true);
    expect(
      table.unmentioned.map((timelineEntry) => timelineEntry.sceneTitle)
    ).toEqual(["Scene 4"]);
  });
});

describe("plot timeline hierarchy levels", () => {
  const hierarchy = [
    { title: "Act 1", indent: 0 },
    { title: "Chapter 1", indent: 1 },
    { title: "Scene 1", indent: 2 },
    { title: "Scene 2", indent: 2 },
    { title: "Scene 3", indent: 2 },
    { title: "Scene 4", indent: 2 },
    { title: "Chapter 2", indent: 1 },
    { title: "Scene 5", indent: 2 },
    { title: "Scene 6", indent: 2 },
    { title: "Scene 7", indent: 2 },
    { title: "Act 2", indent: 0 },
    { title: "Chapter 3", indent: 1 },
    { title: "Scene 8", indent: 2 },
    { title: "Scene 9", indent: 2 },
    { title: "Scene 10", indent: 2 },
  ];

  // Two scenes share each time group, so cells can exercise deduplication.
  const timeGroups = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5];

  function hierarchyResult(): TimelineResult {
    return makeResult({
      format: "number",
      units: ["number"],
      primaryUnit: "number",
      secondaryUnit: "number",
      entries: timeGroups.map((number, index) =>
        entry(`Scene ${index + 1}`, `Books/My/Scenes/Scene ${index + 1}.md`, {
          number,
        })
      ),
    });
  }

  function hierarchyWorld(): FakeWorld {
    return makeWorld([
      "Books/My/Bible/Plots/Main.md",
      "Books/My/Bible/Plots/Sub.md",
    ]);
  }

  function link(title: string): string {
    return `[[Books/My/Scenes/${title}\\|${title}]]`;
  }

  it("builds one table per level, deepest first with generic labels", async () => {
    const { app, bodies } = hierarchyWorld();
    bodies.set(
      "Books/My/Bible/Plots/Main.md",
      "[[Books/My/Scenes/Scene 1]] [[Books/My/Scenes/Scene 5]] [[Books/My/Scenes/Scene 8]]"
    );
    bodies.set(
      "Books/My/Bible/Plots/Sub.md",
      "[[Books/My/Scenes/Scene 2]]"
    );

    const draft = makeDraft({ scenes: hierarchy });
    const result = hierarchyResult();
    const table = await buildPlotTimeline(app, draft, result);

    expect(table.levels?.map((level) => level.level)).toEqual([2, 1, 0]);
    expect(table.levels?.map((level) => level.label)).toEqual([
      "Scene 1, Scene 2, Scene 3, …",
      "Chapter 1, Chapter 2, Chapter 3",
      "Act 1, Act 2",
    ]);
  });

  it("maps each entry to its ancestor for plot and Full Story rows", async () => {
    const { app, bodies } = hierarchyWorld();
    bodies.set(
      "Books/My/Bible/Plots/Main.md",
      "[[Books/My/Scenes/Scene 1]] [[Books/My/Scenes/Scene 5]] [[Books/My/Scenes/Scene 8]]"
    );
    bodies.set("Books/My/Bible/Plots/Sub.md", "[[Books/My/Scenes/Scene 2]]");

    const draft = makeDraft({ scenes: hierarchy });
    const table = await buildPlotTimeline(app, draft, hierarchyResult());
    const chapters = table.levels?.[1];
    const acts = table.levels?.[2];

    expect(chapters?.level).toBe(1);
    expect(chapters?.nodes.get("Scene 1")).toEqual({
      title: "Chapter 1",
      path: "Books/My/Scenes/Chapter 1.md",
    });
    expect(chapters?.nodes.get("Scene 7")).toEqual({
      title: "Chapter 2",
      path: "Books/My/Scenes/Chapter 2.md",
    });
    expect(acts?.nodes.get("Scene 4")).toEqual({
      title: "Act 1",
      path: "Books/My/Scenes/Act 1.md",
    });
    expect(acts?.nodes.get("Scene 8")).toEqual({
      title: "Act 2",
      path: "Books/My/Scenes/Act 2.md",
    });
  });

  it("renders the chapter and act tables with deduplicated nodes", async () => {
    const { app, bodies } = hierarchyWorld();
    bodies.set(
      "Books/My/Bible/Plots/Main.md",
      "[[Books/My/Scenes/Scene 1]] [[Books/My/Scenes/Scene 5]] [[Books/My/Scenes/Scene 8]]"
    );
    bodies.set("Books/My/Bible/Plots/Sub.md", "[[Books/My/Scenes/Scene 2]]");

    const draft = makeDraft({ scenes: hierarchy });
    const result = hierarchyResult();
    const table = await buildPlotTimeline(app, draft, result);
    const rendered = renderTimelinePlotTable(result, table);

    // Scene 3 and Scene 4 share time group 2 and Chapter 1, so the ancestor
    // appears once; time group 4 spans two chapters and keeps both in order.
    expect(rendered).toContain(
      [
        "### Level 1 — Chapter 1, Chapter 2, Chapter 3",
        "",
        "| Subplot | 1 | 2 | 3 | 4 | 5 |",
        "| --- | --- | --- | --- | --- | --- |",
        `| Full Story | ${link("Chapter 1")} | ${link(
          "Chapter 1"
        )} | ${link("Chapter 2")} | ${link("Chapter 2")}<br>${link(
          "Chapter 3"
        )} | ${link("Chapter 3")} |`,
        `| Main | ${link("Chapter 1")} |  | ${link(
          "Chapter 2"
        )} | ${link("Chapter 3")} |  |`,
        `| Sub | ${link("Chapter 1")} |  |  |  |  |`,
      ].join("\n")
    );

    expect(rendered).toContain(
      [
        "### Level 0 — Act 1, Act 2",
        "",
        "| Subplot | 1 | 2 | 3 | 4 | 5 |",
        "| --- | --- | --- | --- | --- | --- |",
        `| Full Story | ${link("Act 1")} | ${link("Act 1")} | ${link(
          "Act 1"
        )} | ${link("Act 1")}<br>${link("Act 2")} | ${link("Act 2")} |`,
        `| Main | ${link("Act 1")} |  | ${link("Act 1")} | ${link(
          "Act 2"
        )} |  |`,
        `| Sub | ${link("Act 1")} |  |  |  |  |`,
      ].join("\n")
    );

    expect(rendered.match(/\| Subplot \|/g)).toHaveLength(3);
    expect(rendered.indexOf("### Level 2")).toBeLessThan(
      rendered.indexOf("### Level 1")
    );
    expect(rendered.indexOf("### Level 1")).toBeLessThan(
      rendered.indexOf("### Level 0")
    );
  });

  it("puts a blank line between every level heading and its table", async () => {
    const { app, bodies } = hierarchyWorld();
    bodies.set(
      "Books/My/Bible/Plots/Main.md",
      "[[Books/My/Scenes/Scene 1]] [[Books/My/Scenes/Scene 5]] [[Books/My/Scenes/Scene 8]]"
    );
    bodies.set("Books/My/Bible/Plots/Sub.md", "[[Books/My/Scenes/Scene 2]]");

    const draft = makeDraft({ scenes: hierarchy });
    const result = hierarchyResult();
    const table = await buildPlotTimeline(app, draft, result);
    const rendered = renderTimelinePlotTable(result, table);
    const lines = rendered.split("\n");

    for (const level of table.levels ?? []) {
      const headingIndex = lines.findIndex((line) =>
        line.startsWith(`### Level ${level.level} `)
      );
      expect(headingIndex).toBeGreaterThanOrEqual(0);
      expect(lines[headingIndex + 1]).toBe("");
      expect(lines[headingIndex + 2]).toBe(
        "| Subplot | 1 | 2 | 3 | 4 | 5 |"
      );
      expect(lines[headingIndex + 3]).toBe(
        "| --- | --- | --- | --- | --- | --- |"
      );
      expect(lines[headingIndex + 4]).toMatch(/^\| Full Story \|/);
    }
    expect(rendered).toContain(
      "\n\n### These scenes have not been mentioned in any subplot line"
    );
  });

  it("keeps the <br>-joined time header with empty parts omitted", () => {
    const result = makeResult({
      units: ["day", "hour", "minute"],
      primaryUnit: "day",
      secondaryUnit: "day",
      entries: [
        entry("Scene 1", "Scenes/Scene 1.md", {
          day: 1,
          hour: 8,
          minute: 0,
        }),
      ],
    });
    const table: TimelinePlotTable = {
      columns: timelinePlotColumns(result),
      lines: [
        { name: "Full Story", fullStory: true, mentions: new Set<string>() },
      ],
      unmentioned: [],
    };

    expect(renderTimelinePlotTable(result, table)).toBe(
      [
        "| Subplot | 01<br>08:00 |",
        "| --- | --- |",
        "| Full Story | [[Scenes/Scene 1\\|Scene 1]] |",
      ].join("\n")
    );
  });

  it("uses the deepest table structure for every level, changing only links", async () => {
    const { app, bodies } = hierarchyWorld();
    bodies.set(
      "Books/My/Bible/Plots/Main.md",
      "[[Books/My/Scenes/Scene 1]] [[Books/My/Scenes/Scene 5]] [[Books/My/Scenes/Scene 8]]"
    );
    bodies.set("Books/My/Bible/Plots/Sub.md", "[[Books/My/Scenes/Scene 2]]");

    const draft = makeDraft({ scenes: hierarchy });
    const result = hierarchyResult();
    const table = await buildPlotTimeline(app, draft, result);
    const rendered = renderTimelinePlotTable(result, table);

    // Collect each level's table rows in render order.
    const blocks: string[][] = [];
    for (const line of rendered.split("\n")) {
      if (line.startsWith("### Level ")) {
        blocks.push([]);
      } else if (line.startsWith("|") && blocks.length > 0) {
        blocks[blocks.length - 1].push(line);
      }
    }

    // The only table definition is the deepest one; every level reuses it.
    expect(table.columns.map((column) => column.key)).toEqual(
      timelinePlotColumns(result).map((column) => column.key)
    );
    expect(blocks).toHaveLength(3);

    const [deepest, ...ancestors] = blocks;
    for (const block of ancestors) {
      // Same header, separator, row count, row names, and column count.
      expect(block).toHaveLength(deepest.length);
      expect(block[0]).toBe(deepest[0]);
      expect(block[1]).toBe(deepest[1]);
      expect(block.map((row) => row.split(" | ")[0])).toEqual(
        deepest.map((row) => row.split(" | ")[0])
      );
    }

    // Only the cell links change: scenes, then their chapters, then acts.
    expect(deepest.join("\n")).toContain(link("Scene 1"));
    expect(ancestors[0].join("\n")).toContain(link("Chapter 1"));
    expect(ancestors[1].join("\n")).toContain(link("Act 1"));
    expect(ancestors[0].join("\n")).not.toContain(link("Scene 1"));
    expect(ancestors[1].join("\n")).not.toContain(link("Chapter 1"));
  });

  it("keeps the unmentioned section once, after every level table", async () => {
    const { app, bodies } = hierarchyWorld();
    bodies.set(
      "Books/My/Bible/Plots/Main.md",
      "[[Books/My/Scenes/Scene 1]] [[Books/My/Scenes/Scene 5]] [[Books/My/Scenes/Scene 8]]"
    );
    bodies.set("Books/My/Bible/Plots/Sub.md", "[[Books/My/Scenes/Scene 2]]");

    const draft = makeDraft({ scenes: hierarchy });
    const result = hierarchyResult();
    const table = await buildPlotTimeline(app, draft, result);
    const rendered = renderTimelinePlotTable(result, table);

    const heading =
      "### These scenes have not been mentioned in any subplot line";
    expect(rendered.match(new RegExp(heading, "g"))).toHaveLength(1);
    expect(rendered.indexOf(heading)).toBeGreaterThan(
      rendered.indexOf("### Level 0")
    );
    expect(table.unmentioned.map((timelineEntry) => timelineEntry.sceneTitle))
      .toEqual([
        "Scene 3",
        "Scene 4",
        "Scene 6",
        "Scene 7",
        "Scene 9",
        "Scene 10",
      ]);
  });

  it("renders one unlabeled table when the hierarchy has only one level", async () => {
    const { app, bodies } = hierarchyWorld();
    bodies.set("Books/My/Bible/Plots/Main.md", "[[Books/My/Scenes/Scene 1]]");

    const draft = makeDraft({
      scenes: [
        { title: "Scene 1", indent: 0 },
        { title: "Scene 2", indent: 0 },
      ],
    });
    const result = makeResult({
      format: "number",
      units: ["number"],
      primaryUnit: "number",
      secondaryUnit: "number",
      entries: [
        entry("Scene 1", "Books/My/Scenes/Scene 1.md", { number: 1 }),
        entry("Scene 2", "Books/My/Scenes/Scene 2.md", { number: 2 }),
      ],
    });
    const table = await buildPlotTimeline(app, draft, result);
    const rendered = renderTimelinePlotTable(result, table);

    expect(table.levels?.map((level) => level.level)).toEqual([0]);
    expect(rendered).not.toContain("### Level");
    expect(rendered.startsWith("| Subplot | 1 | 2 |")).toBe(true);
  });
});

describe("plot timeline table rendering", () => {
  const result = makeResult({
    units: ["hour", "minute", "second"],
    primaryUnit: "hour",
    secondaryUnit: "minute",
    entries: [
      entry("Scene 1", "Scenes/Scene 1.md", {
        hour: 9,
        minute: 0,
        second: 0,
      }),
      entry("Scene 2", "Scenes/Scene 2.md", {
        hour: 9,
        minute: 30,
        second: 0,
      }),
      entry("Scene 3", "Scenes/Scene 3.md", {
        hour: 10,
        minute: 0,
        second: 0,
      }),
    ],
  });

  const table: TimelinePlotTable = {
    columns: timelinePlotColumns(result),
    lines: [
      { name: "Full Story", fullStory: true, mentions: new Set<string>() },
      {
        name: "Main",
        fullStory: false,
        mentions: new Set(["Scene 1"]),
      },
      {
        name: "A Plot",
        fullStory: false,
        mentions: new Set(["Scene 2"]),
      },
    ],
    unmentioned: [result.entries[2]],
  };

  it("transposes scenes into plot rows and time columns", () => {
    expect(renderTimelinePlotTable(result, table)).toBe(
      [
        "| Subplot | 09<br>00 | 09<br>30<br>00 | 10<br>00 |",
        "| --- | --- | --- | --- |",
        "| Full Story | [[Scenes/Scene 1\\|Scene 1]] | [[Scenes/Scene 2\\|Scene 2]] | [[Scenes/Scene 3\\|Scene 3]] |",
        "| Main | [[Scenes/Scene 1\\|Scene 1]] |  |  |",
        "| A Plot |  | [[Scenes/Scene 2\\|Scene 2]] |  |",
        "",
        "### These scenes have not been mentioned in any subplot line",
        "Fill them in in the subplot grid or mention them in the subplot notes.",
        "",
        "[[Scenes/Scene 3\\|Scene 3]]",
      ].join("\n")
    );
  });

  it("keeps the scene table when no plot table is supplied", () => {
    const rendered = renderTimeline(result);

    expect(rendered).toContain("| | | | |");
    expect(rendered).toContain("| --- | --- | --- | --- |");
    expect(rendered).toContain("[[Scenes/Scene 1\\|Scene 1]]");
    expect(rendered).not.toContain("| Subplot |");
  });

  it("keeps the Problems note unchanged", () => {
    const rendered = renderTimeline(
      makeResult({
        errors: [
          {
            sceneTitle: "Scene 1",
            kind: "format",
            message: "does not match the configured format.",
          },
        ],
      }),
      table
    );

    expect(rendered).toContain("## Problems");
    expect(rendered).not.toContain("| Subplot |");
    expect(rendered).not.toContain("Full Story");
  });
});

describe("buildTimeline", () => {
  it("collects leaf scenes, skips containers, sorts, and reports problems", async () => {
    const { app, frontmatter } = makeWorld([
      "Books/My/Scenes/Scene 1.md",
      "Books/My/Scenes/Scene 2.md",
      "Books/My/Scenes/Scene 3.md",
      "Books/My/Scenes/Scene 4.md",
      "Books/My/Scenes/Scene 5.md",
      "Books/My/Scenes/Scene 6.md",
    ]);
    frontmatter.set("Books/My/Scenes/Scene 1.md", {
      timeframe: "04/03/2026 09:30",
    });
    frontmatter.set("Books/My/Scenes/Scene 2.md", {
      timeframe: "05/03/2026 10:00",
    });
    frontmatter.set("Books/My/Scenes/Scene 3.md", {
      timeframe: "06/03/2026",
    });
    frontmatter.set("Books/My/Scenes/Scene 5.md", {
      timeframe: "not a date",
    });
    frontmatter.set("Books/My/Scenes/Scene 6.md", {
      timeframe: "32/03/2026 10:00",
    });

    const draft = makeDraft({
      scenes: [
        { title: "Act 1", indent: 0 },
        { title: "Scene 1", indent: 1 },
        { title: "Scene 2", indent: 1 },
        { title: "Scene 3", indent: 1 },
        { title: "Scene 4", indent: 1 },
        { title: "Scene 5", indent: 1 },
        { title: "Scene 6", indent: 1 },
      ],
    });

    const result = await buildTimeline(app, draft);

    expect(result.entries.map((scene) => scene.sceneTitle)).toEqual([
      "Scene 1",
      "Scene 2",
    ]);
    expect(result.entries[0].values).toEqual({
      day: 4,
      month: 3,
      year: 2026,
      hour: 9,
      minute: 30,
    });
    expect(result.missing).toEqual(["Scene 4"]);
    // The structural Act is not a timeline event and has no timeframe entry.
    expect(result.missing).not.toContain("Act 1");
    expect(
      result.errors
        .map((error) => `${error.sceneTitle}:${error.kind}`)
        .sort()
    ).toEqual([
      "Scene 3:inconsistent",
      "Scene 5:format",
      "Scene 6:range",
    ]);
    expect(result.units).toEqual([
      "year",
      "month",
      "day",
      "hour",
      "minute",
    ]);
    expect(result.primaryUnit).toBe("day");
    expect(result.secondaryUnit).toBe("day");
  });

  it("sorts number timelines and keeps duplicate values", async () => {
    const { app, frontmatter } = makeWorld([
      "Books/My/Scenes/Scene 10.md",
      "Books/My/Scenes/Scene 2.md",
      "Books/My/Scenes/Scene 1.md",
    ]);
    frontmatter.set("Books/My/Scenes/Scene 10.md", { timeframe: 10 });
    frontmatter.set("Books/My/Scenes/Scene 2.md", { timeframe: 2 });
    frontmatter.set("Books/My/Scenes/Scene 1.md", { timeframe: 1 });

    const draft = makeDraft({
      timeFormat: "number",
      scenes: [
        { title: "Scene 10", indent: 0 },
        { title: "Scene 2", indent: 0 },
        { title: "Scene 1", indent: 0 },
      ],
    });

    const result = await buildTimeline(app, draft);

    expect(result.entries.map((scene) => scene.sceneTitle)).toEqual([
      "Scene 1",
      "Scene 2",
      "Scene 10",
    ]);
    // `number` is not part of the coarsest-first unit list, so a number
    // timeline reports no present units; headers still use the primary unit.
    expect(result.units).toEqual([]);
    expect(result.primaryUnit).toBe("number");
    expect(result.secondaryUnit).toBe("number");
    expect(result.errors).toEqual([]);
    expect(timelinePlotColumns(result).map((column) => column.header)).toEqual([
      "1",
      "2",
      "10",
    ]);
  });

  it("accepts partial time-only values", async () => {
    const { app, frontmatter } = makeWorld([
      "Books/My/Scenes/Scene 1.md",
      "Books/My/Scenes/Scene 2.md",
    ]);
    frontmatter.set("Books/My/Scenes/Scene 1.md", { timeframe: "09:30" });
    frontmatter.set("Books/My/Scenes/Scene 2.md", { timeframe: "10:15" });

    const draft = makeDraft({
      timeFormat: "time",
      scenes: [
        { title: "Scene 1", indent: 0 },
        { title: "Scene 2", indent: 0 },
      ],
    });

    const result = await buildTimeline(app, draft);

    expect(result.entries.map((scene) => scene.values)).toEqual([
      { hour: 9, minute: 30 },
      { hour: 10, minute: 15 },
    ]);
    expect(result.units).toEqual(["hour", "minute"]);
    expect(result.errors).toEqual([]);
  });
});

describe("writeTimeline", () => {
  it("skips writing when disabled or when there is nothing to report", async () => {
    const disabled = makeWorld([]);
    await writeTimeline(
      disabled.app,
      makeDraft({ timelineEnabled: false }),
      makeResult({ entries: [entry("Scene 1", "Scenes/Scene 1.md", {})] })
    );
    expect(disabled.generated.size).toBe(0);

    const empty = makeWorld([]);
    await writeTimeline(empty.app, makeDraft(), makeResult());
    expect(empty.generated.size).toBe(0);
  });

  it("writes the scene table with a custom output path", async () => {
    const { app, generated } = makeWorld([]);
    const result = makeResult({
      units: ["day", "hour", "minute"],
      primaryUnit: "day",
      secondaryUnit: "hour",
      entries: [
        entry("Scene 1", "Scenes/Scene 1.md", {
          day: 1,
          hour: 9,
          minute: 30,
        }),
      ],
    });

    await writeTimeline(
      app,
      makeDraft({
        plotGridEnabled: false,
        timelineOutputPath: "Output/$1-timeline",
      }),
      result
    );

    const contents = generated.get("Books/My/Output/Book-timeline.md");
    expect(contents).toBeDefined();
    expect(contents).toContain("# Story Timeline");
    expect(contents).toContain("```mermaid");
    expect(contents).toContain("| | | | |");
    expect(contents).not.toContain("| Subplot |");
  });

  it("writes the transposed plot table when the plot grid is enabled", async () => {
    const { app, bodies, generated } = makeWorld([
      "Books/My/Bible/Plots/Main.md",
    ]);
    bodies.set("Books/My/Bible/Plots/Main.md", "Scene 1");

    await writeTimeline(
      app,
      makeDraft({
        plotGridEnabled: true,
        scenes: [{ title: "Scene 1", indent: 0 }],
      }),
      makeResult({
        units: ["number"],
        primaryUnit: "number",
        secondaryUnit: "number",
        entries: [entry("Scene 1", "Books/My/Scenes/Scene 1.md", { number: 1 })],
      })
    );

    const contents = generated.get("Books/My/Build/Book_timeline.md");
    expect(contents).toContain("```mermaid");
    expect(contents).toContain("| Subplot |");
    expect(contents).toContain("| Full Story |");
    expect(contents).toContain("| Main |");
  });

  it("writes Problems instead of tables when the timeline has errors", async () => {
    const { app, generated } = makeWorld([]);

    await writeTimeline(
      app,
      makeDraft({ plotGridEnabled: true }),
      makeResult({
        errors: [
          {
            sceneTitle: "Scene 1",
            kind: "format",
            message: "does not match the configured format.",
          },
        ],
      })
    );

    const contents = generated.get("Books/My/Build/Book_timeline.md");
    expect(contents).toContain("## Problems");
    expect(contents).not.toContain("| Subplot |");
    expect(contents).not.toContain("```mermaid");
  });
});

describe("scene timeline rendering", () => {
  it("renders number entries as chronological Mermaid sections", () => {
    const result = makeResult({
      title: "Book: One",
      format: "number",
      units: ["number"],
      primaryUnit: "number",
      secondaryUnit: "number",
      entries: [
        entry("Scene 1", "Scenes/Scene 1.md", { number: 1 }),
        entry("Scene 2", "Scenes/Scene 2.md", { number: 2 }),
        entry("Scene 3", "Scenes/Scene 3.md", { number: 3 }),
      ],
    });

    const rendered = renderTimeline(result);

    expect(rendered).toContain("```mermaid");
    expect(rendered).toContain("    title Book - One");
    expect(rendered).toContain("    section Timeline");
    expect(rendered).toContain("        1 : Scene 1");
    expect(rendered).toContain("        2 : Scene 2");
    expect(rendered).toContain("        3 : Scene 3");
  });

  it("groups date entries by primary unit and nests the between units", () => {
    const result = makeResult({
      units: ["day", "hour", "minute"],
      primaryUnit: "day",
      secondaryUnit: "hour",
      entries: [
        entry("Scene 1", "Scenes/Scene 1.md", {
          day: 1,
          hour: 8,
          minute: 30,
        }),
        entry("Scene 2", "Scenes/Scene 2.md", {
          day: 1,
          hour: 8,
          minute: 45,
        }),
        entry("Scene 3", "Scenes/Scene 3.md", {
          day: 1,
          hour: 9,
          minute: 0,
        }),
        entry("Scene 4", "Scenes/Scene 4.md", {
          day: 2,
          hour: 8,
          minute: 0,
        }),
      ],
    });

    const rendered = renderTimeline(result);

    expect(rendered).toContain("    section 01");
    expect(rendered).toContain("    section 02");
    expect(rendered).toContain("        08 : 30<br>Scene 1");
    expect(rendered).toContain(": 45<br>Scene 2");
    expect(rendered).toContain("        09 : 00<br>Scene 3");
    expect(rendered).toContain("        08 : 00<br>Scene 4");
    // Entries in the same period share one period label.
    expect(rendered.match(/ {8}08 : /g)).toHaveLength(2);
  });

  it("combines the Mermaid timeline with a supplied plot table", () => {
    const result = makeResult({
      units: ["number"],
      primaryUnit: "number",
      secondaryUnit: "number",
      entries: [entry("Scene 1", "Scenes/Scene 1.md", { number: 1 })],
    });
    const table: TimelinePlotTable = {
      columns: timelinePlotColumns(result),
      lines: [
        { name: "Full Story", fullStory: true, mentions: new Set<string>() },
      ],
      unmentioned: [],
    };

    const rendered = renderTimeline(result, table);

    expect(rendered.indexOf("```mermaid")).toBeGreaterThanOrEqual(0);
    expect(rendered.indexOf("| Subplot |")).toBeGreaterThan(
      rendered.indexOf("```mermaid")
    );
    expect(rendered).toContain("| Full Story |");
  });
});

describe("timeline mention matching", () => {
  const columns = [
    { key: "plotgrid_scene_1", title: "Scene 1", path: ["Scene 1"] },
  ];

  it("does not match a title embedded in a longer number", () => {
    const mentions = plotTimelineMentions(
      {
        path: "Bible/Plots/Main.md",
        name: "Main",
        body: "Scene 10 is the only event.",
        frontmatter: {},
      },
      [
        entry("Scene 1", "Scenes/Scene 1.md", {}),
        entry("Scene 10", "Scenes/Scene 10.md", {}),
      ],
      columns
    );

    expect(mentions.has("Scene 10")).toBe(true);
    expect(mentions.has("Scene 1")).toBe(false);
  });

  it("matches links by path, heading target, and alias", () => {
    const mentions = plotTimelineMentions(
      {
        path: "Bible/Plots/Main.md",
        name: "Main",
        body:
          "[[Scenes/Scene 3#Beat|Third]] and [[Scenes/Scene 1|First]]; " +
          "[[Other/Scene 2]] matches by basename.",
        frontmatter: {},
      },
      [
        entry("Scene 1", "Scenes/Scene 1.md", {}),
        entry("Scene 2", "Scenes/Scene 2.md", {}),
        entry("Scene 3", "Scenes/Scene 3.md", {}),
        entry("Scene 4", "Scenes/Scene 4.md", {}),
      ],
      columns
    );

    expect(Array.from(mentions).sort()).toEqual([
      "Scene 1",
      "Scene 2",
      "Scene 3",
    ]);
  });

  it("reads nested frontmatter values and non-empty cell arrays", () => {
    const mentions = plotTimelineMentions(
      {
        path: "Bible/Plots/Main.md",
        name: "Main",
        body: "",
        frontmatter: {
          plotgrid_scene_1: ["mentioned"],
          refs: ["Scene 2"],
          nested: { text: "Scene 3" },
          count: 4,
          done: true,
        },
      },
      [
        entry("Scene 1", "Scenes/Scene 1.md", {}),
        entry("Scene 2", "Scenes/Scene 2.md", {}),
        entry("Scene 3", "Scenes/Scene 3.md", {}),
      ],
      columns
    );

    expect(Array.from(mentions).sort()).toEqual([
      "Scene 1",
      "Scene 2",
      "Scene 3",
    ]);
  });
});

describe("timeline levels with generic scene depth", () => {
  it("uses scene hierarchy ancestors and ignores non-scene grid cells", async () => {
    const { app, bodies, frontmatter } = makeWorld([
      "Books/My/Bible/Plots/Main.md",
      "Books/My/Bible/Plots/Sub.md",
    ]);
    // Main has a chapter-level cell, which is not a scene-level mention.
    frontmatter.set("Books/My/Bible/Plots/Main.md", {
      plotgrid_chapter_a: "yes",
    });
    bodies.set(
      "Books/My/Bible/Plots/Main.md",
      "[[Books/My/Scenes/Scene 1]]"
    );
    bodies.set("Books/My/Bible/Plots/Sub.md", "[[Books/My/Scenes/Scene 3]]");

    const draft = makeDraft({
      timeFormat: "number",
      scenes: [
        { title: "Act A", indent: 0 },
        { title: "Chapter A", indent: 2 },
        { title: "Scene 1", indent: 4 },
        { title: "Scene 2", indent: 4 },
        { title: "Act B", indent: 0 },
        { title: "Chapter B", indent: 2 },
        { title: "Scene 3", indent: 4 },
      ],
    });
    const result = makeResult({
      format: "number",
      units: ["number"],
      primaryUnit: "number",
      secondaryUnit: "number",
      entries: [
        entry("Scene 1", "Books/My/Scenes/Scene 1.md", { number: 1 }),
        entry("Scene 2", "Books/My/Scenes/Scene 2.md", { number: 2 }),
        entry("Scene 3", "Books/My/Scenes/Scene 3.md", { number: 3 }),
      ],
    });

    const table = await buildPlotTimeline(app, draft, result);

    expect(table.levels?.map((level) => level.level)).toEqual([2, 1, 0]);
    expect(table.levels?.map((level) => level.label)).toEqual([
      "Scene 1, Scene 2, Scene 3",
      "Chapter A, Chapter B",
      "Act A, Act B",
    ]);
    expect(table.levels?.[1].nodes.get("Scene 1")).toEqual({
      title: "Chapter A",
      path: "Books/My/Scenes/Chapter A.md",
    });
    expect(table.levels?.[1].nodes.get("Scene 3")).toEqual({
      title: "Chapter B",
      path: "Books/My/Scenes/Chapter B.md",
    });
    expect(table.levels?.[2].nodes.get("Scene 2")).toEqual({
      title: "Act A",
      path: "Books/My/Scenes/Act A.md",
    });
    // The chapter-level cell did not mark Scene 1; only the body link did.
    expect(table.lines[1].mentions.has("Scene 1")).toBe(true);
    expect(
      table.unmentioned.map((timelineEntry) => timelineEntry.sceneTitle)
    ).toEqual(["Scene 2"]);
  });
});

describe("timeline display names", () => {
  it("uses the configured plot label for the table's first column", () => {
    const result = makeResult({
      entries: [
        entry("Scene 1", "Books/My/Scenes/Scene 1.md", {
          year: 2020,
          month: 1,
          day: 1,
          hour: 1,
          minute: 0,
          second: 0,
        }),
      ],
    });
    const table: TimelinePlotTable = {
      columns: timelinePlotColumns(result),
      lines: [
        { name: "Full Story", fullStory: true, mentions: new Set<string>() },
      ],
      unmentioned: [],
    };

    expect(renderTimelinePlotTable(result, table, "Thread")).toContain(
      "| Thread |"
    );
    expect(renderTimeline(result, table, "Thread")).toContain("| Thread |");
    // The default remains the singular form of the default display name.
    expect(renderTimelinePlotTable(result, table)).toContain("| Subplot |");
  });
});
