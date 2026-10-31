import {
  Plugin,
  WorkspaceLeaf,
  FileView,
  addIcon,
  Notice,
  TAbstractFile,
  TFile,
  TFolder,
  normalizePath,
} from "obsidian";
import debounce from "lodash/debounce";
import once from "lodash/once";
import pick from "lodash/pick";
import { derived, type Unsubscriber } from "svelte/store";
import { get } from "svelte/store";

import {
  VIEW_TYPE_LONGFORM_EXTENDED_EXPLORER,
  ExplorerPane,
} from "./view/explorer/ExplorerPane";
import {
  PASSTHROUGH_SAVE_SETTINGS_PATHS,
  type Draft,
  type LongformExtendedPluginSettings,
  type SerializedWorkflow,
  type WordCountSession,
} from "./model/types";
import { DEFAULT_SETTINGS, TRACKED_SETTINGS_PATHS } from "./model/types";
import {
  activeFile,
  goalProgress,
  selectedNotesTab,
  selectedTab,
} from "./view/stores";
import { ICON_NAME, ICON_SVG } from "./view/icon";
import { LongformExtendedSettingsTab } from "./view/settings/LongformSettings";
import { deserializeWorkflow } from "./compile/serialization";
import type { Workflow } from "./compile";
import { DEFAULT_WORKFLOWS } from "./compile";
import { StoreVaultSync } from "./model/store-vault-sync";
import { ProjectNotesObserver } from "./model/notes-observer";
import { AutocompileScheduler } from "./model/autocompile";
import {
  selectedDraft,
  selectedDraftVaultPath,
  workflows,
  initialized,
  pluginSettings,
  drafts,
  sessions,
} from "./model/stores";
import { addCommands } from "./commands";
import { migrate, readLegacySettings } from "./model/migration";
import { draftForPath } from "./model/scene-navigation";
import { draftForStoredPath } from "./model/draft-utils";
import { WritingSessionTracker } from "./model/writing-session-tracker";
import { WorkflowSync } from "./model/workflow-sync";
import NewProjectModal from "./view/project-lifecycle/new-project-modal";
import { LongformExtendedAPI } from "./api/LongformAPI";
import { PLOT_GRID_VIEW_TYPE } from "./model/plot-grid";
import { PlotGridView } from "./view/plot-grid/plot-grid-view";

const LONGFORM_EXTENDED_LEAF_CLASS = "longform-extended-leaf";

// TODO: Try and abstract away more logic from actual plugin hooks here

export default class LongformExtendedPlugin extends Plugin {
  // Local mirror of the pluginSettings store
  // since this class does a lot of ad-hoc settings fetching.
  // More efficient than a lot of get() calls.
  cachedSettings: LongformExtendedPluginSettings | null = null;
  private unsubscribeSettings: Unsubscriber;
  private unsubscribeWorkflows: Unsubscriber;
  private unsubscribeDrafts: Unsubscriber;
  private unsubscribeDraftSelection: Unsubscriber;
  private unsubscribeSelectedDraft: Unsubscriber;
  private unsubscribeSessions: Unsubscriber;
  private unsubscribeGoalNotification: Unsubscriber;
  writingSessionTracker: WritingSessionTracker;
  public api: LongformExtendedAPI;

  private storeVaultSync: StoreVaultSync;
  private notesObserver: ProjectNotesObserver;
  private autocompileScheduler: AutocompileScheduler;
  workflowSync: WorkflowSync;

  async onload(): Promise<void> {
    addIcon(ICON_NAME, ICON_SVG);

    this.registerView(
      VIEW_TYPE_LONGFORM_EXTENDED_EXPLORER,
      (leaf: WorkspaceLeaf) => new ExplorerPane(leaf, this)
    );

    // Returns false when the Bases core plugin is disabled; the plugin still
    // loads, and the generated Base keeps its native table fallback view.
    const basesViewRegistered =
      typeof this.registerBasesView === "function" &&
      this.registerBasesView(PLOT_GRID_VIEW_TYPE, {
        name: "Subplot Grid",
        icon: "table",
        factory: (controller, containerEl) =>
          new PlotGridView(controller, containerEl, this.app),
        // Registered so the generated `.base` view options survive
        // serialization.
        options: () => [
          {
            type: "text",
            key: "plotsDir",
            displayName: "Subplots folder",
            default: "",
          },
          {
            type: "text",
            key: "charactersDir",
            displayName: "Characters folder",
            default: "",
          },
        ],
      });
    if (!basesViewRegistered) {
      console.warn(
        "[Longform Extended] Bases is not enabled; the subplot grid view is unavailable."
      );
    }

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file: TAbstractFile) => {
        if (!(file instanceof TFolder)) {
          return;
        }
        menu.addItem((item) => {
          item
            .setTitle("Create longform extended project")
            .setIcon(ICON_NAME)
            .onClick(() => {
              new NewProjectModal(this.app, file).open();
            });
        });
      })
    );

    // Settings
    this.unsubscribeSettings = pluginSettings.subscribe((value) => {
      let shouldSave = false;

      const changeInKeys = (
        obj1: LongformExtendedPluginSettings,
        obj2: LongformExtendedPluginSettings,
        keys: (keyof LongformExtendedPluginSettings)[]
      ): boolean => {
        return !!keys.find((k) => obj1[k] !== obj2[k]);
      };

      if (
        this.cachedSettings &&
        changeInKeys(
          this.cachedSettings,
          value,
          PASSTHROUGH_SAVE_SETTINGS_PATHS
        )
      ) {
        shouldSave = true;
      }

      this.cachedSettings = value;

      if (shouldSave) {
        void this.saveSettings();
      }
    });

    const pluginDir =
      this.manifest.dir ??
      normalizePath(
        `${this.app.vault.configDir}/plugins/${this.manifest.id}`
      );
    // Constructed before settings load so the first-run settings save already
    // goes through the two-file pipeline instead of writing workflows from
    // memory.
    this.workflowSync = new WorkflowSync(this.app, pluginDir);

    await this.loadSettings();

    this.addSettingTab(new LongformExtendedSettingsTab(this.app, this));

    this.storeVaultSync = new StoreVaultSync(this.app);
    this.notesObserver = new ProjectNotesObserver(this.app);
    this.autocompileScheduler = new AutocompileScheduler(this.app);

    this.app.workspace.onLayoutReady(() => {
      void this.postLayoutInit();
    });

    // Track active file
    activeFile.set(this.app.workspace.getActiveFile());
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf.view instanceof FileView) {
          activeFile.set(leaf.view.file);
        }
        // NOTE: This may break, as it's undocumented.
        // Need some way to determine the empty state.
        else {
          const view = leaf.view as typeof leaf.view & {
            emptyTitleEl?: HTMLElement;
            emptyStateEl?: HTMLElement;
          };
          if (view.emptyTitleEl && view.emptyStateEl) {
            activeFile.set(null);
          }
        }
      })
    );

    addCommands(this);

    // Dynamically style longform-extended scenes
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.styleLongformExtendedLeaves();
      })
    );
    this.unsubscribeDrafts = drafts.subscribe((allDrafts) => {
      this.styleLongformExtendedLeaves(allDrafts);
    });

    this.api = new LongformExtendedAPI();
  }

  onunload(): void {
    this.workflowSync?.stop();
    this.storeVaultSync.destroy();
    this.notesObserver.destroy();
    this.autocompileScheduler?.destroy();
    this.unsubscribeSettings?.();
    this.unsubscribeWorkflows?.();
    this.unsubscribeDraftSelection?.();
    this.unsubscribeSelectedDraft?.();
    this.unsubscribeDrafts?.();
    this.unsubscribeSessions?.();
    this.unsubscribeGoalNotification?.();
    this.writingSessionTracker.destroy();
    this.app.workspace
      .getLeavesOfType(VIEW_TYPE_LONGFORM_EXTENDED_EXPLORER)
      .forEach((leaf) => leaf.detach());
  }

  async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as
      | Partial<LongformExtendedPluginSettings>
      | null;

    const firstRun = stored === null;
    const loadedSettings = firstRun
      ? await readLegacySettings(this.app, this.manifest.dir ?? null)
      : stored;

    const settings: LongformExtendedPluginSettings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      loadedSettings
    );

    // deserialize iso8601 strings as dates

    const _pluginSettings: LongformExtendedPluginSettings = pick(
      settings,
      TRACKED_SETTINGS_PATHS
    );
    pluginSettings.set(_pluginSettings);
    selectedDraftVaultPath.set(_pluginSettings.selectedDraftVaultPath);

    // Never seed the store with factory defaults here: they carry no sync
    // metadata and would later beat real entries. Defaults are seeded through
    // the workflow pipeline only when the merged map is completely empty.
    const _workflows = settings["workflows"] ?? {};
    const deserializedWorkflows = Object.create(null) as Record<string, Workflow>;
    Object.entries(_workflows).forEach(([key, value]) => {
      if (value?.sync_metadata?.deprecated_at) {
        return;
      }
      try {
        // The store holds plain Workflow values. `sync_metadata` stays on the
        // serialized side so refreshStore can compare like with like.
        const serialized = { ...value };
        delete serialized.sync_metadata;
        deserializedWorkflows[key] = deserializeWorkflow(serialized);
      } catch (error) {
        console.warn(
          `[Longform Extended] Could not load workflow "${key}":`,
          error
        );
      }
    });
    workflows.set(deserializedWorkflows);

    const onStatusClick = () => {
      const file = get(activeFile);
      if (!file) {
        return false;
      }
      const draft = draftForPath(file.path, get(drafts));
      if (draft) {
        selectedDraftVaultPath.set(draft.vaultPath);
        this.initLeaf();
        const leaf = this.app.workspace
          .getLeavesOfType(VIEW_TYPE_LONGFORM_EXTENDED_EXPLORER)
          .first();
        if (leaf) {
          void this.app.workspace.revealLeaf(leaf);
        }

        selectedTab.set("Project");
      }
    };

    this.writingSessionTracker = new WritingSessionTracker(
      settings["sessions"],
      this.addStatusBarItem(),
      onStatusClick,
      this.app.vault
    );

    if (firstRun) {
      // Imported upstream workflows must go through the sync pipeline so they
      // are stamped and written to data.json. Clear the transient store first:
      // each create refreshes it from the accumulated merged map.
      workflows.set(Object.create(null));
      await this.saveSettings();
      await this.importLegacyWorkflows(settings["workflows"]);
    }
  }

  async saveSettings(): Promise<void> {
    if (!this.cachedSettings || !this.workflowSync) {
      return;
    }

    // The settings path reads data.json fresh and applies only settings.
    // Workflows are never carried over from memory, so a settings save
    // cannot erase a workflow that arrived by sync and cannot stamp an
    // unsynchronized default over a real one.
    const settings: Partial<LongformExtendedPluginSettings> = {
      ...this.cachedSettings,
    };
    delete settings.workflows;
    await this.workflowSync.saveSettings((raw) => {
      Object.assign(raw, settings);
    });
  }

  /**
   * Imports upstream Longform workflows through the sync pipeline so each one
   * receives sync metadata and is written to data.json.
   */
  private async importLegacyWorkflows(
    imported: Record<string, SerializedWorkflow> | null | undefined
  ): Promise<void> {
    for (const [name, workflow] of Object.entries(imported ?? {})) {
      if (!workflow || typeof workflow !== "object" || Array.isArray(workflow) || workflow.sync_metadata?.deprecated_at) {
        continue;
      }
      await this.workflowSync.createWorkflow(name, {
        description:
          typeof workflow.description === "string" ? workflow.description : "",
        steps: Array.isArray(workflow.steps) ? workflow.steps : [],
      });
    }
  }

  /**
   * Seeds the factory workflows through the sync pipeline so they receive
   * sync metadata like any other creation. Only called when the merged map is
   * empty, so a deleted default is never resurrected on an existing setup.
   */
  private async seedDefaultWorkflows(): Promise<void> {
    for (const [name, workflow] of Object.entries(DEFAULT_WORKFLOWS)) {
      // A name known to the merged map is never seeded again, even when the
      // only trace is a tombstone left by a delete on another device.
      if (this.workflowSync.hasWorkflow(name)) {
        continue;
      }
      await this.workflowSync.createWorkflow(name, {
        description: workflow.description,
        steps: workflow.steps,
      });
    }
  }

  private async postLayoutInit(): Promise<void> {
    // Initialize StoreVaultSync with sync awareness
    await this.storeVaultSync.initialize();

    if (await migrate(get(pluginSettings), this.app)) {
      await this.saveSettings();
      await this.storeVaultSync.discoverDrafts();
    }

    // Run the first sync before the poll starts. Seeding defaults only when
    // the merged map is completely empty avoids resurrecting a workflow this
    // device deleted before it had tombstones.
    await this.workflowSync.sync();
    if (this.workflowSync.hasLoaded() && this.workflowSync.isEmpty()) {
      await this.seedDefaultWorkflows();
    }

    this.workflowSync.start();

    this.notesObserver.beginObserving();
    this.autocompileScheduler.start();

    // Continue with the rest of initialization only after sync is complete
    this.watchProjects();

    const defaultToScenes = once(function (d: Draft) {
      if (d && d.format === "scenes") {
        selectedNotesTab.set("scenes");
        selectedTab.set("Notes");
      }
    });

    this.unsubscribeSelectedDraft = selectedDraft.subscribe((d) => {
      if (!get(initialized) || !d) {
        return;
      }

      // On initial load, default to Scenes tab for multi-scene projects.
      defaultToScenes(d);

      pluginSettings.update((s) => ({
        ...s,
        selectedDraftVaultPath: d.vaultPath,
      }));
      this.cachedSettings = get(pluginSettings);
      void this.saveSettings();
    });

    // Workflows
    const saveWorkflows = debounce(() => {
      void this.saveSettings();
    }, 3000);
    this.unsubscribeWorkflows = workflows.subscribe(() => {
      if (!get(initialized)) {
        return;
      }

      saveWorkflows();
    });

    // Sessions
    const saveSessions = debounce(async (toSave: WordCountSession[]) => {
      if (this.cachedSettings.sessionStorage === "data") {
        pluginSettings.update((s) => {
          const toReturn = {
            ...s,
            sessions: toSave,
          };
          this.cachedSettings = toReturn;
          return toReturn;
        });
        await this.saveSettings();
      } else {
        // Save to either plugin or vault
        let file: string | null = null;
        if (this.cachedSettings.sessionStorage === "plugin-folder") {
          if (!this.manifest.dir) {
            console.error(`[Longform Extended] No manifest.dir for saving sessions.`);
            return;
          }
          file = normalizePath(`${this.manifest.dir}/sessions.json`);
        } else {
          file = this.cachedSettings.sessionFile;
        }
        if (!file) {
          return;
        }
        const data = JSON.stringify(toSave);
        await this.app.vault.adapter.write(file, data);

        // If we have lingering session data in settings, clear it
        if (this.cachedSettings.sessions.length !== 0) {
          const emptySessions: WordCountSession[] = [];
          pluginSettings.update((s) => {
            const toReturn = {
              ...s,
              sessions: emptySessions,
            };
            this.cachedSettings = toReturn;
            return toReturn;
          });
          await this.saveSettings();
        }
      }
    }, 3000);
    this.unsubscribeSessions = sessions.subscribe((s) => {
      if (!get(initialized)) {
        return;
      }

      void saveSessions(s);
    });

    this.unsubscribeGoalNotification = derived(
      [goalProgress, pluginSettings, selectedDraft, activeFile],
      (stores) => stores
    ).subscribe(
      ([$goalProgress, $pluginSettings, $selectedDraft, $activeFile]) => {
        if ($goalProgress >= 1 && $pluginSettings.notifyOnGoal) {
          let target: string;
          if ($pluginSettings.applyGoalTo === "all") {
            target = "all";
          } else if ($pluginSettings.applyGoalTo === "project") {
            target = `draft::${$selectedDraft.vaultPath}`;
          } else if ($pluginSettings.applyGoalTo === "note") {
            if ($selectedDraft && $selectedDraft.format === "single") {
              target = `note::${$selectedDraft.vaultPath}`;
            } else if (
              $selectedDraft &&
              $selectedDraft.format === "scenes" &&
              $activeFile
            ) {
              target = `note::${$activeFile.path}`;
            }
          }
          if (
            target &&
            !this.writingSessionTracker.goalsNotifiedFor.has(target)
          ) {
            this.writingSessionTracker.goalsNotifiedFor.add(target);
            new Notice("Writing goal met!");
          }
        }
      }
    );

    this.initLeaf();
    initialized.set(true);

    // A stored path can outlive the project it pointed at (moved folder,
    // renamed file, or a fresh install with no saved selection). Resolve it
    // once projects exist, and keep resolving as late discoveries arrive.
    this.ensureSelectedDraft();
    this.unsubscribeDraftSelection = drafts.subscribe(() => {
      if (get(initialized)) {
        this.ensureSelectedDraft();
      }
    });
  }

  private ensureSelectedDraft(): void {
    const storedPath = get(selectedDraftVaultPath);
    const selected = draftForStoredPath(storedPath, get(drafts));
    if (!selected || selected.vaultPath === storedPath) {
      return;
    }

    selectedDraftVaultPath.set(selected.vaultPath);
    pluginSettings.update((settings) => ({
      ...settings,
      selectedDraftVaultPath: selected.vaultPath,
    }));
    this.cachedSettings = get(pluginSettings);
    void this.saveSettings();
  }

  initLeaf(): void {
    if (
      this.app.workspace.getLeavesOfType(VIEW_TYPE_LONGFORM_EXTENDED_EXPLORER).length
    ) {
      return;
    }
    void this.app.workspace.getLeftLeaf(false).setViewState({
      type: VIEW_TYPE_LONGFORM_EXTENDED_EXPLORER,
    });
  }

  private watchProjects(): void {
    // STORE-VAULT SYNC
    // storeVaultSync.initialize() has already completed the initial discovery.
    // Running it a second time here stacked duplicate store subscriptions.

    this.registerEvent(
      this.app.metadataCache.on("changed", (file, data, cache) =>
        this.storeVaultSync.fileMetadataChanged(file, data, cache)
      )
    );

    // GENERATED NOTES
    this.registerEvent(
      this.app.metadataCache.on("changed", (file, data, cache) =>
        this.notesObserver.fileMetadataChanged(file, data, cache)
      )
    );

    // Any vault change can affect a project's timeline or kanban (scene edits,
    // scene/project creation, deletion, or rename). The observer debounces and
    // maps each path to its owning scenes project(s).
    this.registerEvent(
      this.app.vault.on("modify", (file) =>
        this.notesObserver.fileModified(file)
      )
    );

    this.registerEvent(
      this.app.vault.on("create", (file) =>
        this.notesObserver.fileCreated(file)
      )
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) =>
        this.notesObserver.fileDeleted(file)
      )
    );

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) =>
        this.notesObserver.fileRenamed(file, oldPath)
      )
    );

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile) {
          void this.storeVaultSync.fileCreated(file);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile) {
          void this.storeVaultSync.fileDeleted(file);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof TFile) {
          void this.storeVaultSync.fileRenamed(file, oldPath);
        }
      })
    );

    // WORD COUNTS
    this.registerEvent(
      this.app.vault.on("modify", (file) =>
        this.writingSessionTracker.fileModified(file)
      )
    );

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        void this.writingSessionTracker.debouncedCountDraftContaining(file);
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        void this.writingSessionTracker.debouncedCountDraftContaining(file);
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", (file) => {
        void this.writingSessionTracker.debouncedCountDraftContaining(file);
      })
    );
  }

  private styleLongformExtendedLeaves(allDrafts: Draft[] = get(drafts)) {
    this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
      if (leaf.view instanceof FileView) {
        const draft = draftForPath(leaf.view.file.path, allDrafts);
        if (draft) {
          leaf.view.containerEl.classList.add(LONGFORM_EXTENDED_LEAF_CLASS);
        } else {
          leaf.view.containerEl.classList.remove(LONGFORM_EXTENDED_LEAF_CLASS);
        }
      }

      const leafId = (leaf as WorkspaceLeaf & { id: string }).id;
      if (leafId) {
        leaf.view.containerEl.dataset.leafId = leafId;
      }
    });
  }
}
