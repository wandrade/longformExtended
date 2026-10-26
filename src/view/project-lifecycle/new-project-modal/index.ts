import { App, Modal, TFolder } from "obsidian";
import { insertDraftIntoFrontmatter } from "src/model/draft-utils";
import { selectedDraftVaultPath } from "src/model/stores";
import {
  DEFAULT_KANBAN_COLUMNS,
  DEFAULT_KANBAN_INCLUDE_PLOTS,
  DEFAULT_KANBAN_OUTPUT_PATH,
  DEFAULT_PLOT_GRID_CHARACTERS_DIR,
  DEFAULT_PLOT_GRID_OUTPUT_PATH,
  DEFAULT_PLOT_GRID_PLOTS_DIR,
  DEFAULT_TIMEFRAME_TAG_NAME,
  DEFAULT_TIMELINE_OUTPUT_PATH,
  DEFAULT_TIME_FORMAT,
  type Draft,
  type MultipleSceneDraft,
  type SingleSceneDraft,
} from "src/model/types";
import { selectedNotesTab, selectedTab } from "src/view/stores";
import NewProjectModal from "./NewProjectModal.svelte";
import { appContext } from "src/view/utils";

export default class NewProjectModalContainer extends Modal {
  private parent: TFolder;

  constructor(app: App, parent: TFolder) {
    super(app);
    this.parent = parent;
  }

  onOpen(): void {
    const { contentEl } = this;

    contentEl.createEl("h1", { text: "Create Project" }, (el) => {
      el.style.margin = "0 0 var(--size-4-4) 0";
    });
    const entrypoint = contentEl.createDiv("longform-extended-add-create-project-root");

    const context = appContext(this);
    context.set("close", () => this.close());
    context.set(
      "createProject",
      async (format: "scenes" | "single", title: string, path: string) => {
        const exists = await this.app.vault.adapter.exists(path);
        if (exists) {
          console.log(
            `[Longform Extended] Cannot create project at ${path}, already exists.`
          );
          return;
        }

        const parentPath = path.split("/").slice(0, -1).join("/");
        if (!(await this.app.vault.adapter.exists(parentPath))) {
          await this.app.vault.createFolder(parentPath);
        }

        const newDraft: Draft = (() => {
          if (format === "scenes") {
            const multi: MultipleSceneDraft = {
              format: "scenes",
              title,
              titleInFrontmatter: true,
              draftTitle: null,
              vaultPath: path,
              workflow: null,
              sceneFolder: "Scenes",
              scenes: [],
              ignoredFiles: [],
              unknownFiles: [],
              sceneTemplate: null,
              plotTemplate: null,
              characterTemplate: null,
              plots: [],
              characters: [],
              timeframeTagName: DEFAULT_TIMEFRAME_TAG_NAME,
              timeFormat: DEFAULT_TIME_FORMAT,
              kanbanColumns: DEFAULT_KANBAN_COLUMNS,
              kanbanShowUnassigned: false,
              kanbanSaveWordCounts: true,
              kanbanEnabled: true,
              kanbanIncludePlots: DEFAULT_KANBAN_INCLUDE_PLOTS,
              kanbanOutputPath: DEFAULT_KANBAN_OUTPUT_PATH,
              timelineEnabled: true,
              timelineOutputPath: DEFAULT_TIMELINE_OUTPUT_PATH,
              plotGridEnabled: true,
              plotGridOutputPath: DEFAULT_PLOT_GRID_OUTPUT_PATH,
              plotGridPlotsDir: DEFAULT_PLOT_GRID_PLOTS_DIR,
              plotGridCharactersDir: DEFAULT_PLOT_GRID_CHARACTERS_DIR,
            };
            return multi;
          } else {
            const single: SingleSceneDraft = {
              format: "single",
              title,
              titleInFrontmatter: true,
              draftTitle: null,
              vaultPath: path,
              workflow: null,
            };
            return single;
          }
        })();

        await insertDraftIntoFrontmatter(this.app, path, newDraft);
        selectedDraftVaultPath.set(path);
        if (format === "scenes") {
          selectedNotesTab.set("Scenes");
          selectedTab.set("Notes");
        } else {
          selectedTab.set("Project");
        }
        if (format === "single") {
          this.app.workspace.openLinkText(path, "/", false);
        }
        this.close();
      }
    );

    new NewProjectModal({
      target: entrypoint,
      context,
      props: {
        parent: this.parent,
      },
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
