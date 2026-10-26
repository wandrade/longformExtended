import { describe, expect, it } from "vitest";

import { arraysToIndentedScenes } from "src/model/draft-utils";

describe("arraysToIndentedScenes", () => {
  it("converts nested scenes without mutating the input", () => {
    const raw = [
      "act 1",
      ["chapter 1", ["scene 1"], ["scene 2"]],
      ["chapter 2", "scene 3"],
    ];
    const snapshot = JSON.parse(JSON.stringify(raw));
    const expected = [
      { title: "act 1", indent: 0 },
      { title: "chapter 1", indent: 1 },
      { title: "scene 1", indent: 2 },
      { title: "scene 2", indent: 2 },
      { title: "chapter 2", indent: 1 },
      { title: "scene 3", indent: 1 },
    ];

    expect(arraysToIndentedScenes(raw)).toEqual(expected);

    // The metadata cache's frontmatter array must survive repeated syncs.
    expect(raw).toEqual(snapshot);
    expect(raw[1]).toEqual(["chapter 1", ["scene 1"], ["scene 2"]]);
    expect(arraysToIndentedScenes(raw)).toEqual(expected);
  });

  it("handles deeper nesting", () => {
    const raw = ["a", ["b", ["c", ["d"]]]];
    const snapshot = JSON.parse(JSON.stringify(raw));

    expect(arraysToIndentedScenes(raw)).toEqual([
      { title: "a", indent: 0 },
      { title: "b", indent: 1 },
      { title: "c", indent: 2 },
      { title: "d", indent: 3 },
    ]);
    expect(raw).toEqual(snapshot);
  });

  it("leaves empty arrays alone", () => {
    const raw: unknown[] = [];

    expect(arraysToIndentedScenes(raw)).toEqual([]);
    expect(raw).toEqual([]);
  });
});
