import {
  ItemView,
  type KeymapContext,
  Menu,
  TAbstractFile,
  WorkspaceLeaf,
  type PaneType,
  Scope,
} from "obsidian";
import type { CompileStatus, Workflow } from "src/compile";
import { compile, CompileStepKind } from "src/compile";
import type { Draft, MultipleSceneDraft } from "src/model/types";
import AddStepModal from "../compile/add-step-modal";
import ConfirmActionModal from "../ConfirmActionModal";
import { ICON_NAME } from "../icon";
import ExplorerView from "./ExplorerView.svelte";
import { scenePath } from "src/model/scene-navigation";
import { migrate } from "src/model/migration";
import { get } from "svelte/store";
import { drafts, pluginSettings, selectedDraft } from "src/model/stores";
import { insertScene } from "src/model/draft-utils";
import {
  auxiliaryKindLabel,
  insertAuxiliaryNote,
  uniqueAuxiliaryNoteName,
  type AuxiliaryNoteKind,
} from "src/model/auxiliary-notes";
import {
  noteGroupEntries,
  noteGroupSingularName,
} from "src/model/note-groups";
import NewDraftModal from "src/view/project-lifecycle/new-draft-modal";
import { UndoManager } from "../undo/undo-manager";
import { ignoreScene } from "./scene-menu-items";
import { appContext } from "../utils";

export const VIEW_TYPE_LONGFORM_EXTENDED_EXPLORER = "VIEW_TYPE_LONGFORM_EXTENDED_EXPLORER";

export class ExplorerPane extends ItemView {
  private explorerView: ExplorerView;
  private undoManager = new UndoManager();
  private keyScope: Scope;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_LONGFORM_EXTENDED_EXPLORER;
  }

  getDisplayText(): string {
    return "Longform extended";
  }

  getIcon(): string {
    return ICON_NAME;
  }

  async onOpen(): Promise<void> {
    this.keyScope = new Scope(this.app.scope);
    this.keyScope.register(
      ["Mod"],
      "z",
      (evt: KeyboardEvent, ctx: KeymapContext) => {
        const activePane = this.app.workspace.getActiveViewOfType(ExplorerPane);
        if (activePane === this) {
          this.undoManager.send("undo", evt, ctx);
          return false;
        }
        return true;
      }
    );

    this.keyScope.register(
      ["Mod", "Shift"],
      "z",
      (evt: KeyboardEvent, ctx: KeymapContext) => {
        const activePane = this.app.workspace.getActiveViewOfType(ExplorerPane);
        if (activePane === this) {
          this.undoManager.send("redo", evt, ctx);
          return false;
        }
        return true;
      }
    );

    const context = appContext(this);

    context.set("undoManager", this.undoManager);

    // Context function for showing a generic confirmation modal
    context.set(
      "showConfirmModal",
      (
        title: string,
        description: string,
        yesText: string,
        yesAction: () => void,
        noText: string = undefined,
        noAction: () => void = undefined
      ) => {
        new ConfirmActionModal(
          this.app,
          title,
          description,
          yesText,
          yesAction,
          noText,
          noAction
        ).open();
      }
    );

    // Create a fully-qualified path to a scene from its name.
    context.set(
      "makeScenePath",
      (draft: MultipleSceneDraft, sceneName: string) =>
        scenePath(sceneName, draft, this.app.vault)
    );

    // Context function for opening scene notes on click
    context.set(
      "onSceneClick",
      (path: string, paneType: PaneType | boolean) => {
        void this.app.workspace.openLinkText(path, "/", paneType);
      }
    );

    // Context function for creating new scene notes given a path
    context.set("onNewScene", async (name: string, open: boolean) => {
      await insertScene(
        this.app,
        drafts,
        get(selectedDraft) as MultipleSceneDraft,
        name,
        this.app.vault,
        { at: "end", relativeTo: null },
        open
      );
    });

    // Context function for opening plot/character notes on click.
    context.set(
      "onAuxiliaryClick",
      (path: string, paneType: PaneType | boolean) => {
        void this.app.workspace.openLinkText(path, "/", paneType);
      }
    );

    // Context function for creating a plot/character note via its New field.
    context.set(
      "onNewAuxiliary",
      async (kind: AuxiliaryNoteKind, name: string, open: boolean) => {
        const draft = get(selectedDraft);
        if (!draft || draft.format !== "scenes") {
          return;
        }
        await insertAuxiliaryNote(
          this.app,
          drafts,
          draft,
          kind,
          name,
          { at: "end", relativeTo: null },
          open
        );
      }
    );

    // Context function for creating new draft folders given a path
    context.set(
      "onNewDraft",
      async (path: string, copying?: { from: string; to: string }[]) => {
        if (copying) {
          await this.app.vault.createFolder(path);
          // do copy
          for (const toCopy of copying) {
            await this.app.vault.adapter.copy(toCopy.from, toCopy.to);
          }
        } else {
          await this.app.vault.createFolder(path);
        }
      }
    );

    const addRelativeScene = (at: "before" | "after", file: TAbstractFile) => {
      const draft = get(selectedDraft) as MultipleSceneDraft;
      let sceneName = "Untitled";
      let count = 0;
      const sceneNames = new Set(draft.scenes.map((s) => s.title));
      while (sceneNames.has(sceneName)) {
        count = count + 1;
        sceneName = `Untitled ${count}`;
      }

      const relativeTo = draft.scenes
        .map((s) => s.title)
        .indexOf(file.name.split(".md")[0]);

      if (relativeTo >= 0) {
        void insertScene(
          this.app,
          drafts,
          draft,
          sceneName,
          this.app.vault,
          {
            at,
            relativeTo,
          },
          true
        );
      }
    };

    const addRelativeAuxiliary = (
      kind: AuxiliaryNoteKind,
      at: "before" | "after",
      file: TAbstractFile
    ) => {
      const draft = get(selectedDraft);
      if (!draft || draft.format !== "scenes") {
        return;
      }
      const name = file.name.endsWith(".md")
        ? file.name.slice(0, -3)
        : file.name;
      const relativeTo = noteGroupEntries(draft, kind).findIndex(
        (entry) => entry.title === name
      );
      if (relativeTo < 0) {
        return;
      }
      void insertAuxiliaryNote(
        this.app,
        drafts,
        draft,
        kind,
        uniqueAuxiliaryNoteName(this.app, draft, kind),
        { at, relativeTo },
        true
      );
    };

    // Context function for showing the plot/character tree's right-click menu.
    context.set(
      "onAuxiliaryContextClick",
      (
        kind: AuxiliaryNoteKind,
        path: string,
        x: number,
        y: number,
        onRename: () => void
      ) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!file) {
          return;
        }
        const draft = get(selectedDraft);
        const noun =
          draft && draft.format === "scenes"
            ? noteGroupSingularName(draft, kind)
            : auxiliaryKindLabel(kind);
        const menu = new Menu();
        menu.addSeparator();
        menu.addItem((item) => {
          item.setTitle("Rename");
          item.setIcon("pencil");
          item.onClick(onRename);
        });
        menu.addItem((item) => {
          item.setTitle("Delete");
          item.setIcon("trash");
          item.onClick(async () => {
            await this.app.fileManager.trashFile(file);
          });
        });
        menu.addItem((item) => {
          item.setTitle("Open in new pane");
          item.setIcon("vertical-split");
          item.onClick(() => this.app.workspace.openLinkText(path, "/", true));
        });
        menu.addItem((item) => {
          item.setTitle(`Add new ${noun} above`);
          item.setIcon("document");
          item.onClick(() => addRelativeAuxiliary(kind, "before", file));
        });
        menu.addItem((item) => {
          item.setTitle(`Add new ${noun} below`);
          item.setIcon("document");
          item.onClick(() => addRelativeAuxiliary(kind, "after", file));
        });
        this.app.workspace.trigger("file-menu", menu, file, "longform-extended");
        menu.showAtPosition({ x, y });
      }
    );

    // Context function for showing a right-click menu
    context.set(
      "onContextClick",
      (path: string, x: number, y: number, onRename: () => void) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!file) {
          return;
        }
        const menu = new Menu();
        menu.addSeparator();
        menu.addItem((item) => {
          item.setTitle("Rename");
          item.setIcon("pencil");
          item.onClick(onRename);
        });
        menu.addItem((item) => {
          item.setTitle("Delete");
          item.setIcon("trash");
          item.onClick(async () => {
            if (file) {
              await this.app.fileManager.trashFile(file);
            }
          });
        });
        menu.addItem((item) => {
          item.setTitle("Open in new pane");
          item.setIcon("vertical-split");
          item.onClick(() => this.app.workspace.openLinkText(path, "/", true));
        });
        menu.addItem((item) => {
          item.setTitle("Add new scene above");
          item.setIcon("document");
          item.onClick(() => addRelativeScene("before", file));
        });
        menu.addItem((item) => {
          item.setTitle("Add new scene below");
          item.setIcon("document");
          item.onClick(() => addRelativeScene("after", file));
        });
        menu.addItem((item) => {
          item.setTitle("Ignore note in longform extended");
          item.setIcon("minus-circle");
          item.onClick(() =>
            ignoreScene(
              file.name.endsWith(".md") ? file.name.slice(0, -3) : file.name
            )
          );
        });
        // Triggering this event lets other apps insert menu items
        // including Obsidian, giving us lots of stuff for free.
        this.app.workspace.trigger("file-menu", menu, file, "longform-extended");
        menu.showAtPosition({ x, y });
      }
    );
    context.set("showDraftMenu", (x: number, y: number, action: () => void) => {
      const menu = new Menu();
      menu.addItem((item) => {
        item.setTitle("Rename");
        item.setIcon("pencil");
        item.onClick(action);
      });
      menu.showAtPosition({ x, y });
    });
    context.set("renameFolder", (oldPath: string, newPath: string) => {
      void this.app.vault.adapter.rename(oldPath, newPath);
    });

    context.set(
      "compile",
      (
        draft: Draft,
        workflow: Workflow,
        kinds: CompileStepKind[],
        statusCallback: (status: CompileStatus) => void
      ) => {
        void compile(this.app, draft, workflow, kinds, statusCallback);
      }
    );

    context.set("openCompileStepMenu", () => new AddStepModal(this.app).open());
    context.set(
      "showCompileActionsMenu",
      (
        x: number,
        y: number,
        currentWorkflowName: string,
        action: (type: "new" | "rename" | "delete") => void
      ) => {
        const menu = new Menu();
        menu.addItem((item) => {
          item.setTitle("Add new workflow");
          item.setIcon("plus-with-circle");
          item.onClick(() => action("new"));
        });
        if (currentWorkflowName) {
          menu.addItem((item) => {
            item.setTitle(`Rename "${currentWorkflowName}"`);
            item.setIcon("pencil");
            item.onClick(() => action("rename"));
          });
          menu.addItem((item) => {
            item.setTitle(`Delete "${currentWorkflowName}"`);
            item.setIcon("trash");
            item.onClick(() => action("delete"));
          });
        }
        menu.showAtPosition({ x, y });
      }
    );

    context.set("migrate", () => {
      void migrate(get(pluginSettings), this.app);
    });

    context.set("showNewDraftModal", () => {
      new NewDraftModal(this.app).open();
    });

    this.explorerView = new ExplorerView({
      target: this.contentEl,
      context,
    });
  }

  async onClose(): Promise<void> {
    this.undoManager.destroy();
    if (this.explorerView) {
      this.explorerView.$destroy();
    }
  }
}
