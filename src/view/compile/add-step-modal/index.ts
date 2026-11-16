import { App, Modal } from "obsidian";

import AddStepModal from "./AddStepModal.svelte";
import { appContext } from "src/view/utils";
import type { CompileStep } from "src/compile";

export default class AddStepModalContainer extends Modal {
  constructor(
    app: App,
    private readonly onStep: (step: CompileStep) => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;

    contentEl.createEl("h1", { text: "Add compile step to workflow" });
    const entrypoint = contentEl.createDiv("longform-extended-add-step-root");

    const context = appContext(this);
    context.set("close", () => this.close());
    context.set("addStep", (step: CompileStep) => this.onStep(step));

    new AddStepModal({
      target: entrypoint,
      context,
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
