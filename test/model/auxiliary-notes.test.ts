import { describe, expect, it } from "vitest";

import { reconcileAuxiliaryList } from "src/model/auxiliary-notes";
import type { IndentedScene } from "src/model/types";

describe("reconcileAuxiliaryList", () => {
  it("keeps overlay order and indentation when notes still exist", () => {
    const overlay: IndentedScene[] = [
      { title: "Villain", indent: 0 },
      { title: "Henchman", indent: 1 },
      { title: "Hero", indent: 0 },
    ];

    expect(reconcileAuxiliaryList(overlay, ["Hero", "Villain", "Henchman"]))
      .toEqual({ list: overlay, dirty: false });
  });

  it("prunes deleted notes and appends new notes alphabetically at root", () => {
    const overlay: IndentedScene[] = [
      { title: "Gone", indent: 1 },
      { title: "Hero", indent: 0 },
    ];

    expect(
      reconcileAuxiliaryList(overlay, [
        "Villain",
        "Hero",
        "Ally",
      ])
    ).toEqual({
      list: [
        { title: "Hero", indent: 0 },
        { title: "Ally", indent: 0 },
        { title: "Villain", indent: 0 },
      ],
      dirty: true,
    });
  });

  it("drops duplicate overlay entries", () => {
    const overlay: IndentedScene[] = [
      { title: "Hero", indent: 0 },
      { title: "Hero", indent: 1 },
    ];

    expect(reconcileAuxiliaryList(overlay, ["Hero"])).toEqual({
      list: [{ title: "Hero", indent: 0 }],
      dirty: true,
    });
  });
});
