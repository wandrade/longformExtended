import type { IndentedScene } from "src/model/types";

/** Per-entry display state for an indented note tree. */
export type IndentedTreeVisibility = {
  hidden: boolean;
  collapsible: boolean;
};

export function indentedTreeVisibility(
  entries: IndentedScene[],
  collapsedItems: string[]
): IndentedTreeVisibility[] {
  const result: IndentedTreeVisibility[] = [];
  let ignoringUntilIndent = Infinity;

  entries.forEach((entry, index) => {
    const hidden = entry.indent > ignoringUntilIndent;
    if (!hidden) {
      ignoringUntilIndent = Infinity;
    }

    if (collapsedItems.contains(entry.title)) {
      ignoringUntilIndent = Math.min(ignoringUntilIndent, entry.indent);
    }

    const next = index < entries.length - 1 ? entries[index + 1] : null;
    result.push({
      hidden,
      collapsible: next !== null && next.indent > entry.indent,
    });
  });

  return result;
}

/** Toggles an item's collapsed state, returning a new list. */
export function toggleCollapsedItem(
  collapsedItems: string[],
  itemID: string
): string[] {
  return collapsedItems.contains(itemID)
    ? collapsedItems.filter((item) => item !== itemID)
    : [...collapsedItems, itemID];
}

/**
 * Converts a sortable list's item order into the project's indented overlay.
 * The item being dragged receives the live drag indent; every other item keeps
 * the indent supplied by Sortable.
 */
export function entriesFromItemOrder(
  items: { name: string; indent: number }[],
  draggingID: string | null,
  draggingIndent: number
): IndentedScene[] {
  return items.map((item) => ({
    title: item.name,
    indent: item.name === draggingID ? draggingIndent : item.indent,
  }));
}
