import { describe, expect, it } from "vitest";

import {
  entriesFromItemOrder,
  indentedTreeVisibility,
  toggleCollapsedItem,
} from "src/view/explorer/indented-tree";
import type { IndentedScene } from "src/model/types";

describe("indentedTreeVisibility", () => {
  const tree: IndentedScene[] = [
    { title: "act 1", indent: 0 },
    { title: "chapter 1", indent: 1 },
    { title: "scene 1", indent: 2 },
    { title: "scene 2", indent: 2 },
    { title: "act 2", indent: 0 },
    { title: "chapter 2", indent: 1 },
  ];

  it("hides descendants of collapsed entries until the next sibling", () => {
    expect(indentedTreeVisibility(tree, ["act 1"])).toEqual([
      { hidden: false, collapsible: true },
      { hidden: true, collapsible: true },
      { hidden: true, collapsible: false },
      { hidden: true, collapsible: false },
      { hidden: false, collapsible: true },
      { hidden: false, collapsible: false },
    ]);
  });

  it("collapses only from the entry's own indent", () => {
    expect(indentedTreeVisibility(tree, ["chapter 1"])).toEqual([
      { hidden: false, collapsible: true },
      { hidden: false, collapsible: true },
      { hidden: true, collapsible: false },
      { hidden: true, collapsible: false },
      { hidden: false, collapsible: true },
      { hidden: false, collapsible: false },
    ]);
  });

  it("keeps same-indent siblings visible and marks leaves as non-collapsible", () => {
    expect(
      indentedTreeVisibility(
        [
          { title: "a", indent: 0 },
          { title: "b", indent: 0 },
          { title: "c", indent: 0 },
        ],
        ["a", "b"]
      )
    ).toEqual([
      { hidden: false, collapsible: false },
      { hidden: false, collapsible: false },
      { hidden: false, collapsible: false },
    ]);
  });

  it("does not hide anything when nothing is collapsed", () => {
    expect(indentedTreeVisibility(tree, [])).toEqual(
      tree.map((_entry, index) => ({
        hidden: false,
        collapsible:
          index < tree.length - 1 && tree[index + 1].indent > tree[index].indent,
      }))
    );
  });
});

describe("toggleCollapsedItem", () => {
  it("adds and removes an item without mutating the array", () => {
    const initial = ["act 1"];
    const expanded = toggleCollapsedItem(initial, "act 1");
    const collapsed = toggleCollapsedItem(expanded, "act 2");

    expect(initial).toEqual(["act 1"]);
    expect(expanded).toEqual([]);
    expect(collapsed).toEqual(["act 2"]);
  });
});

describe("entriesFromItemOrder", () => {
  it("uses the live drag indent for the dragged item only", () => {
    expect(
      entriesFromItemOrder(
        [
          { name: "a", indent: 0 },
          { name: "b", indent: 1 },
          { name: "c", indent: 2 },
        ],
        "b",
        3
      )
    ).toEqual([
      { title: "a", indent: 0 },
      { title: "b", indent: 3 },
      { title: "c", indent: 2 },
    ]);
  });

  it("keeps every indent when nothing is dragging", () => {
    expect(
      entriesFromItemOrder(
        [
          { name: "a", indent: 0 },
          { name: "b", indent: 2 },
        ],
        null,
        0
      )
    ).toEqual([
      { title: "a", indent: 0 },
      { title: "b", indent: 2 },
    ]);
  });
});
