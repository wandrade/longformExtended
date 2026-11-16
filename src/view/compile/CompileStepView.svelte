<script lang="ts">
  // @ts-nocheck
  import {
    type CompileStep,
    CompileStepKind,
    CompileStepOptionType,
    explainStepKind,
    formatStepKind,
    PLACEHOLDER_MISSING_STEP,
  } from "src/compile/steps/abstract-compile-step";
  import { createEventDispatcher } from "svelte";

  export let step: CompileStep;
  export let ordinal: number;
  export let calculatedKind: CompileStepKind | null;
  export let error: string | null;

  const dispatch = createEventDispatcher();

  // Option edits live here until they are persisted by the parent. Binding
  // straight into the store lost keystrokes whenever a merge refreshed it.
  let values: { [id: string]: unknown } = { ...step.optionValues };
  let localStepId = step.id;
  $: if (step.id !== localStepId) {
    localStepId = step.id;
    values = { ...step.optionValues };
  }

  function setOption(optionId: string, value: unknown) {
    values = { ...values, [optionId]: value };
    dispatch("optionChange", { stepId: step.id, optionId, value });
  }

  function removeStep() {
    dispatch("removeStep");
  }
</script>

<div class="longform-extended-compile-step">
  {#if step.description.canonicalID === PLACEHOLDER_MISSING_STEP.description.canonicalID}
    <div class="longform-extended-compile-step-title-outer">
      <div class="longform-extended-compile-step-title-container">
        <h4>Invalid Step</h4>
      </div>
      <button class="longform-extended-remove-step-button" on:click={removeStep}
        >X</button
      >
    </div>
    <div class="longform-extended-compile-step-error-container">
      <p class="longform-extended-compile-step-error">
        This workflow contains a step that could not be loaded. Please delete
        the step to be able to run this workflow.
      </p>
    </div>
  {:else}
    <div class="longform-extended-compile-step-title-outer">
      <div class="longform-extended-compile-step-title-container">
        <h4><span class="longform-extended-compile-step-number">{ordinal}</span>{step.description.name}</h4>
        {#if calculatedKind !== null}
          <div
            class="longform-extended-step-kind-pill"
            title={explainStepKind(calculatedKind)}
          >
            {formatStepKind(calculatedKind)}
          </div>
        {/if}
      </div>
      <button class="longform-extended-remove-step-button" on:click={removeStep}
        >X</button
      >
    </div>
    <p class="longform-extended-compile-step-description">
      {step.description.description}
    </p>
    {#if step.description.options.length > 0}
      <div class="longform-extended-compile-step-options">
        <div>
          {#each step.description.options as option}
            <div class="longform-extended-compile-step-option">
              {#if option.type === CompileStepOptionType.Text}
                <label for={step.id + "-" + option.id}>{option.name}</label>
                <input
                  id={step.id + "-" + option.id}
                  type="text"
                  placeholder={option.default.replace(/\n/g, "\\n")}
                  value={values[option.id] ?? ""}
                  on:input={(event) =>
                    setOption(option.id, event.currentTarget.value)}
                />
              {:else if option.type === CompileStepOptionType.MultilineText}
                <label for={step.id + "-" + option.id}>{option.name}</label>
                <textarea
                  id={step.id + "-" + option.id}
                  placeholder="key: value"
                  value={values[option.id] ?? ""}
                  on:input={(event) =>
                    setOption(option.id, event.currentTarget.value)}
                />
              {:else}
                <div class="longform-extended-compile-step-checkbox-container">
                  <input
                    id={step.id + "-" + option.id}
                    type="checkbox"
                    checked={!!values[option.id]}
                    on:change={(event) =>
                      setOption(option.id, event.currentTarget.checked)}
                  />
                  <label for={step.id + "-" + option.id}>{option.name}</label>
                </div>
              {/if}
              <p class="longform-extended-compile-step-option-description">
                {option.description}
              </p>
            </div>
          {/each}
        </div>
      </div>
    {/if}
    {#if error}
      <div class="longform-extended-compile-step-error-container">
        <p class="longform-extended-compile-step-error">{error}</p>
      </div>
    {/if}
  {/if}
</div>

<style>
  .longform-extended-compile-step {
    background-color: var(--background-modifier-border);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    padding: 0;
    margin: var(--size-4-4) 0;
  }

  .longform-extended-compile-step-title-outer {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-start;
  }

  .longform-extended-compile-step-title-container {
    display: flex;
    flex-direction: row;
    align-items: center;
    flex-wrap: wrap;
    font-size: var(--font-ui-smaller);
  }

  .longform-extended-compile-step-title-container h4 {
    display: inline-block;
    margin: var(--size-4-1) var(--size-4-2) var(--size-4-1) 0;
    padding: 0;
  }

  .longform-extended-compile-step-title-container .longform-extended-step-kind-pill {
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: color-mix(in srgb, var(--text-accent) 50%, var(--background-modifier-border) 50%);
    color: var(--text-on-accent);
    border-radius: var(--radius-l);
    font-size: var(--font-smallest);
    font-weight: bold;
    padding: var(--size-4-1) var(--size-4-2);
    margin-right: var(--size-4-1);
    height: var(--h1-line-height);
  }

  .longform-extended-compile-step-number {
    color: var(--text-faint);
    display: inline-block;
    width: var(--size-4-6);
    padding-left: var(--size-4-1);
  }

  .longform-extended-remove-step-button {
    display: flex;
    width: var(--size-4-5);
    height: 100%;
    margin: 1px;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    background: var(--background-modifier-error);
  }

  .longform-extended-compile-step p {
    margin: 0;
    background: var(--background-primary);
  }

  .longform-extended-compile-step-description {
    font-size: var(--font-smallest);
    color: var(--text-muted);
    padding: var(--size-4-2) var(--size-4-1) var(--size-4-2) var(--size-4-6);
  }

    .longform-extended-compile-step-description .solo {
      padding-right: var(--size-4-6);
    }

  .longform-extended-compile-step-options {
    padding: var(--size-4-2) 0;
    background: var(--background-primary);
  }

  .longform-extended-compile-step-options > div {
    margin: 0 var(--size-4-2) 0 var(--size-4-6)
  }

  .longform-extended-compile-step-option {
    margin: 0 var(--size-4-4) var(--size-4-4) 0;
  }

  .longform-extended-compile-step-option label {
    display: block;
    font-weight: 600;
    font-size: var(--font-smallest);
  }

  .longform-extended-compile-step-checkbox-container {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
  }

  .longform-extended-compile-step-option input[type="text"] {
    margin: 0 0 var(--size-4-1) 0;
    width: 100%;
  }

  .longform-extended-compile-step-option textarea {
    color: var(--text-accent);
    margin: 0 0 var(--size-4-1) 0;
    width: 100%;
    resize: vertical;
  }

  .longform-extended-compile-step-option input[type="checkbox"] {
    margin: 0 var(--size-4-2) var(--size-2-1) 0;
  }

  .longform-extended-compile-step-option input:focus {
    color: var(--text-accent-hover);
  }

  .longform-extended-compile-step-option-description {
    font-size: var(--font-smallest);
    line-height: 1em;
    color: var(--text-faint);
  }

  .longform-extended-compile-step-error-container {
    margin-top: var(--size-4-2);
  }

  .longform-extended-compile-step-error {
    color: var(--text-error);
    font-size: var(--font-smallest);
    line-height: 1em;
  }
</style>