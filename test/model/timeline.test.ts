import { describe, expect, it } from "vitest";

import type { App, TFile } from "obsidian";

import {
  buildPlotTimeline,
  plotTimelineMentions,
  readTimelinePlotNotes,
  renderTimeline,
  renderTimelinePlotTable,
  timelinePlotColumns,
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
};

function makeWorld(files: string[]): FakeWorld {
  const bodies = new Map<string, string>();
  const frontmatter = new Map<string, Record<string, unknown>>();
  for (const file of files) {
    bodies.set(file, "");
    frontmatter.set(file, {});
  }

  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => {
        if (path === "Books/My/Book.md") {
          return { parent: { path: "Books/My" } };
        }
        return null;
      },
      getMarkdownFiles: () =>
        Array.from(bodies.keys()).map((path) => {
          const name = path.slice(path.lastIndexOf("/") + 1);
          return {
            path,
            basename: name.replace(/\.md$/i, ""),
          } as TFile;
        }),
      read: async (file: TFile) => bodies.get(file.path) ?? "",
    },
    metadataCache: {
      getFileCache: (file: { path: string }) => ({
        frontmatter: frontmatter.get(file.path),
      }),
    },
  } as unknown as App;

  return { app, bodies, frontmatter };
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
