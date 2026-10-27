<script lang="ts">
  import type Sortable from "sortablejs";
  import { getContext } from "svelte";
  import { Keymap, Platform, type PaneType, type TFile } from "obsidian";

  import { activeFile } from "../stores";
  import { drafts, selectedDraft } from "src/model/stores";
  import SortableList from "../sortable/SortableList.svelte";
  import Disclosure from "../components/Disclosure.svelte";
  import type { IndentedScene, MultipleSceneDraft } from "src/model/types";
  import {
    auxiliaryFolder,
    auxiliaryNoteFiles,
    type AuxiliaryNoteKind,
  } from "src/model/auxiliary-notes";
  import {
    noteGroupEntries,
    setNoteGroupEntries,
  } from "src/model/note-groups";
  import { scenePathForFolder } from "src/model/scene-navigation";
  import { selectElementContents, useApp } from "../utils";
  import {
    entriesFromItemOrder,
    indentedTreeVisibility,
    toggleCollapsedItem,
  } from "./indented-tree";

  export let kind: AuxiliaryNoteKind;

  const app = useApp();

  type AuxiliaryItem = {
    id: string;
    name: string;
    path: string;
    indent: number;
    collapsible: boolean;
    hidden: boolean;
  };

  let items: AuxiliaryItem[] = [];
  let collapsedItems: string[] = [];

  $: {
    if ($selectedDraft && $selectedDraft.format === "scenes") {
      items = itemsFromEntries(
        noteGroupEntries($selectedDraft, kind),
        collapsedItems,
        $selectedDraft
      );
    } else {
      items = [];
    }
  }

  function itemsFromEntries(
    entries: IndentedScene[],
    collapsed: string[],
    draft: MultipleSceneDraft
  ): AuxiliaryItem[] {
    const folder = auxiliaryFolder(app, draft, kind);
    const pathByName = new Map(
      auxiliaryNoteFiles(app, draft, kind).map((file) => [
        file.name,
        file.path,
      ])
    );

    const visibility = indentedTreeVisibility(entries, collapsed);
    const result: AuxiliaryItem[] = [];

    entries.forEach((entry, index) => {
      const { hidden, collapsible } = visibility[index];
      result.push({
        id: entry.title,
        name: entry.title,
        path:
          pathByName.get(entry.title) ??
          scenePathForFolder(entry.title, folder),
        indent: entry.indent,
        collapsible,
        hidden,
      });
    });

    return result;
  }

  // INDENTATION & COLLAPSING
  let ghostIndent = 0;
  let draggingIndent = 0;
  let draggingID: string = null;

  let isSorting = false;
  const sortableOptions: Sortable.Options = {
    animation: 150,
    ghostClass: "auxiliary-drag-ghost",
    chosenClass: "auxiliary-drag-chosen",
    dragClass: "auxiliary-drag-dragging",
    fallbackClass: "auxiliary-drag-fallback",
    onStart: () => {
      isSorting = true;
    },
    onEnd: () => {
      isSorting = false;
    },
  };

  function currentDraftIndex(): number {
    if (!$selectedDraft) {
      return -1;
    }
    return $drafts.findIndex(
      (draft) => draft.vaultPath === $selectedDraft.vaultPath
    );
  }

  function itemOrderChanged(event: CustomEvent<AuxiliaryItem[]>) {
    const index = currentDraftIndex();
    if (!$selectedDraft || index < 0 || $selectedDraft.format !== "scenes") {
      return;
    }
    const entries: IndentedScene[] = entriesFromItemOrder(
      event.detail,
      draggingID,
      draggingIndent
    );
    drafts.update((allDrafts) => {
      const draft = allDrafts[index] as MultipleSceneDraft;
      if (draft && draft.format === "scenes") {
        setNoteGroupEntries(draft, kind, entries);
      }
      return allDrafts;
    });
  }

  function itemIndentChanged(
    event: CustomEvent<{
      itemID: string;
      itemIndex: number;
      newIndent: number;
      indentWidth: number;
    }>
  ) {
    draggingID = event.detail.itemID;
    draggingIndent = event.detail.newIndent || 0;
    ghostIndent = draggingIndent * event.detail.indentWidth;
  }

  function collapseItem(itemID: string) {
    collapsedItems = toggleCollapsedItem(collapsedItems, itemID);
  }

  const onAuxiliaryClick: (
    path: string,
    paneType: boolean | PaneType
  ) => void = getContext("onAuxiliaryClick");
  function onItemClick(item: AuxiliaryItem, event: MouseEvent) {
    if (!item.path) {
      return;
    }
    if (
      Platform.isMobile &&
      item.collapsible &&
      $activeFile &&
      item.path === $activeFile.path
    ) {
      collapseItem(item.id);
    } else {
      onAuxiliaryClick(item.path, Keymap.isModEvent(event));
    }
  }

  // Context click and inline editing.
  let editingPath: string | null = null;
  let originalName: string | null = null;

  const onAuxiliaryContextClick: (
    kind: AuxiliaryNoteKind,
    path: string,
    x: number,
    y: number,
    onRename: () => void
  ) => void = getContext("onAuxiliaryContextClick");

  function onContext(event: MouseEvent) {
    if (Platform.isMobileApp) {
      return;
    }
    const { x, y } = event;
    const target = document.elementFromPoint(x, y);
    const container =
      target instanceof Element
        ? target.closest<HTMLElement>("[data-auxiliary-path]")
        : null;
    const path = container ? container.dataset.auxiliaryPath : null;
    if (!path) {
      return;
    }

    onAuxiliaryContextClick(kind, path, x, y, () => {
      editingPath = path;
      const innerElement = activeDocument.querySelector(
        `[data-item-path='${path}']`
      );
      if (!(innerElement instanceof HTMLElement)) {
        return;
      }
      originalName = innerElement.dataset.itemName;
      setTimeout(() => selectElementContents(innerElement), 0);
    });
  }

  function onKeydown(event: KeyboardEvent) {
    if (
      editingPath &&
      event.target instanceof HTMLElement &&
      $selectedDraft &&
      $selectedDraft.format === "scenes"
    ) {
      const newName = event.target.innerText.trim();
      if (event.key === "Enter") {
        if (newName.length > 0 && newName !== originalName) {
          const path = scenePathForFolder(
            newName,
            auxiliaryFolder(app, $selectedDraft, kind)
          );
          const file = app.vault.getAbstractFileByPath(editingPath);
          if (file instanceof TFile) {
            app.fileManager.renameFile(file, path);
          }
        }
        editingPath = null;
        originalName = null;
        return false;
      } else if (event.key === "Escape") {
        event.target.blur();
        return false;
      }
    }
    return true;
  }

  function onBlur(event: FocusEvent) {
    if (event.target instanceof HTMLElement) {
      event.target.innerText = originalName;
    }
    editingPath = null;
    originalName = null;
  }
</script>

<div>
  <div
    id="auxiliary-note-list"
    class:dragging={isSorting}
    style="--ghost-indent: {ghostIndent}px"
  >
    <SortableList
      trackIndents
      bind:items
      let:item
      on:orderChanged={itemOrderChanged}
      on:indentChanged={itemIndentChanged}
      {sortableOptions}
      class="sortable-auxiliary-note-list"
    >
      <div
        class="auxiliary-note-container{item.hidden ? ' hidden' : ''}{item.collapsible ? ' collapsible' : ''}"
        style="padding-left: calc(({item.indent} * var(--longform-extended-explorer-indent-size)) + 6px {item.collapsible ? '' : '+ var(--size-4-4)'});"
        class:selected={$activeFile && $activeFile.path === item.path}
        on:contextmenu|preventDefault={onContext}
        data-auxiliary-path={item.path}
        data-auxiliary-indent={item.indent}
        data-auxiliary-name={item.name}
      >
        {#if item.collapsible}
          <Disclosure
            collapsed={collapsedItems.contains(item.id)}
            on:click={() => {
              collapseItem(item.id);
              return false;
            }}
          />
        {/if}
        <div
          style="width: 100%;"
          data-auxiliary-path={item.path}
          on:click={(e) =>
            typeof item.path === "string" ? onItemClick(item, e) : {}}
        >
          <div
            id={`longform-extended-auxiliary-${item.name}`}
            data-item-path={item.path}
            data-item-name={item.name}
            style="display: inline;"
            on:keydown={item.path === editingPath ? onKeydown : null}
            on:blur={item.path === editingPath ? onBlur : null}
            contenteditable={item.path === editingPath}
          >
            {item.name}
          </div>
        </div>
      </div>
    </SortableList>
  </div>
</div>

<style>
  :global(.group) {
    margin-left: var(--size-4-2);
  }

  #auxiliary-note-list {
    margin: var(--size-4-1) 0;
  }

  #auxiliary-note-list :global(.sortable-auxiliary-note-list) {
    list-style-type: none;
    padding: 0;
    margin: 0;
  }

  .auxiliary-note-container {
    display: flex;
    flex-direction: row;
    align-items: center;
    border: var(--border-width) solid transparent;
    border-radius: var(--radius-s);
    cursor: pointer;
    color: var(--nav-item-color);
    font-size: var(--nav-item-size);
    font-weight: var(--nav-item-weight);
    line-height: var(--line-height-tight);
    padding: var(--size-4-1) var(--size-4-2);
    white-space: normal;
  }

  .auxiliary-note-container.hidden {
    display: none;
  }

  .auxiliary-note-container *:nth-child(2) {
    margin-left: var(--size-4-2);
  }

  .selected,
  :not(.dragging) .auxiliary-note-container:hover {
    background-color: var(--background-secondary-alt);
    color: var(--text-normal);
  }

  .auxiliary-note-container:active {
    background-color: inherit;
    color: var(--text-muted);
  }

  :global(.auxiliary-drag-ghost) {
    background-color: var(--interactive-accent-hover);
    color: var(--text-on-accent);
    margin-left: var(--ghost-indent);
  }
</style>
