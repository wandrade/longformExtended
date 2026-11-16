<script lang="ts">
  // @ts-nocheck
  import type Sortable from "sortablejs";
  import { Notice, type Vault } from "obsidian";

  import {
    type CompileStatus,
    CompileStepKind,
    type CompileStep,
    formatStepKind,
    type Workflow,
    WorkflowError,
    type WorkflowValidationResult,
    calculateWorkflow,
  } from "src/compile";
  import { getContext, onMount, onDestroy } from "svelte";
  import debounce, { type DebouncedFunc } from "lodash/debounce";
  import {
    drafts,
    selectedDraft,
    workflows,
    currentWorkflow,
  } from "src/model/stores";
  import type { WorkflowSync } from "src/model/workflow-sync";
  import type { SerializedStep } from "src/model/types";
  import {
    backfillInstanceIds,
    removeStepById,
    reorderStepsById,
    validateStepEdit,
  } from "src/model/workflow-step-edit";
  import CompileStepView from "./CompileStepView.svelte";
  import SortableList from "../sortable/SortableList.svelte";
  import AutoTextArea from "../components/AutoTextArea.svelte";
  import type { Draft } from "src/model/types";

  let workflowContextButton: HTMLElement;
  let workflowInputState: "hidden" | "new" | "rename" = "hidden";
  let workflowInputValue = "";
  let workflowInput: HTMLElement;
  let allWorkflowNames: string[] = [];
  let currentWorkflowName: string | null = null;
  let compileStatus: HTMLElement;
  let defaultCompileStatus: string;
  let isDeletingWorkflow = false;

  const showConfirmModal: (
    title: string,
    description: string,
    yesText: string,
    yesAction: () => void
  ) => void = getContext("showConfirmModal");

  const workflowSync = getContext<WorkflowSync>("workflowSync");

  // Opening the compile tab performs a workflow sync, then the poll keeps the
  // store fresh without any direct writes from this view.
  onMount(() => {
    void workflowSync?.sync();
  });

  let currentDraftIndex: number;
  $: {
    currentDraftIndex =
      $selectedDraft &&
      $drafts.findIndex((d) => d.vaultPath === $selectedDraft.vaultPath);
  }

  // WORKFLOW MANAGEMENT

  $: allWorkflowNames = Object.keys($workflows).sort();

  function workflowExists(name: string): boolean {
    return allWorkflowNames.includes(name);
  }

  // Description and option text are held here until persisted. Binding them
  // straight into the store let a background merge replace the value while
  // the user was still typing.
  let descriptionDraft = "";
  let descriptionPersisted = "";
  let descriptionFor: string | null = null;

  const pendingDescriptions = new Map<string, string>();
  // One debounce per workflow: a shared one would drop workflow A's edit when
  // the user switches to B before the timer fires.
  const descriptionSavers = new Map<string, DebouncedFunc<() => void>>();
  function saveDescription(name: string) {
    let save = descriptionSavers.get(name);
    if (!save) {
      save = debounce((): void => {
        const value = pendingDescriptions.get(name);
        if (value === undefined) {
          return;
        }
        void workflowSync?.updateWorkflow(name, (stored) => {
          if (stored.description !== value) {
            stored.description = value;
          }
        });
      }, 400);
      descriptionSavers.set(name, save);
    }
    save();
  }

  type PendingOption = {
    name: string;
    stepId: string;
    optionId: string;
    value: unknown;
  };
  let pendingOptions: PendingOption[] = [];
  const saveOptions = debounce(() => {
    const batch = pendingOptions;
    pendingOptions = [];
    const byWorkflow = new Map<string, PendingOption[]>();
    for (const edit of batch) {
      const edits = byWorkflow.get(edit.name) ?? [];
      edits.push(edit);
      byWorkflow.set(edit.name, edits);
    }
    for (const [name, edits] of byWorkflow) {
      void workflowSync?.updateWorkflow(name, (stored) => {
        for (const edit of edits) {
          const index = stored.steps.findIndex(
            (step, position) =>
              (step.instanceId ?? `${step.id}-${position}`) === edit.stepId
          );
          if (index < 0) {
            continue;
          }
          stored.steps[index] = {
            ...stored.steps[index],
            optionValues: {
              ...stored.steps[index].optionValues,
              [edit.optionId]: edit.value,
            },
          };
        }
      });
    }
  }, 400);

  function onStepOptionChange(detail: {
    stepId: string;
    optionId: string;
    value: unknown;
  }) {
    const name = currentWorkflowName;
    if (!name) {
      return;
    }
    pendingOptions.push({ name, ...detail });
    saveOptions();
  }

  onDestroy(() => {
    for (const save of descriptionSavers.values()) {
      save.flush();
    }
    saveOptions.flush();
  });

  $: {
    if ($selectedDraft) {
      currentWorkflowName = $selectedDraft.workflow;

      if (
        !isDeletingWorkflow &&
        $selectedDraft &&
        !currentWorkflowName &&
        allWorkflowNames.length > 0
      ) {
        // shadowed here to prevent circular reference
        const _currentDraftIndex = $drafts.findIndex((d) => d.vaultPath === $selectedDraft.vaultPath);
        $drafts[_currentDraftIndex].workflow = allWorkflowNames[0];
      }
    }
  }

  $: {
    if (currentWorkflowName !== descriptionFor) {
      descriptionFor = currentWorkflowName;
      descriptionDraft = currentWorkflowName
        ? $workflows[currentWorkflowName]?.description ?? ""
        : "";
      descriptionPersisted = descriptionDraft;
    }
  }

  $: {
    if (
      currentWorkflowName &&
      descriptionFor === currentWorkflowName &&
      descriptionDraft !== descriptionPersisted
    ) {
      descriptionPersisted = descriptionDraft;
      pendingDescriptions.set(currentWorkflowName, descriptionDraft);
      saveDescription(currentWorkflowName);
    }
  }

  function selectedWorkflow(event: Event) {
    // @ts-ignore
    const title = event.target.value;
    $drafts[currentDraftIndex].workflow = title;
  }

  const showCompileActionsMenu: (
    x: number,
    y: number,
    currentWorkflowName: string,
    action: (type: "new" | "rename" | "delete") => void
  ) => void = getContext("showCompileActionsMenu");

  async function workflowAction(type: "new" | "rename" | "delete") {
    if (type == "new") {
      // Sync before inserting so a workflow that arrived on another device is
      // known before a new name is chosen.
      await workflowSync?.sync();
      workflowInputState = "new";
    } else if (type == "rename") {
      workflowInputValue = currentWorkflowName;
      workflowInputState = "rename";
    } else if (type == "delete") {
      showConfirmModal(
        `Delete ${currentWorkflowName}?`,
        "Really delete this workflow? This can’t be undone.",
        "Delete",
        () => {
          isDeletingWorkflow = true;

          const toDelete = currentWorkflowName;
          const remaining = allWorkflowNames.filter((n) => n != toDelete);

          void workflowSync
            ?.deleteWorkflow(toDelete)
            .then((result) => {
              if (!result.ok) {
                new Notice(`Could not delete "${toDelete}".`);
                return;
              }
              if (remaining.length > 0) {
                $drafts[currentDraftIndex].workflow = remaining[0];
              } else {
                $drafts[currentDraftIndex].workflow = null;
              }
            })
            .finally(() => {
              isDeletingWorkflow = false;
            });
        }
      );
    }
  }

  async function onWorkflowInputEnter() {
    if (workflowInputValue.length == 0) {
      return;
    }

    const name = workflowInputValue;
    if (workflowInputState == "new") {
      if (workflowExists(name)) {
        new Notice(`A workflow named "${name}" already exists.`);
        return;
      }
      const result = await workflowSync?.createWorkflow(name);
      if (!result?.ok) {
        new Notice(`Could not create workflow "${name}".`);
        return;
      }
      $drafts[currentDraftIndex].workflow = name;
    } else if (workflowInputState == "rename") {
      if (currentWorkflowName && currentWorkflowName !== name) {
        if (workflowExists(name)) {
          new Notice(`A workflow named "${name}" already exists.`);
          return;
        }
        const result = await workflowSync?.renameWorkflow(
          currentWorkflowName,
          name
        );
        if (!result?.ok) {
          new Notice(`Could not rename to "${name}".`);
          return;
        }
        $drafts[currentDraftIndex].workflow = name;
      }
    }
    workflowInputValue = "";
    workflowInputState = "hidden";
  }

  /** Applies a step-array edit by id through the sync pipeline, never the store. */
  async function editSteps(
    name: string | null,
    edit: (steps: SerializedStep[]) => SerializedStep[],
    delta = 0
  ): Promise<void> {
    if (!name) {
      return;
    }
    const result = await workflowSync?.updateWorkflow(name, (stored) => {
      backfillInstanceIds(stored.steps);
      const expected = stored.steps.length + delta;
      stored.steps = edit(stored.steps);
      validateStepEdit(stored.steps, expected);
    });
    if (result && !result.ok && result.reason !== "no-change") {
      new Notice("Could not update the workflow steps.");
      resetStepItems();
    }
  }

  function focusOnInit(el: HTMLElement) {
    el.focus();
  }

  // VALIDATION

  const openCompileStepMenu: () => Promise<CompileStep | null> =
    getContext("openCompileStepMenu");
  async function addStep() {
    const step = await openCompileStepMenu();
    if (!step) {
      return;
    }
    void editSteps(currentWorkflowName, (steps) => {
      steps.push({
        id: step.description.canonicalID,
        instanceId: `${step.id}-${Date.now()}`,
        optionValues: {},
      });
      return steps;
    }, 1);
  }

  const VALID = {
    error: WorkflowError.Valid,
    stepPosition: 0,
  };
  let validation: WorkflowValidationResult = VALID;
  let calculatedKinds: CompileStepKind[] = [];
  $: {
    if ($currentWorkflow) {
      [validation, calculatedKinds] = calculateWorkflow(
        $currentWorkflow,
        $selectedDraft.format === "scenes"
      );
    } else {
      validation = VALID;
      calculatedKinds = [];
    }
  }

  function kindAtIndex(index: number): CompileStepKind | null {
    return index < calculatedKinds.length ? calculatedKinds[index] : null;
  }

  function errorAtIndex(index: number): string | null {
    if (
      validation.error !== WorkflowError.Valid &&
      validation.stepPosition === index
    ) {
      return validation.error;
    }
    return null;
  }

  // SORTING
  type StepItem = { id: string; index: number };
  let items: StepItem[];
  $: {
    items = $currentWorkflow
      ? $currentWorkflow.steps.map((step, index) => ({
          id: step.id,
          index,
        }))
      : [];
  }

  const sortableOptions: Sortable.Options = {
    animation: 150,
    ghostClass: "step-ghost",
    dragClass: "step-drag",
  };

  // Called when sorting ends an the item order has been updated.
  function itemOrderChanged(event: CustomEvent<StepItem[]>) {
    const order = event.detail.map(({ id }) => id);
    void editSteps(currentWorkflowName, (steps) => reorderStepsById(steps, order));
  }

  /** Restores the list from the store after a refused step edit. */
  function resetStepItems(): void {
    items = $currentWorkflow
      ? $currentWorkflow.steps.map((step, index) => ({ id: step.id, index }))
      : [];
  }

  // COMPILATION

  $: defaultCompileStatus = `Will run ${
    $currentWorkflow ? $currentWorkflow.steps.length : 0
  } steps.`;

  function onCompileStatusChange(status: CompileStatus) {
    if (status.kind == "CompileStatusError") {
      compileStatus.innerText = `${status.error}. See dev console for more details.`;
      compileStatus.classList.add("compile-status-error");
      restoreDefaultStatusAfter(10000);
    } else if (status.kind == "CompileStatusStep") {
      compileStatus.innerText = `Step ${status.stepIndex + 1}/${
        status.totalSteps
      } (${formatStepKind(status.stepKind)})`;
    } else if (status.kind == "CompileStatusSuccess") {
      compileStatus.innerText = "Compiled manuscript.";
      compileStatus.classList.add("compile-status-success");
      restoreDefaultStatusAfter();
      new Notice("Compile complete.");
    } else {
      compileStatus.innerText = "default??";
    }
  }

  function restoreDefaultStatusAfter(ms: number = 3000) {
    setTimeout(() => {
      compileStatus.innerText = defaultCompileStatus;
      compileStatus.classList.remove("compile-status-error");
      compileStatus.classList.remove("compile-status-success");
    }, ms);
  }

  const compile: (
    draft: Draft,
    workflow: Workflow,
    kinds: CompileStepKind[],
    statusCallback: (status: CompileStatus) => void
  ) => Vault = getContext("compile");
  function doCompile() {
    compile(
      $selectedDraft,
      $currentWorkflow,
      calculatedKinds,
      onCompileStatusChange
    );
  }
</script>

{#if $selectedDraft}
  <div class="longform-extended-compile-container">
    <div class="longform-extended-workflow-picker-container">
      <div class="longform-extended-workflow-picker">
        {#if workflowInputState !== "hidden"}
          <input
            type="text"
            placeholder={workflowInputState == "new"
              ? "New Workflow…"
              : "My Cool Workflow"}
            bind:value={workflowInputValue}
            bind:this={workflowInput}
            on:keydown={(e) => {
              if (e.key === "Enter" && workflowInputValue.length > 0) {
                onWorkflowInputEnter();
              } else if (e.key === "Escape") {
                workflowInputValue = "";
                workflowInput.blur();
                workflowInputState = "hidden";
              }
            }}
            use:focusOnInit
          />
        {:else}
          {#if allWorkflowNames.length == 0}
            <span class="longform-extended-hint">Create a new workflow to begin →</span>
          {:else}
            <div class="select">
              <select
                id="longform-extended-workflows"
                value={$selectedDraft.workflow}
                on:change={selectedWorkflow}
              >
                {#each allWorkflowNames as workflowOption}
                  <option value={workflowOption}>{workflowOption}</option>
                {/each}
              </select>
            </div>
          {/if}
          <button
            class="options-button"
            title="Workflow Actions"
            bind:this={workflowContextButton}
            on:click={() => {
              const rect = workflowContextButton.getBoundingClientRect();
              showCompileActionsMenu(
                rect.x,
                rect.y,
                currentWorkflowName,
                workflowAction
              );
            }}>▼</button
          >
        {/if}
      </div>
      {#if $workflows[currentWorkflowName]}
        <div>
          <AutoTextArea
            placeholder="Click here to leave a description of your workflow…"
            minRows={2}
            maxRows={5}
            bind:value={descriptionDraft}
          />
        </div>
      {/if}
    </div>
    {#if $workflows[currentWorkflowName]}
      {#key currentWorkflowName}
      <div>
        <SortableList
          bind:items
          let:item
          {sortableOptions}
          on:orderChanged={itemOrderChanged}
          class="longform-extended-sortable-step-list"
        >
          <CompileStepView
            ordinal={item.index + 1}
            step={$workflows[currentWorkflowName].steps[item.index]}
            on:removeStep={() => {
              void editSteps(
                currentWorkflowName,
                (steps) => removeStepById(steps, item.id),
                -1
              );
            }}
            calculatedKind={kindAtIndex(item.index)}
            error={errorAtIndex(item.index)}
            on:optionChange={(event) => onStepOptionChange(event.detail)}
          />
        </SortableList>
      </div>
      {/key}
      <div class="add-step-container">
        {#if Object.keys($workflows).length > 0}
          <button on:click={addStep}>+ Add Step</button>
        {/if}
      </div>
    {/if}

    <ul class="longform-extended-compile-instructions">
      <li>
        Compile workflows run their steps in order.
      </li>
      <li>
        <strong>Scene</strong> workflows run once per scene.
      </li>
      <li>
        <strong>Join</strong> workflows run once and combine the rest of your scene steps into a single manuscript.
      </li>
      <li>
        <strong>Manuscript</strong> steps run once on the joined manuscript.
      </li>
      <li>
        Drag to rearrange. <a href="https://github.com/wandrade/longformExtended/blob/main/docs/COMPILE.md">Documentation here.</a
      >
      </li>
    </ul>

    <div class="longform-extended-compile-run-container">
      {#if $currentWorkflow && $currentWorkflow.steps.length > 0}
        <button
          class="compile-button"
          on:click={doCompile}
          disabled={validation.error !== WorkflowError.Valid}
          aria-label={validation.error}>Compile</button
        >
        <span class="compile-status" bind:this={compileStatus}
          >{validation.error === WorkflowError.Valid
            ? defaultCompileStatus
            : validation.error}</span
        >
      {/if}
    </div>
  </div>
{/if}

<style>
  .longform-extended-workflow-picker-container {
    padding: var(--size-4-2);
    background: var(--background-primary);
    display: flex;
    flex-direction: column;
  }

  #longform-extended-workflows {
    color: var(--color-accent-2);
  }

  .longform-extended-workflow-picker {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: var(--size-4-2);
  }

  .longform-extended-workflow-picker .longform-extended-hint {
    font-size: 1em;
  }

  select {
    background-color: transparent;
    border: none;
    padding: var(--size-4-1) 0;
    margin: 0;
    font-family: inherit;
    font-size: inherit;
    cursor: inherit;
    line-height: inherit;
    outline: none;
    box-shadow: none;
  }

  .select {
    cursor: pointer;
  }

  .select > select {
    color: var(--text-accent);
  }

  .select > select:hover {
    text-decoration: underline;
    color: var(--text-accent-hover);
  }

  .longform-extended-compile-container :global(.longform-extended-sortable-step-list) {
    list-style-type: none;
    padding: 0;
    margin: 0;
  }

  .options-button {
    background-color: var(--background-secondary-alt);
    color: var(--text-accent);
  }

  .options-button:hover {
    background-color: var(--background-primary);
    color: var(--text-accent-hover);
  }

  .add-step-container {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
  }

  .add-step-container button {
    font-weight: bold;
    color: var(--text-accent);
  }

  .add-step-container button:hover {
    text-decoration: underline;
    color: var(--text-accent-hover);
  }

  .longform-extended-compile-instructions {
    font-size: var(--font-smallest);
    padding: var(--size-4-4) var(--size-4-4) var(--size-4-1) var(--size-4-8);
    color: var(--text-muted);
  }
  
    .longform-extended-compile-instructions li {
      margin-bottom: var(--size-4-1)
    }

    .longform-extended-compile-instructions strong {
      color: var(--color-accent-2);
    }

  .compile-button {
    font-weight: bold;
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .compile-button:hover {
    background-color: var(--interactive-accent-hover);
    color: var(--text-on-accent);
  }

  .compile-button:disabled {
    background-color: var(--text-muted);
    color: var(--text-faint);
  }

  .longform-extended-compile-run-container {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    margin-top: var(--size-4-8);
  }

  .longform-extended-compile-run-container .compile-status {
    color: var(--text-muted);
  }

  :global(.compile-status-error) {
    color: var(--text-error) !important;
  }

  :global(.compile-status-success) {
    color: var(--interactive-success) !important;
  }

  :global(.step-ghost) {
    background-color: var(--interactive-accent-hover);
    color: var(--text-on-accent);
  }
</style>
