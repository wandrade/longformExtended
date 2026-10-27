import {
  type App,
  type CachedMetadata,
  normalizePath,
  type TAbstractFile,
} from "obsidian";
import { get, type Unsubscriber } from "svelte/store";

import {
  buildKanban,
  writeKanbanBase,
  writeKanbanWordCounts,
} from "./kanban";
import { configuredOutputPath } from "./generated-note";
import { isPlotGridPath, writePlotGrid } from "./plot-grid";
import { draftForPath } from "./scene-navigation";
import { drafts as draftsStore, draftWordCounts } from "./stores";
import { buildTimeline, writeTimeline } from "./timeline";
import {
  DEFAULT_KANBAN_OUTPUT_PATH,
  DEFAULT_PLOT_GRID_OUTPUT_PATH,
  DEFAULT_TIMELINE_OUTPUT_PATH,
  type MultipleSceneDraft,
} from "./types";

/**
 * Coalesces bursts of vault events (typing saves, frontmatter writes, bulk
 * edits) into a single rebuild per project.
 */
const REBUILD_DEBOUNCE_MS = 400;

/** Generated outputs must never trigger a rebuild. */
const GENERATED_SUFFIXES = ["_timeline.md", "_kanban.base", "_plotgrid.base"];

/** Rebuilds generated notes when scene values or project structure change. */
export class ProjectNotesObserver {
  private app: App;
  private signatures = new Map<string, string>();
  private unsubscribeDrafts: Unsubscriber | null = null;
  private unsubscribeWordCounts: Unsubscriber | null = null;
  private wordCountSyncTimeout: number | null = null;
  private rebuildTimeouts = new Map<string, number>();
  private rebuilding = new Set<string>();
  private pending = new Set<string>();
  private plotGridSkips = new Map<string, string>();
  private destroyed = false;

  constructor(app: App) {
    this.app = app;
  }

  beginObserving(): void {
    this.sync(false);
    this.unsubscribeDrafts = draftsStore.subscribe(() => this.sync(true));
    this.unsubscribeWordCounts = draftWordCounts.subscribe(() =>
      this.scheduleWordCountSync()
    );
    this.rebuildAll();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.unsubscribeDrafts) {
      this.unsubscribeDrafts();
    }
    if (this.unsubscribeWordCounts) {
      this.unsubscribeWordCounts();
    }
    if (this.wordCountSyncTimeout !== null) {
      window.clearTimeout(this.wordCountSyncTimeout);
      this.wordCountSyncTimeout = null;
    }
    for (const timeout of this.rebuildTimeouts.values()) {
      window.clearTimeout(timeout);
    }
    this.rebuildTimeouts.clear();
    this.plotGridSkips.clear();
  }

  /** A vault file or folder was created. */
  fileCreated(file: TAbstractFile): void {
    this.scheduleRebuildsForPath(file.path);
  }

  /** A vault file or folder was modified. */
  fileModified(file: TAbstractFile): void {
    this.scheduleRebuildsForPath(file.path);
  }

  /** A vault file or folder was deleted. */
  fileDeleted(file: TAbstractFile): void {
    this.scheduleRebuildsForPath(file.path);
  }

  /** A vault file or folder was renamed or moved. */
  fileRenamed(file: TAbstractFile, oldPath: string): void {
    // Map both sides: the old path identifies the project that used to own the
    // file (e.g. a scene moved out or a project folder renamed), the new path
    // identifies the project that owns it now.
    this.scheduleRebuildsForPath(oldPath);
    this.scheduleRebuildsForPath(file.path);
  }

  /**
   * Metadata cache changed. Vault events cover most edits already; this also
   * catches changes produced by Obsidian itself (external sync, indexing)
   * that do not emit a vault event.
   */
  fileMetadataChanged(
    file: TAbstractFile,
    _data: string,
    _cache: CachedMetadata
  ): void {
    this.scheduleRebuildsForPath(file.path);
  }

  private scheduleRebuildsForPath(path: string): void {
    if (this.destroyed || isGeneratedOutput(path)) {
      return;
    }

    const drafts = this.scenesDrafts();
    if (drafts.length === 0) {
      return;
    }

    const normalized = normalizePath(path);
    if (this.isConfiguredOutput(normalized, drafts)) {
      return;
    }

    for (const draft of this.draftsForPath(normalized, drafts)) {
      this.scheduleRebuild(draft);
    }
  }

  /**
   * True when the path is one of a project's configured timeline, kanban, or
   * plot-grid outputs. The suffix check above covers the defaults; this also
   * covers custom output paths, which would otherwise look like ordinary
   * project files and retrigger a rebuild whenever they are written.
   */
  private isConfiguredOutput(
    path: string,
    drafts: MultipleSceneDraft[]
  ): boolean {
    for (const draft of drafts) {
      try {
        const timelinePath = configuredOutputPath(
          this.app,
          draft,
          draft.timelineOutputPath,
          DEFAULT_TIMELINE_OUTPUT_PATH,
          ".md"
        );
        if (path === timelinePath) {
          return true;
        }

        const kanbanPath = configuredOutputPath(
          this.app,
          draft,
          draft.kanbanOutputPath,
          DEFAULT_KANBAN_OUTPUT_PATH,
          ".base"
        );
        if (path === kanbanPath) {
          return true;
        }

        const plotGridPath = configuredOutputPath(
          this.app,
          draft,
          draft.plotGridOutputPath,
          DEFAULT_PLOT_GRID_OUTPUT_PATH,
          ".base"
        );
        if (path === plotGridPath) {
          return true;
        }
      } catch {
        // A project note that was just deleted or renamed may not resolve yet.
      }
    }
    return false;
  }

  private scenesDrafts(): MultipleSceneDraft[] {
    return get(draftsStore).filter(
      (draft): draft is MultipleSceneDraft => draft.format === "scenes"
    );
  }

  /**
   * Finds the scenes project(s) owning a path. The project note and known
   * scene paths are matched exactly first. Otherwise the path's folder is
   * used so that scenes which are being created, deleted, or renamed before
   * the drafts store reflects them still map to their project.
   *
   * Plot/character row directories are matched independently of the project
   * folder, so a `Bible/` directory at the vault root still maps its notes to
   * the project that reads them.
   */
  private draftsForPath(
    path: string,
    drafts: MultipleSceneDraft[]
  ): MultipleSceneDraft[] {
    const normalized = normalizePath(path);
    const matched = new Map<string, MultipleSceneDraft>();
    const add = (candidates: MultipleSceneDraft[]) => {
      for (const candidate of candidates) {
        matched.set(candidate.vaultPath, candidate);
      }
    };

    const direct = draftForPath(normalized, drafts);
    if (direct && direct.format === "scenes") {
      add([direct]);
    } else {
      const sceneMatches = drafts
        .map((draft) => ({ draft, folder: this.sceneFolderFor(draft) }))
        .filter(({ folder }) => isDirectlyInside(folder, normalized));
      if (sceneMatches.length > 0) {
        add(mostSpecific(sceneMatches));
      } else {
        const projectMatches = drafts
          .map((draft) => ({
            draft,
            folder: this.projectFolderFor(draft),
          }))
          .filter(({ folder }) => isInsideProjectFolder(folder, normalized));
        add(mostSpecific(projectMatches));
      }
    }

    for (const draft of drafts) {
      try {
        if (isPlotGridPath(this.app, draft, normalized)) {
          add([draft]);
        }
      } catch {
        // A project note that was just deleted or renamed may not resolve.
      }
    }

    return Array.from(matched.values());
  }

  /** The project note's folder, or the string parent if it is missing. */
  private projectFolderFor(draft: MultipleSceneDraft): string {
    const projectNote = this.app.vault.getAbstractFileByPath(draft.vaultPath);
    if (projectNote?.parent) {
      return normalizePath(projectNote.parent.path);
    }
    const index = draft.vaultPath.lastIndexOf("/");
    return normalizePath(index < 0 ? "" : draft.vaultPath.slice(0, index));
  }

  /** The configured scene folder, in vault-relative form. */
  private sceneFolderFor(draft: MultipleSceneDraft): string {
    const root = this.projectFolderFor(draft);
    return normalizePath(
      root === "" ? draft.sceneFolder : `${root}/${draft.sceneFolder}`
    );
  }

  private scheduleRebuild(draft: MultipleSceneDraft): void {
    if (this.destroyed) {
      return;
    }
    const existing = this.rebuildTimeouts.get(draft.vaultPath);
    if (existing !== undefined) {
      window.clearTimeout(existing);
    }

    const timeout = window.setTimeout(() => {
      this.rebuildTimeouts.delete(draft.vaultPath);

      // A rename or deletion may have happened while the event was debounced.
      const current = this.scenesDrafts().find(
        (candidate) => candidate.vaultPath === draft.vaultPath
      );
      if (!current) {
        return;
      }

      void this.rebuildTimeline(current);
      void this.rebuildKanban(current);
      void this.rebuildPlotGrid(current);
    }, REBUILD_DEBOUNCE_MS);

    this.rebuildTimeouts.set(draft.vaultPath, timeout);
  }

  private async rebuildTimeline(draft: MultipleSceneDraft): Promise<void> {
    if (!draft.timelineEnabled) {
      return;
    }
    await this.rebuild(draft, "timeline", async () => {
      const result = await buildTimeline(this.app, draft);
      await writeTimeline(this.app, draft, result);
    });
  }

  private async rebuildKanban(draft: MultipleSceneDraft): Promise<void> {
    if (!draft.kanbanEnabled) {
      return;
    }
    await this.rebuild(draft, "kanban", async () => {
      // buildKanban reconciles a Bases drag (the helper property) into the
      // scene's real status before the board is rendered.
      const result = await buildKanban(this.app, draft);
      await writeKanbanBase(this.app, draft, result);
      await writeKanbanWordCounts(this.app, draft, result);
    });
  }

  private async syncWordCounts(draft: MultipleSceneDraft): Promise<void> {
    if (!draft.kanbanEnabled || !draft.kanbanSaveWordCounts) {
      return;
    }
    await this.rebuild(draft, "wordcounts", async () => {
      const result = await buildKanban(this.app, draft);
      await writeKanbanWordCounts(this.app, draft, result);
    });
  }

  private async rebuildPlotGrid(draft: MultipleSceneDraft): Promise<void> {
    if (!draft.plotGridEnabled) {
      return;
    }
    await this.rebuild(draft, "plotgrid", async () => {
      const result = await writePlotGrid(this.app, draft);
      if (result.written) {
        this.plotGridSkips.delete(draft.vaultPath);
        return;
      }
      // Remember each skip condition once; otherwise every project change would
      // repeat the same "no notes" message.
      if (this.plotGridSkips.get(draft.vaultPath) !== result.reason) {
        this.plotGridSkips.set(draft.vaultPath, result.reason);
      }
    });
  }

  private async rebuild(
    draft: MultipleSceneDraft,
    kind: string,
    run: () => Promise<void>
  ): Promise<void> {
    const key = `${draft.vaultPath}:${kind}`;
    if (this.rebuilding.has(key)) {
      this.pending.add(key);
      return;
    }
    this.rebuilding.add(key);

    try {
      await run();
    } catch (error) {
      console.error("[Longform Extended] Failed to rebuild notes:", error);
    } finally {
      this.rebuilding.delete(key);
    }

    if (this.pending.delete(key)) {
      this.rerun(draft.vaultPath, kind);
    }
  }

  /** Re-runs a rebuild that arrived while the previous one was in flight. */
  private rerun(vaultPath: string, kind: string): void {
    const draft = get(draftsStore).find(
      (candidate): candidate is MultipleSceneDraft =>
        candidate.format === "scenes" && candidate.vaultPath === vaultPath
    );
    if (!draft) {
      return;
    }
    if (kind === "kanban") {
      void this.rebuildKanban(draft);
    } else if (kind === "wordcounts") {
      void this.syncWordCounts(draft);
    } else if (kind === "timeline") {
      void this.rebuildTimeline(draft);
    } else if (kind === "plotgrid") {
      void this.rebuildPlotGrid(draft);
    }
  }

  /** Debounces word count writes until edits have settled. */
  private scheduleWordCountSync(): void {
    if (this.wordCountSyncTimeout !== null) {
      window.clearTimeout(this.wordCountSyncTimeout);
    }
    this.wordCountSyncTimeout = window.setTimeout(() => {
      this.wordCountSyncTimeout = null;
      for (const draft of get(draftsStore)) {
        if (
          draft.format === "scenes" &&
          draft.kanbanEnabled &&
          draft.kanbanSaveWordCounts
        ) {
          void this.syncWordCounts(draft);
        }
      }
    }, 1000);
  }

  private rebuildAll(): void {
    for (const draft of get(draftsStore)) {
      if (draft.format === "scenes") {
        void this.rebuildTimeline(draft);
        void this.rebuildKanban(draft);
        void this.rebuildPlotGrid(draft);
      }
    }
  }

  /** Records signatures, rebuilding changed or newly discovered projects. */
  private sync(rebuildChanged: boolean): void {
    const drafts = get(draftsStore);
    const draftPaths = new Set<string>();

    for (const draft of drafts) {
      if (draft.format !== "scenes") {
        continue;
      }
      draftPaths.add(draft.vaultPath);

      const signature = [
        draft.title,
        draft.workflow ?? "",
        draft.sceneFolder,
        draft.timeFormat,
        draft.timeframeTagName,
        draft.kanbanColumns,
        draft.kanbanShowUnassigned,
        draft.kanbanSaveWordCounts,
        draft.kanbanEnabled,
        draft.kanbanIncludePlots,
        draft.kanbanOutputPath,
        draft.timelineEnabled,
        draft.timelineOutputPath,
        draft.plotGridEnabled,
        draft.plotGridOutputPath,
        draft.plotGridPlotsDir,
        draft.plotGridCharactersDir,
        draft.scenes
          .map((scene) => `${scene.title}\u0000${scene.indent}`)
          .join("\u0000"),
      ].join("\u0001");
      const previous = this.signatures.get(draft.vaultPath);
      this.signatures.set(draft.vaultPath, signature);

      // `previous === undefined` means this project was discovered after the
      // observer started, so it still needs its outputs generated.
      if (rebuildChanged && previous !== signature) {
        this.scheduleRebuild(draft);
      }
    }

    prune(this.signatures, draftPaths);
    this.pruneRebuildTimeouts(draftPaths);
  }

  private pruneRebuildTimeouts(validPaths: Set<string>): void {
    for (const [path, timeout] of Array.from(
      this.rebuildTimeouts.entries()
    )) {
      if (!validPaths.has(path)) {
        window.clearTimeout(timeout);
        this.rebuildTimeouts.delete(path);
      }
    }
  }
}

/** The parent folder of a vault-relative path ("" for the vault root). */
function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

/** True when the path is exactly the folder or a direct child of it. */
function isDirectlyInside(folder: string, path: string): boolean {
  const normalized = normalizePath(folder);
  return path === normalized || parentPath(path) === normalized;
}

/**
 * True when the path is the project folder or anywhere below it. A project at
 * the vault root (empty folder) is excluded: it has no folder boundary, and
 * matching every vault file would rebuild it for unrelated notes. Its project
 * note and scene folder are still matched exactly.
 */
function isInsideProjectFolder(folder: string, path: string): boolean {
  if (folder === "") {
    return false;
  }
  return path === folder || path.startsWith(`${folder}/`);
}

/** Prefers the deepest matching folder so nested projects do not overlap. */
function mostSpecific(
  matches: { draft: MultipleSceneDraft; folder: string }[]
): MultipleSceneDraft[] {
  if (matches.length <= 1) {
    return matches.map(({ draft }) => draft);
  }
  const deepest = Math.max(...matches.map(({ folder }) => folder.length));
  return matches
    .filter(({ folder }) => folder.length === deepest)
    .map(({ draft }) => draft);
}

/** Generated timeline/kanban outputs, matched case-insensitively. */
function isGeneratedOutput(path: string): boolean {
  const basename = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  return GENERATED_SUFFIXES.some((suffix) => basename.endsWith(suffix));
}

function prune<T>(map: Map<string, T>, keep: Set<string>): void {
  for (const key of Array.from(map.keys())) {
    if (!keep.has(key)) {
      map.delete(key);
    }
  }
}
