<script lang="ts">
  import { auxiliaryKindPluralLabel } from "src/model/auxiliary-notes";
  import { type NotesTab, selectedNotesTab } from "src/view/stores";

  export let tab: NotesTab;

  $: label =
    tab === "Plots" ? auxiliaryKindPluralLabel("plots", true) : tab;
</script>

<button
  class="sub-tab-button"
  class:selected={$selectedNotesTab === tab}
  on:click={() => selectedNotesTab.set(tab)}
>
  {#if tab == "Scenes"}
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="clickable-icon lucide lucide-gallery-horizontal-end"
      ><path d="M2 7v10" /><path d="M6 5v14" /><rect
        width="12"
        height="18"
        x="10"
        y="3"
        rx="2"
      /></svg
    >
  {/if}
  {#if tab == "Plots"}
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="clickable-icon lucide lucide-git-branch"
      ><line x1="6" x2="6" y1="3" y2="15" /><circle cx="18" cy="6" r="3" /><circle
        cx="6"
        cy="18"
        r="3"
      /><path d="M18 9a9 9 0 0 1-9 9" /></svg
    >
  {/if}
  {#if tab == "Characters"}
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="clickable-icon lucide lucide-users"
      ><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle
        cx="9"
        cy="7"
        r="4"
      /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path
        d="M16 3.13a4 4 0 0 1 0 7.75"
      /></svg
    >
  {/if}
  {label}
</button>

<style>
  .sub-tab-button {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    padding: 0 0.8em 0.3em;
    box-shadow: none;
    margin: 0 0.4em 0 0;
    color: var(--tab-text-color-focused);
    font-size: var(--tab-font-size);
    font-weight: var(--tab-font-weight);
    white-space: nowrap;
  }

  .sub-tab-button:hover {
    color: var(--tab-text-color-focused);
    background-color: var(--background-modifier-hover);
  }

  .sub-tab-button.selected {
    color: var(--tab-text-color-focused-active);
    border-bottom-color: var(--interactive-accent);
  }
</style>
