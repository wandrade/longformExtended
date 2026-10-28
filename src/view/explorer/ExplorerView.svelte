<script lang="ts">
  import CompileView from "../compile/CompileView.svelte";

  import { selectedDraft } from "src/model/stores";
  import { selectedNotesTab, selectedTab } from "../stores";
  import { initialized, waitingForSync } from "src/model/stores";

  import NewSceneField from "./NewSceneField.svelte";
  import NewAuxiliaryField from "./NewAuxiliaryField.svelte";
  import ProjectPicker from "./ProjectPicker.svelte";
  import SceneList from "./SceneList.svelte";
  import AuxiliaryNoteList from "./AuxiliaryNoteList.svelte";
  import ProjectDetails from "./ProjectDetails.svelte";
  import StatusView from "./StatusView.svelte";
  import NotesSubTab from "./NotesSubTab.svelte";
  import { noteGroupDescriptors } from "src/model/note-groups";
  import type { AuxiliaryNoteKind } from "src/model/auxiliary-notes";
  import Tab from "./Tab.svelte";

  $: {
    const hasScenesDraft = $selectedDraft?.format === "scenes";
    if (
      !hasScenesDraft &&
      ($selectedTab === "Notes" || $selectedTab === "Status")
    ) {
      $selectedTab = "Project";
    }
  }

  $: noteGroups =
    $selectedDraft && $selectedDraft.format === "scenes"
      ? noteGroupDescriptors($selectedDraft)
      : [];

  // A custom group's tab disappears when the group is removed from the
  // project settings, and a project switch may not have the selected group.
  // Fall back to the manuscript scenes tab in either case.
  $: {
    if (
      noteGroups.length > 0 &&
      !noteGroups.some((group) => group.key === $selectedNotesTab)
    ) {
      selectedNotesTab.set("scenes");
    }
  }

  $: auxiliaryKind =
    $selectedNotesTab === "scenes"
      ? null
      : ($selectedNotesTab as AuxiliaryNoteKind);
</script>

{#if $waitingForSync}
  <div class="longform-extended-sync-wait">
    <div class="longform-extended-spinner"></div>
    <div class="longform-extended-sync-message">
      Waiting for Obsidian Sync to complete...
    </div>
  </div>
{:else if !$initialized}
  <div class="longform-extended-sync-wait">
    <div class="longform-extended-spinner"></div>
    <div class="longform-extended-sync-message">
      Loading projects...
    </div>
  </div>
{:else}
  <div class="longform-extended-explorer">
    <ProjectPicker />
    {#if $selectedDraft && $selectedDraft.format === "scenes"}
      <div>
        <div class="tabs">
          <div class="tab-list">
            <Tab tab="Notes" />
            <Tab tab="Project" />
            <Tab tab="Compile" />
            <Tab tab="Status" />
          </div>
        </div>
        {#if $selectedTab === "Notes"}
          <div class="tab-panel-container">
            <div class="sub-tab-list">
              {#each noteGroups as group (group.key)}
                <NotesSubTab tab={group.key} />
              {/each}
            </div>
            {#if $selectedNotesTab === "scenes"}
              <SceneList />
              <NewSceneField />
            {:else if auxiliaryKind}
              <AuxiliaryNoteList kind={auxiliaryKind} />
              <NewAuxiliaryField kind={auxiliaryKind} />
            {/if}
          </div>
        {:else if $selectedTab === "Project"}
          <div class="tab-panel-container">
            <ProjectDetails />
          </div>
        {:else if $selectedTab === "Status"}
          <div class="tab-panel-container">
            <StatusView />
          </div>
        {:else}
          <div class="tab-panel-container disconnected">
            <CompileView />
          </div>
        {/if}
      </div>
    {:else if $selectedDraft}
      <div>
        <div class="tabs">
          <div class="tab-list">
            <Tab tab="Project" />
            <Tab tab="Compile" />
          </div>
        </div>
        {#if $selectedTab === "Project"}
          <div class="tab-panel-container">
            <ProjectDetails />
          </div>
        {:else}
          <div class="tab-panel-container">
            <CompileView />
          </div>
        {/if}
      </div>
    {:else}
      <p class="longform-extended-empty">
        Select a project to get started.
      </p>
    {/if}
  </div>
{/if}

<style>
  .longform-extended-explorer {
    font-size: var(--longform-extended-explorer-font-size);
  }

  .longform-extended-migrate-button {
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .longform-extended-empty {
    color: var(--text-muted);
    text-align: center;
    padding: var(--size-4-4) 0;
  }

  .longform-extended-migrate-button:hover {
    background-color: var(--interactive-accent-hover);
  }

  .tab-list {
    margin: 0;
    font-size: 0; /* To remove spacing between tabs */
  }

  .sub-tab-list {
    margin: 0 0 var(--size-4-2) 0;
    padding-bottom: var(--size-4-1);
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .tab-panel-container {
    background: var(--background-primary);
    padding: var(--size-4-1) var(--size-4-2);
  }
  
  .tab-panel-container.disconnected {
    background: none;
    padding: 0;
  }

  .longform-extended-sync-wait {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 2rem;
    gap: 1rem;
  }

  .longform-extended-spinner {
    border: 3px solid var(--background-modifier-border);
    border-top: 3px solid var(--text-accent);
    border-radius: 50%;
    width: 24px;
    height: 24px;
    animation: spin 1s linear infinite;
  }

  .longform-extended-sync-message {
    color: var(--text-muted);
    font-size: 0.8em;
    text-align: center;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
</style>
