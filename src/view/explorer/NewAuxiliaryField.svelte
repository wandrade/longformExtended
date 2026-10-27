<script lang="ts">
  import { getContext } from "svelte";
  import { selectedDraft } from "src/model/stores";
  import type { AuxiliaryNoteKind } from "src/model/auxiliary-notes";
  import {
    noteGroupEntries,
    noteGroupSingularName,
  } from "src/model/note-groups";
  import { invalidFilenameCharacters, isValidFilename } from "../utils";

  export let kind: AuxiliaryNoteKind;

  let newName: string = "";
  let newNameInput: HTMLElement;
  let error: string | null = null;

  function lowerFirst(value: string): string {
    return value.length > 0
      ? `${value[0].toLowerCase()}${value.slice(1)}`
      : value;
  }

  $: nounCapitalized =
    $selectedDraft && $selectedDraft.format === "scenes"
      ? noteGroupSingularName($selectedDraft, kind)
      : "";
  $: noun = lowerFirst(nounCapitalized);
  $: entries =
    $selectedDraft && $selectedDraft.format === "scenes"
      ? noteGroupEntries($selectedDraft, kind)
      : [];

  $: {
    if (newName.length === 0) {
      error = null;
    } else if (entries.some((entry) => entry.title === newName)) {
      error = `A ${noun} with this name already exists in this draft.`;
    } else if (!isValidFilename(newName)) {
      error = `A ${noun} name cannot contain the characters: ${invalidFilenameCharacters()}`;
    } else {
      error = null;
    }
  }

  const onNewAuxiliary: (
    kind: AuxiliaryNoteKind,
    name: string,
    open: boolean
  ) => void = getContext("onNewAuxiliary");

  function onNewEnter(open: boolean) {
    if (newName.length > 0 && !error) {
      onNewAuxiliary(kind, newName, open);
      newName = "";
    }
  }
</script>

<div class="new-auxiliary-container">
  <input
    id={`new-${kind}`}
    type="text"
    placeholder={`New ${nounCapitalized}`}
    bind:value={newName}
    bind:this={newNameInput}
    on:keydown={(e) => {
      if (e.key === "Enter") {
        onNewEnter(!e.shiftKey);
      } else if (e.key === "Escape") {
        newName = "";
        newNameInput.blur();
      }
    }}
    class:invalid={!!error}
  />
  {#if error}
    <p>{error}</p>
  {/if}
</div>

<style>
  .new-auxiliary-container {
    margin: 0;
    padding: var(--size-4-2) 0;
  }

  .new-auxiliary-container input {
    width: 100%;
    background: var(--background-modifier-form-field);
    border: var(--input-border-width) solid var(--background-modifier-border);
    border-radius: var(--input-radius);
    font-size: var(--font-ui-small);
    padding: var(--size-4-1) var(--size-4-2);
  }

  .new-auxiliary-container input.invalid {
    color: var(--text-error);
  }
</style>
