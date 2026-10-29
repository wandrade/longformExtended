import {
  normalizePath,
  TFile,
  type App,
  type CachedMetadata,
  type MetadataCache,
  type Vault,
} from "obsidian";
import { cloneDeep, isEqual } from "lodash";
import { get, type Unsubscriber } from "svelte/store";

import {
  DEFAULT_CHARACTERS_DISPLAY_NAME,
  DEFAULT_KANBAN_COLUMNS,
  DEFAULT_KANBAN_OUTPUT_PATH,
  DEFAULT_PLOT_GRID_CHARACTERS_DIR,
  autocompileMinutesSetting,
  DEFAULT_PLOT_GRID_OUTPUT_PATH,
  DEFAULT_PLOT_GRID_PLOTS_DIR,
  DEFAULT_PLOTS_DISPLAY_NAME,
  DEFAULT_SCENE_DISPLAY_NAME,
  DEFAULT_TIMEFRAME_TAG_NAME,
  DEFAULT_TIMELINE_OUTPUT_PATH,
  DEFAULT_TIME_FORMAT,
  isTimeframeFormat,
  type Draft,
  type MultipleSceneDraft,
  type NoteGroup,
} from "./types";
import {
  auxiliaryNoteFiles,
  reconcileAuxiliaryList,
  type AuxiliaryNoteKind,
} from "./auxiliary-notes";
import {
  customNoteGroupKey,
  noteGroupDescriptors,
  noteGroupEntries,
  noteGroupFolder,
  parseNoteGroups,
  setNoteGroupEntries,
} from "./note-groups";
import { isInsidePlotGridDirectory } from "./plot-grid";
import {
  drafts as draftsStore,
  pluginSettings,
  waitingForSync,
  selectedDraftVaultPath,
} from "./stores";
import {
  arraysToIndentedScenes,
  formatSceneNumber,
  numberScenes,
  setDraftOnFrontmatterObject,
} from "src/model/draft-utils";
import { fileNameFromPath } from "./note-utils";
import { applyDefaultKanbanStatus } from "./kanban-status";
import { findScene, sceneFolderPath, scenePath } from "./scene-navigation";

type FileWithMetadata = {
  file: TFile;
  metadata: CachedMetadata;
};

type SyncPluginState = {
  enabled?: boolean;
  instance?: {
    syncing?: boolean;
    syncStatus?: unknown;
  };
};

type AppWithInternalPlugins = {
  internalPlugins?: {
    plugins?: Record<string, SyncPluginState>;
  };
};

function syncPluginState(app: App): SyncPluginState | undefined {
  return (app as unknown as AppWithInternalPlugins).internalPlugins?.plugins
    ?.sync;
}

/** A persisted display name, falling back to the built-in default. */
export function noteGroupDisplayNameSetting(
  value: unknown,
  fallback: string
): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

/**
 * Reconciles every custom group's order/indent overlay with the notes that
 * actually exist in its folder. The folder owns membership; the overlay only
 * owns order and indentation. Nothing is ever deleted from the vault.
 */
export function reconcileNoteGroups(
  app: App,
  draft: MultipleSceneDraft,
  groups: NoteGroup[]
): { noteGroups: NoteGroup[]; dirty: boolean } {
  // Folder resolution for a custom group reads the group list.
  const scanDraft: MultipleSceneDraft = { ...draft, noteGroups: groups };
  let dirty = false;

  const noteGroups = groups.map((group) => {
    const key = customNoteGroupKey(group.name) as AuxiliaryNoteKind;
    const result = reconcileAuxiliaryList(
      group.entries,
      auxiliaryNoteFiles(app, scanDraft, key).map((file) => file.name)
    );
    dirty = dirty || result.dirty;
    return { ...group, entries: result.list };
  });

  return { noteGroups, dirty };
}

export function resolveIfLongformExtendedFile(
  metadataCache: MetadataCache,
  file: TFile
): FileWithMetadata | null {
  const metadata = metadataCache.getFileCache(file);
  if (metadata && metadata.frontmatter && metadata.frontmatter["longform"]) {
    return { file, metadata };
  }
  return null;
}

/**
 * Observes any file with a `longform` metadata entry and keeps its
 * metadata and associated scenes (if any) updated in the `drafts`
 * store.
 *
 * Subscribes to the `drafts` store and records changes in it to disk.
 *
 * Thus, keeps both store and vault in sync.
 */
export class StoreVaultSync {
  private app: App;
  private vault: Vault;
  private metadataCache: MetadataCache;
  private isInitializing = true;
  private settlingTime = 30000; // fallback settling time

  private lastKnownDraftsByPath: Record<string, Draft> = {};
  private unsubscribeDraftsStore: Unsubscriber;

  private pathsToIgnoreNextChange: Set<string> = new Set();

  constructor(app: App) {
    this.app = app;
    this.vault = app.vault;
    this.metadataCache = app.metadataCache;
  }

  destroy(): void {
    this.unsubscribeDraftsStore?.();
  }

  private isSyncEnabled(): boolean {
    try {
      const syncPlugin = syncPluginState(this.app);
      return syncPlugin?.enabled === true;
    } catch {
      return false;
    }
  }

  private async waitForSync(): Promise<void> {
    const settings = get(pluginSettings);

    // First check if "wait for sync" in setting or the Sync plugin itself is enabled
    if (!settings.waitForSync || !this.isSyncEnabled()) {
      return Promise.resolve();
    }

    try {
      const sync = syncPluginState(this.app)?.instance;

      // Set waitingForSync to disable watchers and enable loading spinner
      waitingForSync.set(true);

      // Check if we can't access the sync status (possibly due to Sync plugin API changes), use fallback wait if not
      if (!sync?.syncing) {
        return this.fallbackWait();
      }

      return new Promise((resolve) => {
        if (!sync.syncing) {
          waitingForSync.set(false);
          resolve();
          return;
        }

        // Poll sync status every second
        const interval = window.setInterval(() => {
          if (!sync.syncing) {
            window.clearInterval(interval);
            window.clearTimeout(timeout); // Clear the timeout when sync completes
            waitingForSync.set(false);
            resolve();
          }
        }, 1000);

        // Add a timeout just in case sync never completes
        const timeout = window.setTimeout(() => {
          window.clearInterval(interval);
          waitingForSync.set(false);
          resolve();
        }, this.settlingTime);
      });
    } catch {
      waitingForSync.set(false);
      return this.fallbackWait();
    }
  }

  private async fallbackWait(): Promise<void> {
    const settings = get(pluginSettings);
    if (!settings.fallbackWaitEnabled) {
      return Promise.resolve();
    }

    return new Promise(resolve =>
      window.setTimeout(resolve, settings.fallbackWaitTime * 1000)
    );
  }

  async initialize() {
    try {
      await this.waitForSync();
      await this.discoverDrafts();
    } catch (error) {
      // A failure here used to be silent and left the explorer with no drafts.
      // Log it and let the metadata-cache listeners recover what they can.
      console.error(
        "[Longform Extended] Failed to discover projects during startup:",
        error
      );
    } finally {
      this.isInitializing = false;
    }
  }

  async discoverDrafts() {
    const files = this.vault.getMarkdownFiles();
    const resolvedFiles = files.map((f) =>
      resolveIfLongformExtendedFile(this.metadataCache, f)
    );
    const draftFiles = resolvedFiles.filter((f) => f !== null);

    // One malformed project must not hide every other project in the vault.
    const possibleDrafts = await Promise.all(
      draftFiles.map(async (f) => {
        try {
          return await this.draftFor(f);
        } catch (error) {
          console.error(
            `[Longform Extended] Failed to load project at ${f.file.path}:`,
            error
          );
          return null;
        }
      })
    );
    const drafts = possibleDrafts.filter((d) => d !== null);

    // Write dirty drafts back to their index files
    const dirtyDrafts = drafts.filter((d) => d.dirty);
    for (const d of dirtyDrafts) {
      await this.writeDraftFrontmatter(d.draft);
    }

    // Write discovered drafts to draft store
    const draftsToWrite = drafts.map((d) => d.draft);

    this.lastKnownDraftsByPath = cloneDeep(
      draftsToWrite.reduce((acc: Record<string, Draft>, d) => {
        acc[d.vaultPath] = d;
        return acc;
      }, {})
    );
    draftsStore.set(draftsToWrite);

    // discoverDrafts can run again after a metadata-cache refresh. Replacing
    // the subscription keeps a single writer instead of stacking one per run.
    this.unsubscribeDraftsStore?.();
    this.unsubscribeDraftsStore = draftsStore.subscribe((drafts) => {
      void this.draftsStoreChanged(drafts);
    });
  }

  async fileMetadataChanged(file: TFile, _data: string, cache: CachedMetadata) {
    if (this.isInitializing) return;
    if (this.pathsToIgnoreNextChange.delete(file.path)) {
      return;
    }

    const result = await this.draftFor({ file, metadata: cache });
    if (!result) {
      const testDeletedDraft = this.lastKnownDraftsByPath[file.path];
      if (testDeletedDraft) {
        // a draft's YAML was removed, remove it from drafts
        draftsStore.update((drafts) => {
          return drafts.filter((d) => d.vaultPath !== file.path);
        });
      }
      return;
    }

    const { draft } = result;

    const old = this.lastKnownDraftsByPath[draft.vaultPath];
    if (!old || !isEqual(draft, old)) {
      this.lastKnownDraftsByPath[draft.vaultPath] = draft;
      draftsStore.update((drafts) => {
        const indexOfDraft = drafts.findIndex(
          (d) => d.vaultPath === draft.vaultPath
        );
        if (indexOfDraft < 0) {
          //new draft
          drafts.push(draft);
        } else {
          drafts[indexOfDraft] = draft;
        }
        return drafts;
      });
    }
  }

  async fileCreated(file: TFile) {
    if (this.isInitializing) return;
    const drafts = get(draftsStore);

    // check if a new scene has been moved into this folder
    const scenePath = file.parent.path;
    const memberOfDraft = drafts.find((d) => {
      if (d.format !== "scenes") {
        return false;
      }
      const parentPath = this.vault.getAbstractFileByPath(d.vaultPath).parent
        .path;
      const targetPath = normalizePath(`${parentPath}/${d.sceneFolder}`);
      return (
        // file is in the scene folder
        targetPath === scenePath &&
        // file isn't already a scene
        !d.scenes.map((s) => s.title).contains(file.basename)
      );
    });
    if (memberOfDraft) {
      draftsStore.update((allDrafts) => {
        return allDrafts.map((d) => {
          if (
            d.vaultPath === memberOfDraft.vaultPath &&
            d.format === "scenes" &&
            !d.unknownFiles.contains(file.basename)
          ) {
            d.unknownFiles.push(file.basename);
          }
          return d;
        });
      });
    }

    await this.addAuxiliaryNote(file);
  }

  async fileDeleted(file: TFile) {
    if (this.isInitializing) return;
    const drafts = get(draftsStore);
    const draftIndex = drafts.findIndex((d) => d.vaultPath === file.path);
    if (draftIndex >= 0) {
      // index file deletion = delete draft from store
      const newDrafts = cloneDeep(drafts);
      newDrafts.splice(draftIndex, 1);
      draftsStore.set(newDrafts);
      if (get(selectedDraftVaultPath) === file.path) {
        if (newDrafts.length > 0) {
          selectedDraftVaultPath.set(newDrafts[0].vaultPath);
        } else {
          selectedDraftVaultPath.set(null);
        }
      }
    } else {
      // scene deletion = remove scene from draft
      const found = findScene(file.path, drafts);
      if (found) {
        draftsStore.update((_drafts) => {
          return _drafts.map((d) => {
            if (
              d.vaultPath === found.draft.vaultPath &&
              d.format === "scenes"
            ) {
              d.scenes.splice(found.index, 1);
            }
            return d;
          });
        });
      } else if (!this.removeAuxiliaryNote(file, drafts)) {
        // check unknown files, delete from there if present
        const inDraftUnknown = drafts.find(
          (d) => d.format === "scenes" && d.unknownFiles.contains(file.basename)
        );
        if (inDraftUnknown) {
          draftsStore.update((allDrafts) => {
            return allDrafts.map((d) => {
              if (
                d.vaultPath === inDraftUnknown.vaultPath &&
                d.format === "scenes"
              ) {
                d.unknownFiles = d.unknownFiles.filter(
                  (f) => f !== file.basename
                );
              }
              return d;
            });
          });
        }
      }
    }
  }

  async fileRenamed(file: TFile, oldPath: string) {
    if (this.isInitializing) return;
    const drafts = get(draftsStore);
    const draftIndex = drafts.findIndex((d) => d.vaultPath === oldPath);
    if (draftIndex >= 0) {
      // index file renamed
      draftsStore.update((_drafts) => {
        const d = _drafts[draftIndex];
        d.vaultPath = file.path;
        if (!d.titleInFrontmatter) {
          d.title = fileNameFromPath(file.path);
        }
        _drafts[draftIndex] = d;
        return _drafts;
      });
      if (get(selectedDraftVaultPath) === oldPath) {
        selectedDraftVaultPath.set(file.path);
      }
    } else {
      await this.renameAuxiliaryNote(file, oldPath, drafts);

      // scene renamed
      const newTitle = fileNameFromPath(file.path);
      const foundOld = findScene(oldPath, drafts);

      // possibilities here:
      // 1. note was renamed in-place: rename the scene in the associated draft
      // 2. note was moved out of a draft: remove it from the old draft
      // 3. note was moved into a draft: add it to the new draft
      // (2) and (3) can occur for the same note.

      // in-place
      const oldParent = oldPath.split("/").slice(0, -1).join("/");
      if (foundOld && oldParent === file.parent.path) {
        draftsStore.update((_drafts) => {
          return _drafts.map((d) => {
            if (
              d.vaultPath === foundOld.draft.vaultPath &&
              d.format === "scenes"
            ) {
              d.scenes[foundOld.index].title = newTitle;
            }
            return d;
          });
        });
      } else {
        //in and/or out

        // moved out of a draft
        const oldDraft = drafts.find((d) => {
          return (
            d.format === "scenes" &&
            sceneFolderPath(d, this.vault) === oldParent
          );
        });
        if (oldDraft) {
          draftsStore.update((_drafts) => {
            return _drafts.map((d) => {
              if (d.vaultPath === oldDraft.vaultPath && d.format === "scenes") {
                d.scenes = d.scenes.filter((s) => s.title !== file.basename);
                d.unknownFiles = d.unknownFiles.filter(
                  (f) => f !== file.basename
                );
              }
              return d;
            });
          });
        }

        // moved into a draft
        const newDraft = drafts.find((d) => {
          return (
            d.format === "scenes" &&
            sceneFolderPath(d, this.vault) === file.parent.path
          );
        });
        if (newDraft) {
          draftsStore.update((_drafts) => {
            return _drafts.map((d) => {
              if (d.vaultPath === newDraft.vaultPath && d.format === "scenes") {
                d.unknownFiles.push(file.basename);
              }
              return d;
            });
          });
        }
      }
    }
  }

  /** True for the Markdown notes an auxiliary folder contributes. */
  private isAuxiliaryNote(file: TFile): boolean {
    return file instanceof TFile && file.extension.toLowerCase() === "md";
  }

  /** The auxiliary tree a path belongs to for a draft, if any. */
  private auxiliaryKindForPath(
    draft: MultipleSceneDraft,
    path: string
  ): AuxiliaryNoteKind | null {
    for (const descriptor of noteGroupDescriptors(draft)) {
      if (descriptor.key === "scenes") {
        continue;
      }
      if (
        isInsidePlotGridDirectory(
          noteGroupFolder(this.app, draft, descriptor.key),
          path
        )
      ) {
        return descriptor.key;
      }
    }
    return null;
  }

  /** Adds a note that appeared in a plot/character folder to its overlay. */
  private async addAuxiliaryNote(file: TFile): Promise<boolean> {
    if (!this.isAuxiliaryNote(file)) {
      return false;
    }

    const members: { draft: MultipleSceneDraft; kind: AuxiliaryNoteKind }[] =
      [];
    for (const draft of get(draftsStore)) {
      if (draft.format !== "scenes") {
        continue;
      }
      const kind = this.auxiliaryKindForPath(draft, file.path);
      if (kind) {
        members.push({ draft, kind });
      }
    }
    if (members.length === 0) {
      return false;
    }

    let changed = false;

    draftsStore.update((allDrafts) => {
      return allDrafts.map((draft) => {
        if (draft.format !== "scenes") {
          return draft;
        }
        const kind = this.auxiliaryKindForPath(draft, file.path);
        if (!kind) {
          return draft;
        }
        const entries = noteGroupEntries(draft, kind);
        if (!entries.some((entry) => entry.title === file.basename)) {
          setNoteGroupEntries(draft, kind, [
            ...entries,
            { title: file.basename, indent: 0 },
          ]);
          changed = true;
        }
        return draft;
      });
    });

    // A subplot can appear on the board, so a note that joins the project from
    // outside the plugin receives the same first-column default as a created
    // subplot. Character and custom group notes never reach the board.
    if (changed) {
      for (const { draft, kind } of members) {
        if (kind === "plots") {
          await applyDefaultKanbanStatus(this.app, file, draft);
        }
      }
    }

    return changed;
  }

  /** Removes a deleted note from any plot/character overlay. */
  private removeAuxiliaryNote(file: TFile, drafts: Draft[]): boolean {
    if (!this.isAuxiliaryNote(file)) {
      return false;
    }

    let member = false;

    for (const draft of drafts) {
      if (
        draft.format === "scenes" &&
        this.auxiliaryKindForPath(draft, file.path)
      ) {
        member = true;
      }
    }
    if (!member) {
      return false;
    }

    draftsStore.update((allDrafts) => {
      return allDrafts.map((draft) => {
        if (draft.format !== "scenes") {
          return draft;
        }
        const kind = this.auxiliaryKindForPath(draft, file.path);
        if (kind) {
          setNoteGroupEntries(
            draft,
            kind,
            noteGroupEntries(draft, kind).filter(
              (entry) => entry.title !== file.basename
            )
          );
        }
        return draft;
      });
    });
    return true;
  }

  /**
   * Keeps the overlay title in step with a rename or move. A rename inside the
   * same tree preserves position and indent; a move out removes the entry; a
   * move in appends it at the root.
   */
  private async renameAuxiliaryNote(
    file: TFile,
    oldPath: string,
    drafts: Draft[]
  ): Promise<void> {
    if (!this.isAuxiliaryNote(file)) {
      return;
    }

    const oldName =
      oldPath.split("/").pop()?.replace(/\.md$/i, "") ??
      fileNameFromPath(oldPath);
    const newName = file.basename;

    let member = false;
    for (const draft of drafts) {
      if (
        draft.format === "scenes" &&
        (this.auxiliaryKindForPath(draft, oldPath) ||
          this.auxiliaryKindForPath(draft, file.path))
      ) {
        member = true;
      }
    }
    if (!member) {
      return;
    }

    // Notes moved in from outside the project get the subplot board default.
    const addedPlots: MultipleSceneDraft[] = [];

    draftsStore.update((allDrafts) => {
      return allDrafts.map((draft) => {
        if (draft.format !== "scenes") {
          return draft;
        }
        const oldKind = this.auxiliaryKindForPath(draft, oldPath);
        const newKind = this.auxiliaryKindForPath(draft, file.path);
        if (!oldKind && !newKind) {
          return draft;
        }

        if (oldKind) {
          const oldEntries = noteGroupEntries(draft, oldKind);
          const index = oldEntries.findIndex(
            (entry) => entry.title === oldName
          );
          if (index >= 0 && oldKind === newKind) {
            oldEntries[index] = { ...oldEntries[index], title: newName };
            setNoteGroupEntries(draft, oldKind, oldEntries);
            return draft;
          }
          if (index >= 0) {
            setNoteGroupEntries(
              draft,
              oldKind,
              oldEntries.filter((entry) => entry.title !== oldName)
            );
          }
        }

        if (newKind) {
          const newEntries = noteGroupEntries(draft, newKind);
          if (!newEntries.some((entry) => entry.title === newName)) {
            setNoteGroupEntries(draft, newKind, [
              ...newEntries,
              { title: newName, indent: 0 },
            ]);
            if (newKind === "plots") {
              addedPlots.push(draft);
            }
          }
        }
        return draft;
      });
    });

    // Only a move into the subplot folder needs the kanban default. Character
    // and custom group notes, and in-place renames, are left alone.
    for (const draft of addedPlots) {
      await applyDefaultKanbanStatus(this.app, file, draft);
    }
  }

  async draftsStoreChanged(newValue: Draft[]) {
    for (const draft of newValue) {
      const old = this.lastKnownDraftsByPath[draft.vaultPath];
      if (!old || !isEqual(draft, old)) {
        this.pathsToIgnoreNextChange.add(draft.vaultPath);
        await this.writeDraftFrontmatter(draft);
      }
    }

    this.lastKnownDraftsByPath = cloneDeep(
      newValue.reduce((acc: Record<string, Draft>, d) => {
        acc[d.vaultPath] = d;
        return acc;
      }, {})
    );
  }

  // if dirty, draft is modified from reality of index file
  // and should be written back to index file
  private async draftFor(
    fileWithMetadata: FileWithMetadata
  ): Promise<{ draft: Draft; dirty: boolean } | null> {
    if (!fileWithMetadata.metadata.frontmatter) {
      return null;
    }
    const longformEntry = fileWithMetadata.metadata.frontmatter[
      "longform"
    ] as Record<string, unknown> | null | undefined;
    if (!longformEntry) {
      return null;
    }
    const format = longformEntry["format"];
    const vaultPath = fileWithMetadata.file.path;
    let title = longformEntry["title"] as string | undefined;
    let titleInFrontmatter = true;
    if (!title) {
      titleInFrontmatter = false;
      title = fileNameFromPath(vaultPath);
    }
    const workflow = (longformEntry["workflow"] ?? null) as string | null;
    const draftTitle = (longformEntry["draftTitle"] ?? null) as string | null;

    if (format === "scenes") {
      let rawScenes = (longformEntry["scenes"] ?? []) as unknown[];

      if (rawScenes.length === 0) {
        // fallback for issue where the metadata cache seems to fail to recognize yaml arrays.
        // in this case, it reports the array as empty when it's not,
        // so we will parse out the yaml directly from the file contents, just in case.
        // discord discussion: https://discord.com/channels/686053708261228577/840286264964022302/994589562082951219

        // 2023-01-03: Confirmed this issue is still present; using new processFrontMatter function
        // seems to read correctly, though!

        let fm: Record<string, unknown> | null = null;
        try {
          await this.app.fileManager.processFrontMatter(
            fileWithMetadata.file,
            (frontmatter: Record<string, unknown>) => {
              fm = frontmatter;
            }
          );
        } catch (error) {
          console.error(
            "[Longform Extended] error manually loading frontmatter:",
            error
          );
        }

        if (fm) {
          const longform = fm["longform"] as Record<string, unknown>;
          rawScenes = longform["scenes"] as unknown[];
        }
      }

      // Convert to indented scenes
      const scenes = arraysToIndentedScenes(rawScenes);
      const sceneFolder = (longformEntry["sceneFolder"] ?? "/") as string;
      const sceneDisplayName = noteGroupDisplayNameSetting(
        longformEntry["sceneDisplayName"],
        DEFAULT_SCENE_DISPLAY_NAME
      );
      const plotsDisplayName = noteGroupDisplayNameSetting(
        longformEntry["plotsDisplayName"],
        DEFAULT_PLOTS_DISPLAY_NAME
      );
      const charactersDisplayName = noteGroupDisplayNameSetting(
        longformEntry["charactersDisplayName"],
        DEFAULT_CHARACTERS_DISPLAY_NAME
      );
      const noteGroups = parseNoteGroups(longformEntry["noteGroups"]);
      const sceneTemplate = (longformEntry["sceneTemplate"] ??
        null) as string | null;
      const plotTemplate = (longformEntry["plotTemplate"] ??
        null) as string | null;
      const characterTemplate = (longformEntry["characterTemplate"] ??
        null) as string | null;
      const timeframeTagName = (longformEntry["timeframeTagName"] ??
        DEFAULT_TIMEFRAME_TAG_NAME) as string;
      const rawTimeFormat = longformEntry["timeFormat"];
      const timeFormat = isTimeframeFormat(rawTimeFormat)
        ? rawTimeFormat
        : DEFAULT_TIME_FORMAT;
      const rawKanbanColumns = longformEntry["kanbanColumns"];
      const kanbanColumns =
        typeof rawKanbanColumns === "string"
          ? rawKanbanColumns
          : DEFAULT_KANBAN_COLUMNS;
      const kanbanShowUnassigned =
        longformEntry["kanbanShowUnassigned"] === true;
      const kanbanSaveWordCounts =
        longformEntry["kanbanSaveWordCounts"] !== false;
      const kanbanEnabled = longformEntry["kanbanEnabled"] !== false;
      const kanbanIncludePlots =
        longformEntry["kanbanIncludePlots"] !== false;
      const timelineEnabled = longformEntry["timelineEnabled"] !== false;
      const rawKanbanOutputPath = longformEntry["kanbanOutputPath"];
      const kanbanOutputPath =
        typeof rawKanbanOutputPath === "string"
          ? rawKanbanOutputPath
          : DEFAULT_KANBAN_OUTPUT_PATH;
      const rawTimelineOutputPath = longformEntry["timelineOutputPath"];
      const timelineOutputPath =
        typeof rawTimelineOutputPath === "string"
          ? rawTimelineOutputPath
          : DEFAULT_TIMELINE_OUTPUT_PATH;
      const plotGridEnabled = longformEntry["plotGridEnabled"] !== false;
      const rawPlotGridOutputPath = longformEntry["plotGridOutputPath"];
      const plotGridOutputPath =
        typeof rawPlotGridOutputPath === "string"
          ? rawPlotGridOutputPath
          : DEFAULT_PLOT_GRID_OUTPUT_PATH;
      const rawPlotGridPlotsDir = longformEntry["plotGridPlotsDir"];
      const plotGridPlotsDir =
        typeof rawPlotGridPlotsDir === "string"
          ? rawPlotGridPlotsDir
          : DEFAULT_PLOT_GRID_PLOTS_DIR;
      const rawPlotGridCharactersDir =
        longformEntry["plotGridCharactersDir"];
      const plotGridCharactersDir =
        typeof rawPlotGridCharactersDir === "string"
          ? rawPlotGridCharactersDir
          : DEFAULT_PLOT_GRID_CHARACTERS_DIR;
      const autocompileMinutes = autocompileMinutesSetting(
        longformEntry["autocompileMinutes"]
      );
      const ignoredFiles = (longformEntry["ignoredFiles"] ?? []) as string[];
      const normalizedSceneFolder = normalizePath(
        `${fileWithMetadata.file.parent.path}/${sceneFolder}`
      );

      let filenamesInSceneFolder: string[] = [];
      if (await this.vault.adapter.exists(normalizedSceneFolder)) {
        filenamesInSceneFolder = (
          await this.vault.adapter.list(normalizedSceneFolder)
        ).files
          .filter((f) => f !== fileWithMetadata.file.path && f.endsWith(".md"))
          .map((f) => this.vault.getAbstractFileByPath(f)?.name.slice(0, -3))
          .filter(
            (maybeName): maybeName is string =>
              maybeName !== null && maybeName !== undefined
          );
      }

      // Filter removed scenes
      const knownScenes = scenes.filter(({ title }) =>
        filenamesInSceneFolder.contains(title)
      );

      let dirty = knownScenes.length !== scenes.length;

      const sceneTitles = new Set(scenes.map((s) => s.title));
      const newScenes = filenamesInSceneFolder.filter(
        (s) => !sceneTitles.has(s)
      );

      // ignore all new scenes that are known-to-ignore per ignoredFiles
      const ignoredRegexes = ignoredFiles.filter(n => n).map((p) => ignoredPatternToRegex(p));
      const unknownFiles = newScenes.filter(
        (s) => ignoredRegexes.find((r) => r.test(s)) === undefined
      );

      // Reconcile the Plots/Characters tab overlays with their folders. The
      // folders own membership; the overlays only own order and indentation.
      const draftDirectories = {
        vaultPath,
        plotGridPlotsDir,
        plotGridCharactersDir,
        noteGroups,
      } as MultipleSceneDraft;
      const plots = reconcileAuxiliaryList(
        arraysToIndentedScenes(longformEntry["plots"] ?? []),
        auxiliaryNoteFiles(this.app, draftDirectories, "plots").map(
          (file) => file.name
        )
      );
      const characters = reconcileAuxiliaryList(
        arraysToIndentedScenes(longformEntry["characters"] ?? []),
        auxiliaryNoteFiles(this.app, draftDirectories, "characters").map(
          (file) => file.name
        )
      );
      // Custom groups reconcile exactly like the built-in auxiliary trees:
      // the folder owns membership and the overlay only stores order/indent.
      const reconciledNoteGroups = reconcileNoteGroups(
        this.app,
        draftDirectories,
        noteGroups
      );
      dirty =
        dirty || plots.dirty || characters.dirty || reconciledNoteGroups.dirty;

      return {
        draft: {
          format: "scenes",
          title,
          titleInFrontmatter,
          draftTitle,
          vaultPath,
          sceneFolder,
          scenes: knownScenes,
          sceneDisplayName,
          plotsDisplayName,
          charactersDisplayName,
          noteGroups: reconciledNoteGroups.noteGroups,
          ignoredFiles,
          unknownFiles,
          sceneTemplate,
          plotTemplate,
          characterTemplate,
          plots: plots.list,
          characters: characters.list,
          timeframeTagName,
          timeFormat,
          kanbanColumns,
          kanbanShowUnassigned,
          kanbanSaveWordCounts,
          kanbanEnabled,
          kanbanIncludePlots,
          kanbanOutputPath,
          timelineEnabled,
          timelineOutputPath,
          plotGridEnabled,
          plotGridOutputPath,
          plotGridPlotsDir,
          plotGridCharactersDir,
          autocompileMinutes,
          workflow,
        },
        dirty,
      };
    } else if (format === "single") {
      return {
        draft: {
          format: "single",
          title,
          titleInFrontmatter,
          draftTitle,
          vaultPath,
          workflow,
        },
        dirty: false,
      };
    } else {
      console.warn(
        `[Longform Extended] Error loading draft at ${fileWithMetadata.file.path}: invalid longform.format. Ignoring.`
      );
      return null;
    }
  }

  private async writeDraftFrontmatter(draft: Draft) {
    const file = this.app.vault.getAbstractFileByPath(draft.vaultPath);
    if (!file || !(file instanceof TFile)) {
      return;
    }

    await this.app.fileManager.processFrontMatter(
      file,
      (fm: Record<string, unknown>) => {
        setDraftOnFrontmatterObject(fm, draft);
      }
    );

    // for multi-scene projects, optionally set a property on each scene that holds its order within the project
    if (get(pluginSettings).writeProperty) {
      if (draft.format === "scenes") {
        const writes: Promise<void>[] = [];
        const sceneNumbers = numberScenes(draft.scenes);
        sceneNumbers.forEach((numberedScene, index) => {
          const sceneFilePath = scenePath(
            numberedScene.title,
            draft,
            this.app.vault
          );

          const sceneFile = this.app.vault.getAbstractFileByPath(sceneFilePath);
          // false if a folder, or not found
          if (!(sceneFile instanceof TFile)) {
            return;
          }
          writes.push(
            writeSceneNumbers(
              this.app,
              sceneFile,
              index,
              numberedScene.numbering
            )
          );
        });

        await Promise.all(writes);
      }
    }
  }
}

export function syncSceneIndices(app: App): void | Promise<void[]> {
  const writes: Promise<void>[] = [];
  get(draftsStore).forEach((draft) => {
    if (draft.format !== "scenes") return;
    void numberScenes(draft.scenes).map((numberedScene, index) => {
      const sceneFilePath = scenePath(numberedScene.title, draft, app.vault);

      const sceneFile = app.vault.getAbstractFileByPath(sceneFilePath);
      // false if a folder, or not found
      if (!(sceneFile instanceof TFile)) {
        return;
      }
      return writeSceneNumbers(app, sceneFile, index, numberedScene.numbering);
    });
  });
  if (writes.length === 0) return;
  return Promise.all(writes);
}

function writeSceneNumbers(
  app: App,
  file: TFile,
  index: number,
  numbering: number[]
) {
  return app.fileManager.processFrontMatter(
    file,
    (fm: Record<string, unknown>) => {
      fm["longform-order"] = index;
      fm["longform-number"] = formatSceneNumber(numbering);
    }
  );
}

const ESCAPED_CHARACTERS = new Set("/&$^+.()=!|[]{},".split(""));
function ignoredPatternToRegex(pattern: string): RegExp {
  let regex = "";

  for (let index = 0; index < pattern.length; index++) {
    const c = pattern[index];

    if (ESCAPED_CHARACTERS.has(c)) {
      regex += "\\" + c;
    } else if (c === "*") {
      regex += ".*";
    } else if (c === "?") {
      regex += ".";
    } else {
      regex += c;
    }
  }

  return new RegExp(`^${regex}$`);
}
