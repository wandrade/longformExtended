<script lang="ts">
  import { last } from "lodash";
  import { Notice, normalizePath } from "obsidian";
  import { draftForPath, projectFolderPath } from "src/model/scene-navigation";
  import {
    formatNoteGroupNames,
    noteGroupDirectoryConflictMessage,
    noteGroupDirectoryConflicts,
    noteGroupDisplayName,
    noteGroupSingularName,
    parseNoteGroupNames,
    type NoteGroupDirectoryConflict,
  } from "src/model/note-groups";
  import {
    DEFAULT_CHARACTERS_DISPLAY_NAME,
    DEFAULT_PLOTS_DISPLAY_NAME,
    DEFAULT_SCENE_DISPLAY_NAME,
    defaultNoteGroupFolder,
    type MultipleSceneDraft,
    type NoteGroup,
  } from "src/model/types";
  import { pluginSettings, projects } from "src/model/stores";
  import {
    drafts,
    selectedDraft,
    selectedDraftVaultPath,
  } from "src/model/stores";
  import { getContext, onMount } from "svelte";
  import Disclosure from "../components/Disclosure.svelte";
  import Icon from "../components/Icon.svelte";
  import { FileSuggest } from "../settings/file-suggest";
  import { FolderSuggest } from "../settings/folder-suggest";
  import {
    selectedDraftWordCountStatus,
    goalProgress,
    activeFile,
  } from "../stores";
  import DraftList from "./DraftList.svelte";
  import { useApp } from "../utils";

  const app = useApp();

  let showMetdata = true;
  let showWordCount = true;
  let showDrafts = true;
  let showNoteGroups = true;
  let showKanban = true;
  let showTimeline = true;
  let showPlotGrid = true;

  function titleChanged(event: Event) {
    let newTitle = (event.target as any).value;
    drafts.update((_drafts) => {
      const currentDraftIndex = _drafts.findIndex(
        (d) => d.vaultPath === $selectedDraftVaultPath
      );
      if (currentDraftIndex >= 0) {
        const currentDraft = _drafts[currentDraftIndex];
        const currentTitle = currentDraft.title;
        let titleInFrontmatter = true;

        if (newTitle.length === 0) {
          newTitle = last(
            _drafts[currentDraftIndex].vaultPath.split("/")
          ).split(".md")[0];
          titleInFrontmatter = false;
        }

        return _drafts.map((d) => {
          if (d.title === currentTitle) {
            d.title = newTitle;
            d.titleInFrontmatter = titleInFrontmatter;
          }
          return d;
        });
      }
      return _drafts;
    });
  }

  let sceneFolderInput: HTMLInputElement;
  let plotGridPlotsDirInput: HTMLInputElement;
  let plotGridCharactersDirInput: HTMLInputElement;
  onMount(() => {
    if ($selectedDraft && $selectedDraft.format === "scenes") {
      const projectPath = projectFolderPath($selectedDraft, app.vault);
      if (sceneFolderInput) {
        new FolderSuggest(app, sceneFolderInput, projectPath);
      }
      if (plotGridPlotsDirInput) {
        new FolderSuggest(app, plotGridPlotsDirInput, projectPath);
      }
      if (plotGridCharactersDirInput) {
        new FolderSuggest(app, plotGridCharactersDirInput, projectPath);
      }
    }
  });

  $: projectDraft =
    $selectedDraft && $selectedDraft.format === "scenes"
      ? ($selectedDraft as MultipleSceneDraft)
      : null;
  $: projectPath = projectDraft
    ? projectFolderPath(projectDraft, app.vault)
    : null;

  // Display labels come from the project settings and fall back to the
  // defaults when a project leaves them blank.
  $: sceneSingular = projectDraft
    ? noteGroupSingularName(projectDraft, "scenes")
    : "Scene";
  $: plotsSingular = projectDraft
    ? noteGroupSingularName(projectDraft, "plots")
    : "Subplot";
  $: charactersSingular = projectDraft
    ? noteGroupSingularName(projectDraft, "characters")
    : "Character";
  $: scenesPlural = projectDraft
    ? noteGroupDisplayName(projectDraft, "scenes")
    : DEFAULT_SCENE_DISPLAY_NAME;
  $: plotsPlural = projectDraft
    ? noteGroupDisplayName(projectDraft, "plots")
    : DEFAULT_PLOTS_DISPLAY_NAME;
  $: charactersPlural = projectDraft
    ? noteGroupDisplayName(projectDraft, "characters")
    : DEFAULT_CHARACTERS_DISPLAY_NAME;

  function lowerFirst(value: string): string {
    return value.length > 0
      ? `${value[0].toLowerCase()}${value.slice(1)}`
      : value;
  }

  /** Conflicts among the stored folder settings, shown inline. */
  let directoryConflicts: NoteGroupDirectoryConflict[] = [];
  $: {
    if (projectDraft) {
      directoryConflicts = noteGroupDirectoryConflicts(app, projectDraft);
    } else {
      directoryConflicts = [];
    }
  }
  $: builtInConflicts = directoryConflicts.filter(
    (conflict) =>
      !conflict.first.key.startsWith("custom:") &&
      !conflict.second.key.startsWith("custom:")
  );
  $: customConflicts = directoryConflicts.filter(
    (conflict) =>
      conflict.first.key.startsWith("custom:") ||
      conflict.second.key.startsWith("custom:")
  );

  /** Reverts a conflicting folder input and reports the conflict. */
  function rejectInvalidDirectories(
    candidate: MultipleSceneDraft,
    input: HTMLInputElement,
    storedValue: string
  ): boolean {
    const conflicts = noteGroupDirectoryConflicts(app, candidate);
    if (conflicts.length === 0) {
      return false;
    }
    input.value = storedValue;
    new Notice(noteGroupDirectoryConflictMessage(conflicts));
    return true;
  }

  /**
   * Attaches a folder autocomplete to a dynamically rendered group input.
   * The action runs once per element; duplicate listeners are avoided because
   * Svelte may re-run it when the project path changes.
   */
  const suggestedInputs = new WeakSet<HTMLInputElement>();
  function folderSuggest(
    node: HTMLInputElement,
    relativeRoot: string | null
  ): void {
    if (!relativeRoot || suggestedInputs.has(node)) {
      return;
    }
    suggestedInputs.add(node);
    new FolderSuggest(app, node, relativeRoot);
  }

  const suggestedTemplateInputs = new WeakSet<HTMLInputElement>();
  function templateSuggest(node: HTMLInputElement): void {
    if (suggestedTemplateInputs.has(node)) {
      return;
    }
    suggestedTemplateInputs.add(node);
    new FileSuggest(app, node);
  }

  function displayNameChanged(
    field:
      | "sceneDisplayName"
      | "plotsDisplayName"
      | "charactersDisplayName",
    event: Event
  ) {
    const value = (event.target as HTMLInputElement).value.trim();
    if (!$selectedDraft) {
      return;
    }
    drafts.update((allDrafts) =>
      allDrafts.map((d) => {
        if (d.vaultPath === $selectedDraftVaultPath && d.format === "scenes") {
          d[field] = value;
        }
        return d;
      })
    );
  }

  /**
   * Reconciles the configured group names with the existing definitions.
   * Existing groups keep their folder and order/indent overlay, new names get
   * a folder defaulting to the underscored name, and removed names leave
   * configuration only: their folders and notes are never touched.
   */
  function noteGroupNamesChanged(event: Event) {
    const input = event.target as HTMLInputElement;
    const draft = projectDraft;
    if (!draft) {
      return;
    }

    const names: string[] = [];
    const seen = new Set<string>();
    for (const rawName of parseNoteGroupNames(input.value)) {
      const name = rawName.trim();
      if (name.length === 0 || seen.has(name)) {
        continue;
      }
      seen.add(name);
      names.push(name);
    }

    const existingByName = new Map(
      draft.noteGroups.map((group) => [group.name, group])
    );
    const noteGroups: NoteGroup[] = names.map((name) => {
      const existing = existingByName.get(name);
      return (
        existing ?? {
          name,
          folder: defaultNoteGroupFolder(name),
          template: null,
          entries: [],
        }
      );
    });

    input.value = formatNoteGroupNames(names);
    drafts.update((allDrafts) =>
      allDrafts.map((d) => {
        if (d.vaultPath === $selectedDraftVaultPath && d.format === "scenes") {
          d.noteGroups = noteGroups;
        }
        return d;
      })
    );
  }

  function noteGroupFolderChanged(group: NoteGroup, event: Event) {
    const input = event.target as HTMLInputElement;
    const draft = projectDraft;
    if (!draft) {
      return;
    }
    const value =
      input.value.trim().length > 0
        ? input.value.trim()
        : defaultNoteGroupFolder(group.name);
    const candidate: MultipleSceneDraft = {
      ...draft,
      noteGroups: draft.noteGroups.map((candidateGroup) =>
        candidateGroup.name === group.name
          ? { ...candidateGroup, folder: value }
          : candidateGroup
      ),
    };
    if (rejectInvalidDirectories(candidate, input, group.folder)) {
      return;
    }

    input.value = value;
    drafts.update((allDrafts) =>
      allDrafts.map((d) => {
        if (d.vaultPath === $selectedDraftVaultPath && d.format === "scenes") {
          d.noteGroups = d.noteGroups.map((candidateGroup) =>
            candidateGroup.name === group.name
              ? { ...candidateGroup, folder: value }
              : candidateGroup
          );
        }
        return d;
      })
    );
  }

  async function noteGroupTemplateChanged(
    group: NoteGroup,
    event: Event
  ): Promise<void> {
    const input = event.target as HTMLInputElement;
    const draft = projectDraft;
    if (!draft) {
      return;
    }

    const value = input.value.trim();
    if (value.length > 0 && !(await app.vault.adapter.exists(value))) {
      input.value = group.template ?? "";
      return;
    }

    const template = value.length > 0 ? value : null;
    drafts.update((allDrafts) =>
      allDrafts.map((d) => {
        if (d.vaultPath === $selectedDraftVaultPath && d.format === "scenes") {
          d.noteGroups = d.noteGroups.map((candidateGroup) =>
            candidateGroup.name === group.name
              ? { ...candidateGroup, template }
              : candidateGroup
          );
        }
        return d;
      })
    );
  }

  async function sceneFolderChanged(event: Event) {
    const input = event.target as HTMLInputElement;
    const newFolder = input.value;
    const draft = $selectedDraft;
    if (
      newFolder.length <= 0 ||
      !draft ||
      draft.format !== "scenes"
    ) {
      return;
    }

    const candidate: MultipleSceneDraft = { ...draft, sceneFolder: newFolder };
    if (rejectInvalidDirectories(candidate, input, draft.sceneFolder)) {
      return;
    }

    const root = app.vault.getAbstractFileByPath(draft.vaultPath).parent.path;
    const path = normalizePath(`${root}/${newFolder}`);
    const exists = await app.vault.adapter.exists(path);
    if (exists) {
      drafts.update((allDrafts) =>
        allDrafts.map((d) => {
          if (
            d.vaultPath === $selectedDraftVaultPath &&
            d.format === "scenes"
          ) {
            d.sceneFolder = newFolder;
          }
          return d;
        })
      );
    }
  }

  let sceneTemplateInput: HTMLInputElement;
  let plotTemplateInput: HTMLInputElement;
  let characterTemplateInput: HTMLInputElement;
  onMount(() => {
    if ($selectedDraft?.format === "scenes") {
      if (sceneTemplateInput) {
        new FileSuggest(app, sceneTemplateInput);
      }
      if (plotTemplateInput) {
        new FileSuggest(app, plotTemplateInput);
      }
      if (characterTemplateInput) {
        new FileSuggest(app, characterTemplateInput);
      }
    }
  });
  async function templateChanged(
    field: "sceneTemplate" | "plotTemplate" | "characterTemplate",
    event: Event
  ) {
    let newTemplate = (event.target as any).value;
    if (!$selectedDraft) {
      return;
    }
    let exists = true;
    if (newTemplate.length <= 0) {
      newTemplate = null;
    } else {
      exists = await app.vault.adapter.exists(newTemplate);
    }

    if (exists) {
      drafts.update((allDrafts) =>
        allDrafts.map((d) => {
          if (
            d.vaultPath === $selectedDraftVaultPath &&
            d.format === "scenes"
          ) {
            d[field] = newTemplate;
          }
          return d;
        })
      );
    }
  }

  function sceneTemplateChanged(event: Event) {
    return templateChanged("sceneTemplate", event);
  }

  function plotTemplateChanged(event: Event) {
    return templateChanged("plotTemplate", event);
  }

  function characterTemplateChanged(event: Event) {
    return templateChanged("characterTemplate", event);
  }

  function timeframeTagNameChanged(event: Event) {
    const value = (event.target as any).value;
    if (value.length <= 0 || !$selectedDraft) {
      return;
    }
    drafts.update((allDrafts) =>
      allDrafts.map((d) => {
        if (d.vaultPath === $selectedDraftVaultPath && d.format === "scenes") {
          d.timeframeTagName = value;
        }
        return d;
      })
    );
  }

  function timeFormatChanged(event: Event) {
    const value = (event.target as any).value;
    if (value.length <= 0 || !$selectedDraft) {
      return;
    }
    drafts.update((allDrafts) =>
      allDrafts.map((d) => {
        if (d.vaultPath === $selectedDraftVaultPath && d.format === "scenes") {
          d.timeFormat = value;
        }
        return d;
      })
    );
  }

  function kanbanColumnsChanged(event: Event) {
    const value = (event.target as any).value;
    if (!$selectedDraft) {
      return;
    }
    drafts.update((allDrafts) =>
      allDrafts.map((d) =>
        d.vaultPath === $selectedDraftVaultPath && d.format === "scenes"
          ? { ...d, kanbanColumns: value }
          : d
      )
    );
  }

  function kanbanOutputPathChanged(event: Event) {
    const value = (event.target as any).value;
    if (!$selectedDraft) {
      return;
    }
    drafts.update((allDrafts) =>
      allDrafts.map((d) =>
        d.vaultPath === $selectedDraftVaultPath && d.format === "scenes"
          ? { ...d, kanbanOutputPath: value }
          : d
      )
    );
  }

  function kanbanShowUnassignedChanged(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    if (!$selectedDraft) {
      return;
    }
    drafts.update((allDrafts) =>
      allDrafts.map((d) =>
        d.vaultPath === $selectedDraftVaultPath && d.format === "scenes"
          ? { ...d, kanbanShowUnassigned: checked }
          : d
      )
    );
  }

  function kanbanSaveWordCountsChanged(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    if (!$selectedDraft) {
      return;
    }
    drafts.update((allDrafts) =>
      allDrafts.map((d) =>
        d.vaultPath === $selectedDraftVaultPath && d.format === "scenes"
          ? { ...d, kanbanSaveWordCounts: checked }
          : d
      )
    );
  }

  function kanbanEnabledChanged(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    if (!$selectedDraft) {
      return;
    }
    drafts.update((allDrafts) =>
      allDrafts.map((d) =>
        d.vaultPath === $selectedDraftVaultPath && d.format === "scenes"
          ? { ...d, kanbanEnabled: checked }
          : d
      )
    );
  }

  function kanbanIncludePlotsChanged(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    if (!$selectedDraft) {
      return;
    }
    drafts.update((allDrafts) =>
      allDrafts.map((d) =>
        d.vaultPath === $selectedDraftVaultPath && d.format === "scenes"
          ? { ...d, kanbanIncludePlots: checked }
          : d
      )
    );
  }

  function timelineEnabledChanged(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    if (!$selectedDraft) {
      return;
    }
    drafts.update((allDrafts) =>
      allDrafts.map((d) =>
        d.vaultPath === $selectedDraftVaultPath && d.format === "scenes"
          ? { ...d, timelineEnabled: checked }
          : d
      )
    );
  }

  function timelineOutputPathChanged(event: Event) {
    const value = (event.target as any).value;
    if (!$selectedDraft) {
      return;
    }
    drafts.update((allDrafts) =>
      allDrafts.map((d) =>
        d.vaultPath === $selectedDraftVaultPath && d.format === "scenes"
          ? { ...d, timelineOutputPath: value }
          : d
      )
    );
  }

  function plotGridEnabledChanged(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    if (!$selectedDraft) {
      return;
    }
    drafts.update((allDrafts) =>
      allDrafts.map((d) =>
        d.vaultPath === $selectedDraftVaultPath && d.format === "scenes"
          ? { ...d, plotGridEnabled: checked }
          : d
      )
    );
  }

  function plotGridOutputPathChanged(event: Event) {
    const value = (event.target as any).value;
    if (!$selectedDraft) {
      return;
    }
    drafts.update((allDrafts) =>
      allDrafts.map((d) =>
        d.vaultPath === $selectedDraftVaultPath && d.format === "scenes"
          ? { ...d, plotGridOutputPath: value }
          : d
      )
    );
  }

  function plotGridPlotsDirChanged(event: Event) {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    const draft = $selectedDraft;
    if (!draft || draft.format !== "scenes") {
      return;
    }
    const candidate: MultipleSceneDraft = {
      ...draft,
      plotGridPlotsDir: value,
    };
    if (
      rejectInvalidDirectories(candidate, input, draft.plotGridPlotsDir)
    ) {
      return;
    }
    drafts.update((allDrafts) =>
      allDrafts.map((d) =>
        d.vaultPath === $selectedDraftVaultPath && d.format === "scenes"
          ? { ...d, plotGridPlotsDir: value }
          : d
      )
    );
  }

  function plotGridCharactersDirChanged(event: Event) {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    const draft = $selectedDraft;
    if (!draft || draft.format !== "scenes") {
      return;
    }
    const candidate: MultipleSceneDraft = {
      ...draft,
      plotGridCharactersDir: value,
    };
    if (
      rejectInvalidDirectories(candidate, input, draft.plotGridCharactersDir)
    ) {
      return;
    }
    drafts.update((allDrafts) =>
      allDrafts.map((d) =>
        d.vaultPath === $selectedDraftVaultPath && d.format === "scenes"
          ? { ...d, plotGridCharactersDir: value }
          : d
      )
    );
  }

  let projectCount: number;
  let draftCount: number | null;
  let sceneCount: number | null;
  $: {
    if ($selectedDraftWordCountStatus) {
      const { scene, draft, project } = $selectedDraftWordCountStatus;

      projectCount = project;
      draftCount = $projects[$selectedDraft.title].length > 1 ? draft : null;
      sceneCount = $selectedDraft.format === "scenes" ? scene : null;
    }
  }

  let showProgress = false;
  $: {
    if ($activeFile && $selectedDraft) {
      const draft = draftForPath($activeFile.path, $drafts);
      showProgress = draft && draft.vaultPath === $selectedDraft.vaultPath;
    }
  }

  let goalPercentage: number;
  let goalDescription: string;
  $: {
    goalPercentage = Math.ceil(Math.min($goalProgress, 1) * 100);
    goalDescription = `${Math.round(
      $goalProgress * $pluginSettings.sessionGoal
    )}/${$pluginSettings.sessionGoal}`;
  }

  function pluralize(
    count: number,
    noun: string,
    pluralNoun: string | null = null
  ) {
    if (count === undefined) {
      return "";
    }
    if (count === 1) {
      return `${count.toLocaleString()} ${noun}`;
    } else if (pluralNoun) {
      return `${count.toLocaleString()} ${pluralNoun}`;
    } else {
      return `${count.toLocaleString()} ${noun}s`;
    }
  }

  const showNewDraftModal: () => void = getContext("showNewDraftModal");
  function onNewDraft() {
    showNewDraftModal();
  }
</script>

<div>
  {#if $selectedDraft}
    <div class="longform-extended-project-section">
      <div
        class="longform-extended-project-details-section-header"
        on:click={() => {
          showMetdata = !showMetdata;
        }}
      >
        <Disclosure collapsed={!showMetdata} />
        <h4>Project Metadata</h4>
      </div>
      {#if showMetdata}
        <div>
          <label for="longform-extended-project-title">Title</label>
          <input
            id="longform-extended-project-title"
            type="text"
            value={$selectedDraft.title}
            on:change={titleChanged}
          />
          {#if $selectedDraft.format === "scenes"}
            <label for="longform-extended-project-scenes-display-name"
              >Scenes Display Name</label
            >
            <input
              id="longform-extended-project-scenes-display-name"
              type="text"
              value={$selectedDraft.sceneDisplayName}
              placeholder={DEFAULT_SCENE_DISPLAY_NAME}
              on:blur={(event) =>
                displayNameChanged("sceneDisplayName", event)}
            />
            <label for="longform-extended-project-plots-display-name"
              >Subplots Display Name</label
            >
            <input
              id="longform-extended-project-plots-display-name"
              type="text"
              value={$selectedDraft.plotsDisplayName}
              placeholder={DEFAULT_PLOTS_DISPLAY_NAME}
              on:blur={(event) =>
                displayNameChanged("plotsDisplayName", event)}
            />
            <label for="longform-extended-project-characters-display-name"
              >Characters Display Name</label
            >
            <input
              id="longform-extended-project-characters-display-name"
              type="text"
              value={$selectedDraft.charactersDisplayName}
              placeholder={DEFAULT_CHARACTERS_DISPLAY_NAME}
              on:blur={(event) =>
                displayNameChanged("charactersDisplayName", event)}
            />
            <p class="longform-extended-project-warning">
              Display names change labels throughout Longform Extended.
              Folders, note paths, and frontmatter do not change. Leave a
              field blank to use the default.
            </p>
            <label for="longform-extended-project-scene-folder"
              >{sceneSingular} Folder</label
            >
            <input
              id="longform-extended-project-scene-folder"
              type="text"
              value={$selectedDraft.sceneFolder}
              bind:this={sceneFolderInput}
              on:blur={sceneFolderChanged}
            />
            <p class="longform-extended-project-warning">
              Changing this folder does not move {scenesPlural.toLowerCase()}.
              If you’re moving {scenesPlural.toLowerCase()} to a new folder,
              move them in your vault first, then change this setting.
            </p>
            <label for="longform-extended-project-plot-grid-plots-dir"
              >{plotsSingular} Folder</label
            >
            <input
              id="longform-extended-project-plot-grid-plots-dir"
              type="text"
              value={$selectedDraft.plotGridPlotsDir}
              bind:this={plotGridPlotsDirInput}
              on:blur={plotGridPlotsDirChanged}
            />
            <p class="longform-extended-project-warning">
              Changing this folder does not move
              {plotsPlural.toLowerCase()}. Relative to the project folder.
              Defaults to "Subplots".
            </p>
            <label for="longform-extended-project-plot-grid-characters-dir"
              >{charactersSingular} Folder</label
            >
            <input
              id="longform-extended-project-plot-grid-characters-dir"
              type="text"
              value={$selectedDraft.plotGridCharactersDir}
              bind:this={plotGridCharactersDirInput}
              on:blur={plotGridCharactersDirChanged}
            />
            <p class="longform-extended-project-warning">
              Changing this folder does not move
              {charactersPlural.toLowerCase()}. Relative to the project folder.
              Defaults to "Characters".
            </p>
            {#if builtInConflicts.length > 0}
              <p class="longform-extended-project-error">
                {noteGroupDirectoryConflictMessage(builtInConflicts)}
              </p>
            {/if}
            <label for="longform-extended-project-scene-template"
              >{sceneSingular} Template</label
            >
            <input
              id="longform-extended-project-scene-template"
              type="text"
              value={$selectedDraft.sceneTemplate}
              bind:this={sceneTemplateInput}
              on:blur={sceneTemplateChanged}
            />
            <p class="longform-extended-project-warning">
              This file will be used as a template when creating new
              {scenesPlural.toLowerCase()} via the New {sceneSingular}… field.
              If you use a templating plugin (Templater or the core plugin) it
              will be used to process this template.
            </p>
            <label for="longform-extended-project-plot-template"
              >{plotsSingular} Template</label
            >
            <input
              id="longform-extended-project-plot-template"
              type="text"
              value={$selectedDraft.plotTemplate}
              bind:this={plotTemplateInput}
              on:blur={plotTemplateChanged}
            />
            <p class="longform-extended-project-warning">
              This file will be used as a template when creating new
              {plotsPlural.toLowerCase()} via the New {plotsSingular}… field.
              If you use a templating plugin (Templater or the core plugin) it
              will be used to process this template.
            </p>
            <label for="longform-extended-project-character-template"
              >{charactersSingular} Template</label
            >
            <input
              id="longform-extended-project-character-template"
              type="text"
              value={$selectedDraft.characterTemplate}
              bind:this={characterTemplateInput}
              on:blur={characterTemplateChanged}
            />
            <p class="longform-extended-project-warning">
              This file will be used as a template when creating new
              {charactersPlural.toLowerCase()} via the New
              {charactersSingular}… field. If you use a templating plugin
              (Templater or the core plugin) it will be used to process this
              template.
            </p>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
  {#if $selectedDraft && $selectedDraft.format === "scenes"}
    <div class="longform-extended-project-section">
      <div
        class="longform-extended-project-details-section-header"
        on:click={() => {
          showNoteGroups = !showNoteGroups;
        }}
      >
        <Disclosure collapsed={!showNoteGroups} />
        <h4>Extra note groups</h4>
      </div>
      {#if showNoteGroups}
        <div>
          <label for="longform-extended-project-note-groups"
            >Extra note groups</label
          >
          <input
            id="longform-extended-project-note-groups"
            type="text"
            value={formatNoteGroupNames(
              $selectedDraft.noteGroups.map((group) => group.name)
            )}
            on:blur={noteGroupNamesChanged}
          />
          <p class="longform-extended-project-warning">
            Group names in order, separated by spaces. Quote names with
            spaces: Locations "Magic System" Factions. Each group gets its own
            Notes tab and folder. Removing a group here does not delete its
            folder or notes.
          </p>
          {#each $selectedDraft.noteGroups as group, index (group.name)}
            <label
              for={`longform-extended-project-note-group-folder-${index}`}
              >{group.name} Folder</label
            >
            <input
              id={`longform-extended-project-note-group-folder-${index}`}
              type="text"
              value={group.folder}
              use:folderSuggest={projectPath}
              on:blur={(event) => noteGroupFolderChanged(group, event)}
            />
            <p class="longform-extended-project-warning">
              Relative to the project folder. Defaults to
              "{defaultNoteGroupFolder(group.name)}".
            </p>
            <label
              for={`longform-extended-project-note-group-template-${index}`}
              >{group.name} Template</label
            >
            <input
              id={`longform-extended-project-note-group-template-${index}`}
              type="text"
              value={group.template ?? ""}
              use:templateSuggest
              on:blur={(event) => noteGroupTemplateChanged(group, event)}
            />
            <p class="longform-extended-project-warning">
              Optional template for new notes in this group. Processed like
              scene templates.
            </p>
          {/each}
          {#if customConflicts.length > 0}
            <p class="longform-extended-project-error">
              {noteGroupDirectoryConflictMessage(customConflicts)}
            </p>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
  {#if $selectedDraft && $selectedDraft.format === "scenes"}
    <div class="longform-extended-project-section">
      <div
        class="longform-extended-project-details-section-header"
        on:click={() => {
          showKanban = !showKanban;
        }}
      >
        <Disclosure collapsed={!showKanban} />
        <h4>Kanban</h4>
      </div>
      {#if showKanban}
        <div>
          <div class="longform-extended-kanban-toggle">
            <input
              id="longform-extended-project-kanban-enabled"
              type="checkbox"
              checked={$selectedDraft.kanbanEnabled}
              on:change={kanbanEnabledChanged}
            />
            <label for="longform-extended-project-kanban-enabled"
              >Enable kanban</label
            >
          </div>
          <label for="longform-extended-project-kanban-columns"
            >Kanban Columns</label
          >
          <input
            id="longform-extended-project-kanban-columns"
            type="text"
            value={$selectedDraft.kanbanColumns}
            on:blur={kanbanColumnsChanged}
          />
          <p class="longform-extended-project-warning">
            Column titles in order, separated by spaces. Quote titles with
            spaces: draft "in progress" review final.
          </p>
          <label for="longform-extended-project-kanban-output-path"
            >Kanban Output Path</label
          >
          <input
            id="longform-extended-project-kanban-output-path"
            type="text"
            value={$selectedDraft.kanbanOutputPath}
            on:blur={kanbanOutputPathChanged}
          />
          <p class="longform-extended-project-warning">
            Relative to the project folder. Start with "/" for the vault root.
            "$1" is replaced with the project title. Defaults to
            "Build/$1_kanban.base".
          </p>
          <div class="longform-extended-kanban-toggle">
            <input
              id="longform-extended-project-kanban-show-unassigned"
              type="checkbox"
              checked={$selectedDraft.kanbanShowUnassigned}
              on:change={kanbanShowUnassignedChanged}
            />
            <label for="longform-extended-project-kanban-show-unassigned"
              >Show notes with no status</label
            >
          </div>
          <div class="longform-extended-kanban-toggle">
            <input
              id="longform-extended-project-kanban-save-word-counts"
              type="checkbox"
              checked={$selectedDraft.kanbanSaveWordCounts}
              on:change={kanbanSaveWordCountsChanged}
            />
            <label for="longform-extended-project-kanban-save-word-counts"
              >Save word counts</label
            >
          </div>
          <div class="longform-extended-kanban-toggle">
            <input
              id="longform-extended-project-kanban-include-plots"
              type="checkbox"
              checked={$selectedDraft.kanbanIncludePlots}
              on:change={kanbanIncludePlotsChanged}
            />
            <label for="longform-extended-project-kanban-include-plots"
              >Include {lowerFirst(plotsPlural)}</label
            >
          </div>
          <p class="longform-extended-project-warning">
            Include notes from the {plotsSingular} Folder on the kanban board,
            alongside project scenes. {charactersPlural} notes are not
            included.
          </p>
        </div>
      {/if}
    </div>
  {/if}
  {#if $selectedDraft && $selectedDraft.format === "scenes"}
    <div class="longform-extended-project-section">
      <div
        class="longform-extended-project-details-section-header"
        on:click={() => {
          showTimeline = !showTimeline;
        }}
      >
        <Disclosure collapsed={!showTimeline} />
        <h4>Timeline</h4>
      </div>
      {#if showTimeline}
        <div>
          <div class="longform-extended-timeline-toggle">
            <input
              id="longform-extended-project-timeline-enabled"
              type="checkbox"
              checked={$selectedDraft.timelineEnabled}
              on:change={timelineEnabledChanged}
            />
            <label for="longform-extended-project-timeline-enabled"
              >Enable timeline</label
            >
          </div>
          <label for="longform-extended-project-timeframe-tag">Timeframe Tag Name</label
          >
          <input
            id="longform-extended-project-timeframe-tag"
            type="text"
            value={$selectedDraft.timeframeTagName}
            on:blur={timeframeTagNameChanged}
          />
          <p class="longform-extended-project-warning">
            The frontmatter property used to place each scene on the
            timeline. Defaults to "timeframe", which works whether you use
            dates, times, or plain numbers.
          </p>
          <label for="longform-extended-project-time-format">Time Format</label>
          <select
            id="longform-extended-project-time-format"
            value={$selectedDraft.timeFormat}
            on:change={timeFormatChanged}
          >
            <option value="epoch-datetime-dmy">Epoch date time (num dd/mm/yyyy hh:mm:ss)</option>
            <option value="epoch-datetime-mdy">Epoch date time (num mm/dd/yyyy hh:mm:ss)</option>
            <option value="datetime">Date time (dd/mm/yyyy hh:mm:ss)</option>
            <option value="time">Time only (hh:mm:ss)</option>
            <option value="number">Chronological order (num)</option>
          </select>
          <p class="longform-extended-project-warning">
            Pick the format with the biggest unit you'll ever need — smaller
            units are optional. e.g. "num dd/mm/yyyy hh:mm" drops seconds,
            "num dd/mm/yyyy" drops the time.
          </p>
          <label for="longform-extended-project-timeline-output-path"
            >Timeline Output Path</label
          >
          <input
            id="longform-extended-project-timeline-output-path"
            type="text"
            value={$selectedDraft.timelineOutputPath}
            on:blur={timelineOutputPathChanged}
          />
          <p class="longform-extended-project-warning">
            Relative to the project folder. Start with "/" for the vault root.
            "$1" is replaced with the project title. Defaults to
            "Build/$1_timeline.md".
          </p>
        </div>
      {/if}
    </div>
  {/if}
  {#if $selectedDraft && $selectedDraft.format === "scenes"}
    <div class="longform-extended-project-section">
      <div
        class="longform-extended-project-details-section-header"
        on:click={() => {
          showPlotGrid = !showPlotGrid;
        }}
      >
        <Disclosure collapsed={!showPlotGrid} />
        <h4>{plotsSingular} Grid</h4>
      </div>
      {#if showPlotGrid}
        <div>
          <div class="longform-extended-plot-grid-toggle">
            <input
              id="longform-extended-project-plot-grid-enabled"
              type="checkbox"
              checked={$selectedDraft.plotGridEnabled}
              on:change={plotGridEnabledChanged}
            />
            <label for="longform-extended-project-plot-grid-enabled"
              >Enable {lowerFirst(plotsSingular)} grid</label
            >
          </div>
          <label for="longform-extended-project-plot-grid-output-path"
            >{plotsSingular} Grid Output Path</label
          >
          <input
            id="longform-extended-project-plot-grid-output-path"
            type="text"
            value={$selectedDraft.plotGridOutputPath}
            on:blur={plotGridOutputPathChanged}
          />
          <p class="longform-extended-project-warning">
            Relative to the project folder. Start with "/" for the vault root.
            "$1" is replaced with the project title. Defaults to
            "Build/$1_plotgrid.base". ".base" is added if omitted.
          </p>
        </div>
      {/if}
    </div>
  {/if}
  <div
    class="longform-extended-project-section word-counts"
    style={`--progress-text-color:${
      goalPercentage >= 43 ? "var(--text-on-accent)" : "var(--text-accent)"
    }`}
  >
    <div
      class="longform-extended-project-details-section-header"
      on:click={() => {
        showWordCount = !showWordCount;
      }}
    >
      <Disclosure collapsed={!showWordCount} />
      <h4>Word Count</h4>
    </div>
    {#if showWordCount}
      <div>
        {#if showProgress}
          <div
            class="progress"
            data-label={goalDescription}
            title={goalDescription}
          >
            <div class="value" style={`width:${goalPercentage}%;`} />
          </div>
        {/if}
        {#if sceneCount}
          <p title="Word count in this scene of this project.">
            <strong>Scene:</strong>
            {pluralize(sceneCount, "word")}
          </p>
        {/if}
        {#if draftCount}
          <p title="Word count in just this draft of this project.">
            <strong>Draft:</strong>
            {pluralize(draftCount, "word")}
          </p>
        {/if}
        <p title="Word count across all drafts of this project.">
          <strong>Project:</strong>
          {pluralize(projectCount, "word")}
        </p>
      </div>
    {/if}
  </div>
  <div class="longform-extended-project-section">
    <div class="drafts-title-container">
      <div
        class="longform-extended-project-details-section-header"
        on:click={() => {
          showDrafts = !showDrafts;
        }}
      >
        <Disclosure collapsed={!showDrafts} />
        <h4>Drafts</h4>
      </div>
      <button type="button" on:click={onNewDraft}>
        <Icon iconName="plus-with-circle" />
      </button>
    </div>
    {#if showDrafts}
      <DraftList />
    {/if}
  </div>
</div>

<style>
  .longform-extended-project-section {
    margin-top: var(--size-4-4);
    padding-bottom: var(--size-4-2);
    padding-left: var(--size-4-8);
  }

  .longform-extended-project-section + .longform-extended-project-section {
    border-top: var(--border-width) solid var(--background-modifier-border);
    padding-top: var(--size-4-4);
  }

  .longform-extended-project-section .right-triangle {
    margin-left: var(--size-4-1);
    margin-right: var(--size-4-2);
  }

  .longform-extended-project-details-section-header {
    display: flex;
    flex-direction: row;
    justify-content: start;
    align-items: center;
    cursor: pointer;
    margin-left: calc(var(--size-4-6) * -1);
  }

  h4 {
    font-size: var(--font-ui-medium);
    color: var(--text-normal);
    user-select: none;
    font-weight: inherit;
    margin: 0 0 0 var(--size-4-4);
  }

  input[type="text"] {
    width: 100%;
  }

  .longform-extended-kanban-toggle,
  .longform-extended-timeline-toggle,
  .longform-extended-plot-grid-toggle {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: var(--size-4-2);
    margin-top: var(--size-4-2);
  }

  .longform-extended-kanban-toggle input[type="checkbox"],
  .longform-extended-timeline-toggle input[type="checkbox"],
  .longform-extended-plot-grid-toggle input[type="checkbox"] {
    width: var(--checkbox-size, 16px);
    height: var(--checkbox-size, 16px);
    flex: none;
    margin: 0;
  }

  .longform-extended-kanban-toggle label,
  .longform-extended-timeline-toggle label,
  .longform-extended-plot-grid-toggle label {
    display: inline;
    margin-top: 0;
    cursor: pointer;
  }

  label {
    display: block;
    font-size: var(--font-ui-smaller);
    color: var(--text-muted);
    margin-top: var(--size-4-4);
    line-height: var(--line-height-tight);
  }

  p.longform-extended-project-warning {
    color: var(--text-faint);
    font-size: var(--font-smallest);
    margin: var(--size-2-1) 0 0 var(--size-2-1);
    line-height: normal;
  }

  p.longform-extended-project-error {
    color: var(--text-error);
    font-size: var(--font-smallest);
    margin: var(--size-2-1) 0 0 var(--size-2-1);
    line-height: normal;
  }

  .word-counts p {
    margin: var(--size-4-2) 0;
    font-size: var(--font-smallest);
    color: var(--text-muted);
  }

  .word-counts p strong {
    color: var(--text-normal);
  }


  .progress {
    height: var(--size-4-6);
    width: 100%;
    background-color: var(--background-secondary-alt);
    border-radius: var(--radius-s);
    position: relative;
    overflow: hidden;
    margin-top: var(--size-4-4);
  }

  .progress:before {
    content: attr(data-label);
    font-size: var(--font-smallest);
    color: var(--progress-text-color);
    font-weight: bold;
    position: absolute;
    text-align: center;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    align-self: center;
    height: 100%;
  }

  .progress .value {
    height: 100%;
    background-color: var(--text-accent);
  }

  .drafts-title-container {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--size-4-2);
  }

  .drafts-title-container h4 {
    margin-right: var(--size-4-2);
  }

  .drafts-title-container button {
    margin: 0;
    padding: var(--size-4-2);
    color: var(--interactive-accent);
    background-color: inherit;
  }
</style>
