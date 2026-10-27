<script lang="ts">
  import { getContext } from "svelte";
  import { selectedDraft } from "src/model/stores";
  import { noteGroupSingularName } from "src/model/note-groups";
  import { invalidFilenameCharacters, isValidFilename } from "../utils";

  let newSceneName: string = "";
  let newSceneInput: HTMLElement;

  function lowerFirst(value: string): string {
    return value.length > 0
      ? `${value[0].toLowerCase()}${value.slice(1)}`
      : value;
  }

  $: sceneNoun =
    $selectedDraft && $selectedDraft.format === "scenes"
      ? noteGroupSingularName($selectedDraft, "scenes")
      : "Scene";
  $: sceneNames =
    $selectedDraft && $selectedDraft.format === "scenes"
      ? $selectedDraft.scenes.map((s) => s.title)
      : [];

  let error: string | null = null;
  $: {
    if (newSceneName.length === 0) {
      error = null;
    } else if (sceneNames.contains(newSceneName)) {
      error = `A ${lowerFirst(sceneNoun)} with this name already exists in this draft.`;
    } else if (!isValidFilename(newSceneName)) {
      error = `A ${lowerFirst(sceneNoun)} name cannot contain the characters: ${invalidFilenameCharacters()}`;
    } else {
      error = null;
    }
  }

  const onNewScene: (name: string, open: boolean) => void =
    getContext("onNewScene");
  function onNewSceneEnter(open: boolean) {
    if (newSceneName.length > 0 && !error) {
      onNewScene(newSceneName, open);
      newSceneName = "";
    }
  }
</script>

<div class="new-scene-container">
  <input
    id="new-scene"
    type="text"
    placeholder={`New ${sceneNoun}`}
    bind:value={newSceneName}
    bind:this={newSceneInput}
    on:keydown={(e) => {
      if (e.key === "Enter") {
        onNewSceneEnter(!e.shiftKey);
      } else if (e.key === "Escape") {
        newSceneName = "";
        newSceneInput.blur();
      }
    }}
    class:invalid={!!error}
  />
  {#if error}
    <p>{error}</p>
  {/if}
</div>

<style>
  .new-scene-container {
    margin: 0;
    padding: var(--size-4-2) 0;
  }

  #new-scene {
    width: 100%;
    background: var(--background-modifier-form-field);
    border: var(--input-border-width) solid var(--background-modifier-border);
    border-radius: var(--input-radius);
    font-size: var(--font-ui-small);
    padding: var(--size-4-1) var(--size-4-2);
  }

  #new-scene.invalid {
    color: var(--text-error);
  }

</style>
