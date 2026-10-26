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
  DEFAULT_KANBAN_COLUMNS,
  DEFAULT_KANBAN_OUTPUT_PATH,
  DEFAULT_PLOT_GRID_CHARACTERS_DIR,
  DEFAULT_PLOT_GRID_OUTPUT_PATH,
  DEFAULT_PLOT_GRID_PLOTS_DIR,
  DEFAULT_TIMEFRAME_TAG_NAME,
  DEFAULT_TIMELINE_OUTPUT_PATH,
  DEFAULT_TIME_FORMAT,
  isTimeframeFormat,
  type Draft,
  type MultipleSceneDraft,
} from "./types";
import {
  auxiliaryFolder,
  auxiliaryNoteFiles,
  reconcileAuxiliaryList,
  type AuxiliaryNoteKind,
} from "./auxiliary-notes";
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
import { findScene, sceneFolderPath, scenePath } from "./scene-navigation";

type FileWithMetadata = {
  file: TFile;
  metadata: CachedMetadata;
};

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
    this.unsubscribeDraftsStore();
  }

  private isSyncEnabled(): boolean {
    try {
      // @ts-ignore - accessing private API
      const syncPlugin = this.app.internalPlugins?.plugins?.sync;
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
      // @ts-ignore - accessing private API
      const sync = this.app.internalPlugins.plugins.sync.instance;

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

        console.log("[Longform Extended] Waiting for active sync to complete...");

        // Poll sync status every second
        const interval = setInterval(() => {
          if (!sync.syncing) {
            clearInterval(interval);
            clearTimeout(timeout);  // Clear the timeout when sync completes
            console.log("[Longform Extended] Sync complete.");
            waitingForSync.set(false);
            resolve();
          }
          console.log("[Longform Extended] Sync status:", sync.syncStatus);
        }, 1000);

        // Add a timeout just in case sync never completes
        const timeout = setTimeout(() => {
          clearInterval(interval);
          console.log("[Longform Extended] Sync wait timed out");
          waitingForSync.set(false);
          resolve();
        }, this.settlingTime);
      });
    } catch (error) {
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
      setTimeout(resolve, settings.fallbackWaitTime * 1000)
    );
  }

  async initialize() {
    try {
      await this.waitForSync();
      await this.discoverDrafts();

      this.isInitializing = false;
    } catch (error) {
      this.isInitializing = false;
    }
  }

  async discoverDrafts() {
    const start = new Date().getTime();

    const files = this.vault.getMarkdownFiles();
    const resolvedFiles = files.map((f) =>
      resolveIfLongformExtendedFile(this.metadataCache, f)
    );
    const draftFiles = resolvedFiles.filter((f) => f !== null);

    const possibleDrafts = await Promise.all(
      draftFiles.map((f) => this.draftFor(f))
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

    const message = `[Longform Extended] Loaded and watching projects. Found ${draftFiles.length
      } drafts in ${(new Date().getTime() - start) / 1000.0}s.`;

    console.log(message);

    this.unsubscribeDraftsStore = draftsStore.subscribe(
      this.draftsStoreChanged.bind(this)
    );
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

    this.addAuxiliaryNote(file);
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
      this.renameAuxiliaryNote(file, oldPath, drafts);

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

  /** The auxiliary tree a path belongs to for a draft, if any. */
  private auxiliaryKindForPath(
    draft: MultipleSceneDraft,
    path: string
  ): AuxiliaryNoteKind | null {
    for (const kind of ["plots", "characters"] as const) {
      if (
        isInsidePlotGridDirectory(auxiliaryFolder(this.app, draft, kind), path)
      ) {
        return kind;
      }
    }
    return null;
  }

  /** Adds a note that appeared in a plot/character folder to its overlay. */
  private addAuxiliaryNote(file: TFile): boolean {
    const isMember = get(draftsStore).some(
      (draft) =>
        draft.format === "scenes" &&
        this.auxiliaryKindForPath(draft, file.path) !== null
    );
    if (!isMember) {
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
        if (!draft[kind].some((entry) => entry.title === file.basename)) {
          draft[kind] = [
            ...draft[kind],
            { title: file.basename, indent: 0 },
          ];
          changed = true;
        }
        return draft;
      });
    });

    return changed;
  }

  /** Removes a deleted note from any plot/character overlay. */
  private removeAuxiliaryNote(file: TFile, drafts: Draft[]): boolean {
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
          draft[kind] = draft[kind].filter(
            (entry) => entry.title !== file.basename
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
  private renameAuxiliaryNote(
    file: TFile,
    oldPath: string,
    drafts: Draft[]
  ): void {
    const oldName = fileNameFromPath(oldPath);
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
          const index = draft[oldKind].findIndex(
            (entry) => entry.title === oldName
          );
          if (index >= 0 && oldKind === newKind) {
            draft[oldKind][index] = {
              ...draft[oldKind][index],
              title: newName,
            };
            return draft;
          }
          if (index >= 0) {
            draft[oldKind] = draft[oldKind].filter(
              (entry) => entry.title !== oldName
            );
          }
        }

        if (
          newKind &&
          !draft[newKind].some((entry) => entry.title === newName)
        ) {
          draft[newKind] = [
            ...draft[newKind],
            { title: newName, indent: 0 },
          ];
        }
        return draft;
      });
    });
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
    const longformEntry = fileWithMetadata.metadata.frontmatter["longform"];
    if (!longformEntry) {
      return null;
    }
    const format = longformEntry["format"];
    const vaultPath = fileWithMetadata.file.path;
    let title = longformEntry["title"];
    let titleInFrontmatter = true;
    if (!title) {
      titleInFrontmatter = false;
      title = fileNameFromPath(vaultPath);
    }
    const workflow = longformEntry["workflow"] ?? null;
    const draftTitle = longformEntry["draftTitle"] ?? null;

    if (format === "scenes") {
      let rawScenes: any = longformEntry["scenes"] ?? [];

      if (rawScenes.length === 0) {
        // fallback for issue where the metadata cache seems to fail to recognize yaml arrays.
        // in this case, it reports the array as empty when it's not,
        // so we will parse out the yaml directly from the file contents, just in case.
        // discord discussion: https://discord.com/channels/686053708261228577/840286264964022302/994589562082951219

        // 2023-01-03: Confirmed this issue is still present; using new processFrontMatter function
        // seems to read correctly, though!

        let fm = null;
        try {
          await this.app.fileManager.processFrontMatter(
            fileWithMetadata.file,
            (_fm) => {
              fm = _fm;
            }
          );
        } catch (error) {
          console.error(
            "[Longform Extended] error manually loading frontmatter:",
            error
          );
        }

        if (fm) {
          rawScenes = fm["longform"]["scenes"];
        }
      }

      // Convert to indented scenes
      const scenes = arraysToIndentedScenes(rawScenes);
      const sceneFolder = longformEntry["sceneFolder"] ?? "/";
      const sceneTemplate = longformEntry["sceneTemplate"] ?? null;
      const plotTemplate = longformEntry["plotTemplate"] ?? null;
      const characterTemplate = longformEntry["characterTemplate"] ?? null;
      const timeframeTagName =
        longformEntry["timeframeTagName"] ?? DEFAULT_TIMEFRAME_TAG_NAME;
      const timeFormat = isTimeframeFormat(longformEntry["timeFormat"])
        ? longformEntry["timeFormat"]
        : DEFAULT_TIME_FORMAT;
      const kanbanColumns =
        typeof longformEntry["kanbanColumns"] === "string"
          ? longformEntry["kanbanColumns"]
          : DEFAULT_KANBAN_COLUMNS;
      const kanbanShowUnassigned =
        longformEntry["kanbanShowUnassigned"] === true;
      const kanbanSaveWordCounts =
        longformEntry["kanbanSaveWordCounts"] !== false;
      const kanbanEnabled = longformEntry["kanbanEnabled"] !== false;
      const kanbanIncludePlots =
        longformEntry["kanbanIncludePlots"] !== false;
      const timelineEnabled = longformEntry["timelineEnabled"] !== false;
      const kanbanOutputPath =
        typeof longformEntry["kanbanOutputPath"] === "string"
          ? longformEntry["kanbanOutputPath"]
          : DEFAULT_KANBAN_OUTPUT_PATH;
      const timelineOutputPath =
        typeof longformEntry["timelineOutputPath"] === "string"
          ? longformEntry["timelineOutputPath"]
          : DEFAULT_TIMELINE_OUTPUT_PATH;
      const plotGridEnabled = longformEntry["plotGridEnabled"] !== false;
      const plotGridOutputPath =
        typeof longformEntry["plotGridOutputPath"] === "string"
          ? longformEntry["plotGridOutputPath"]
          : DEFAULT_PLOT_GRID_OUTPUT_PATH;
      const plotGridPlotsDir =
        typeof longformEntry["plotGridPlotsDir"] === "string"
          ? longformEntry["plotGridPlotsDir"]
          : DEFAULT_PLOT_GRID_PLOTS_DIR;
      const plotGridCharactersDir =
        typeof longformEntry["plotGridCharactersDir"] === "string"
          ? longformEntry["plotGridCharactersDir"]
          : DEFAULT_PLOT_GRID_CHARACTERS_DIR;
      const ignoredFiles: string[] = longformEntry["ignoredFiles"] ?? [];
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
            (maybeName) => maybeName !== null && maybeName !== undefined
          ) as string[];
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
      dirty = dirty || plots.dirty || characters.dirty;

      return {
        draft: {
          format: "scenes",
          title,
          titleInFrontmatter,
          draftTitle,
          vaultPath,
          sceneFolder,
          scenes: knownScenes,
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
      console.log(
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

    await this.app.fileManager.processFrontMatter(file, (fm) => {
      setDraftOnFrontmatterObject(fm, draft);
    });

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
    numberScenes(draft.scenes).map((numberedScene, index) => {
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
  return app.fileManager.processFrontMatter(file, (fm) => {
    fm["longform-order"] = index;
    fm["longform-number"] = formatSceneNumber(numbering);
  });
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
