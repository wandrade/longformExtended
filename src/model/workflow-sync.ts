import { cloneDeep, isEqual } from "lodash";
import { normalizePath, type App, type TFile } from "obsidian";
import { get } from "svelte/store";
import { deserializeWorkflow } from "src/compile/serialization";
import type { Workflow } from "src/compile";
import { drafts as draftsStore, workflows } from "./stores";
import type { LongformExtendedPluginSettings, SerializedWorkflow, WorkflowSyncMetadata } from "./types";
const POLL_INTERVAL_MS = 5000;
const SHARED_DATA_FILE = "data.json";
const MIRROR_KEY = "longform-extended:workflow-sync";
export type WorkflowMap = Record<string, SerializedWorkflow>;
type MergeResult = { merged: WorkflowMap; writeRemote: boolean; writeLocal: boolean };
type MirrorState = { workflows: WorkflowMap; highest_seen: string | null };
type MirrorRead = { state: MirrorState | null; error: unknown };
type WorkflowMutationFailure =
  | "exists" | "missing" | "same-name" | "no-change" | "read-failed" | "write-failed";
type WorkflowMutationResult = { ok: true } | { ok: false; reason: WorkflowMutationFailure };
type SettingsMutator = (settings: LongformExtendedPluginSettings) => void;
const OK: WorkflowMutationResult = { ok: true };
const failure = (reason: WorkflowMutationFailure): WorkflowMutationResult => ({ ok: false, reason });
const stampOf = (w: SerializedWorkflow): string | null => (typeof w.sync_metadata?.updated_at === "string" ? w.sync_metadata.updated_at : null);
const stampMs = (stamp: string | null | undefined): number =>
  stamp && Number.isFinite(Date.parse(stamp)) ? Date.parse(stamp) : -Infinity;
const laterStamp = (a: string | null, b: string | null): string | null => (stampMs(b) > stampMs(a) ? b : a);
const isDeprecated = (w?: SerializedWorkflow): boolean => !!w?.sync_metadata?.deprecated_at;
const renamedTarget = (w?: SerializedWorkflow): string | null =>
  w?.sync_metadata?.deprecated_at && typeof w.sync_metadata.renamed_to === "string" ? w.sync_metadata.renamed_to : null;
const emptyMap = (): WorkflowMap => Object.create(null) as WorkflowMap;
const emptyMirror = (): MirrorState => ({ workflows: emptyMap(), highest_seen: null });
function normalizeMap(value: unknown): WorkflowMap {
  const map = emptyMap();
  if (!value || typeof value !== "object" || Array.isArray(value)) return map;
  for (const [name, entry] of Object.entries(value as Record<string, unknown>))
    if (entry && typeof entry === "object" && !Array.isArray(entry)) map[name] = entry as SerializedWorkflow;
  return map;
}
/**
 * Per name, the later stamp wins and a tie goes to `remote` (data.json).
 * Contents are deep-compared by the caller, so an identical entry is never
 * rewritten.
 */
export function mergeWorkflowMaps(remote: WorkflowMap, local: WorkflowMap): MergeResult {
  const merged = emptyMap();
  for (const name of new Set([...Object.keys(remote), ...Object.keys(local)])) {
    const r = remote[name], l = local[name], only = r ?? l;
    if (!only) continue;
    if (r && l) merged[name] = cloneDeep(stampMs(stampOf(r)) >= stampMs(stampOf(l)) ? r : l);
    else merged[name] = cloneDeep(only);
  }
  return { merged, writeRemote: !isEqual(merged, remote), writeLocal: !isEqual(merged, local) };
}
export function maxStamp(map: WorkflowMap): string | null {
  let highest: string | null = null;
  for (const w of Object.values(map)) highest = laterStamp(highest, stampOf(w));
  return highest;
}
export function nextStamp(highestSeen: string | null, now: Date | number): string {
  return new Date(Math.max(now instanceof Date ? now.getTime() : now, stampMs(highestSeen) + 1)).toISOString();
}
function metadataFor(w: SerializedWorkflow, updatedAt: string, overrides: Partial<WorkflowSyncMetadata> = {}): WorkflowSyncMetadata {
  return {
    updated_at: updatedAt, deprecated_at: w.sync_metadata?.deprecated_at ?? null,
    renamed_to: w.sync_metadata?.renamed_to ?? null, ...overrides,
  };
}
const serializedForStore = (w: SerializedWorkflow, fallback: string): SerializedWorkflow => ({
  name: typeof w.name === "string" ? w.name : fallback, description: typeof w.description === "string" ? w.description : "",
  steps: Array.isArray(w.steps) ? w.steps : [],
});
type SharedRead =
  | { kind: "ok"; value: Record<string, unknown> }
  | { kind: "missing" } | { kind: "corrupt" } | { kind: "io-error"; error: unknown };
type MutateCallback = (merged: WorkflowMap, takeStamp: () => string) => WorkflowMutationResult;
export class WorkflowSync {
  private readonly app: App; private readonly dataPath: string;
  private queue: Promise<void> = Promise.resolve();
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private lastPollSignature: string | null = null;
  private lastWritten: WorkflowMap | null = null;
  private preservedCorrupt: string | null = null;
  private retryNeeded = false; private repointPending = false;
  private disposed = false;
  constructor(app: App, pluginDir: string) {
    this.app = app;
    this.dataPath = normalizePath(`${pluginDir}/${SHARED_DATA_FILE}`);
  }
  hasWorkflow(name: string): boolean { return !!this.lastWritten && Object.prototype.hasOwnProperty.call(this.lastWritten, name); }
  isEmpty(): boolean { return !!this.lastWritten && Object.keys(this.lastWritten).length === 0; }
  /** True once a run has read the workflow map successfully. */
  hasLoaded(): boolean { return this.lastWritten !== null; }
  start(): void {
    this.disposed = false; if (this.pollHandle !== null) return;
    void this.sync();
    this.pollHandle = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
  }
  stop(): void {
    this.disposed = true;
    if (this.pollHandle !== null) { clearInterval(this.pollHandle); this.pollHandle = null; }
  }
  async sync(): Promise<void> {
    await this.enqueue(() => this.run());
  }
  createWorkflow(name: string, seed?: Pick<SerializedWorkflow, "description" | "steps">): Promise<WorkflowMutationResult> {
    return this.mutate((merged, takeStamp) => {
      if (merged[name] && !isDeprecated(merged[name])) return failure("exists");
      merged[name] = {
        name, description: seed?.description ?? "", steps: cloneDeep(seed?.steps ?? []),
        sync_metadata: { updated_at: takeStamp(), deprecated_at: null, renamed_to: null },
      };
      return OK;
    });
  }
  renameWorkflow(from: string, to: string): Promise<WorkflowMutationResult> {
    return this.mutate((merged, takeStamp) => {
      if (from === to) return failure("same-name");
      const source = merged[from];
      if (!source || isDeprecated(source)) return failure("missing");
      if (merged[to]) return failure("exists");
      const stamp = takeStamp(), contentStamp = stampOf(source) ?? stamp;
      merged[from] = { ...source, sync_metadata: { updated_at: stamp, deprecated_at: stamp, renamed_to: to } };
      merged[to] = { ...cloneDeep(source), name: to, sync_metadata: { updated_at: contentStamp, deprecated_at: null, renamed_to: null } };
      return OK;
    });
  }
  deleteWorkflow(name: string): Promise<WorkflowMutationResult> {
    return this.mutate((merged, takeStamp) => {
      const source = merged[name];
      if (!source || isDeprecated(source)) return failure("missing");
      const stamp = takeStamp();
      merged[name] = { ...source, sync_metadata: metadataFor(source, stamp, { deprecated_at: stamp, renamed_to: null }) };
      return OK;
    });
  }
  updateWorkflow(name: string, mutate: (workflow: SerializedWorkflow) => void): Promise<WorkflowMutationResult> {
    return this.mutate((merged, takeStamp) => {
      const workflow = merged[name];
      if (!workflow || isDeprecated(workflow)) return failure("missing");
      const before = cloneDeep(workflow);
      mutate(workflow);
      if (isEqual(before, workflow)) return failure("no-change");
      workflow.sync_metadata = metadataFor(workflow, takeStamp());
      return OK;
    });
  }
  saveSettings(apply: SettingsMutator): Promise<void> {
    return this.enqueue(async () => {
      if (this.disposed) return;
      const signature = await this.fileSignature(), shared = await this.readShared();
      if (shared.kind === "io-error") return this.logFailure(shared.error);
      const raw = shared.kind === "ok" ? shared.value : {};
      const before = shared.kind === "ok" ? JSON.stringify(shared.value) : null;
      try {
        apply(raw as unknown as LongformExtendedPluginSettings);
        if (before !== null && JSON.stringify(raw) === before) return;
        if ((await this.fileSignature()) !== signature) {
          console.warn("[Longform Extended] data.json changed during settings save; deferring the write.");
          return;
        }
        await this.writeAtomic(this.dataPath, raw);
      } catch (error) { this.logFailure(error); }
    });
  }
  private async mutate(fn: MutateCallback): Promise<WorkflowMutationResult> {
    return this.enqueue(() => this.run(fn));
  }
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }
  private async run(mutate?: MutateCallback): Promise<WorkflowMutationResult> {
    if (this.disposed) return failure("read-failed");
    const signature = await this.fileSignature(), shared = await this.readShared();
    if (shared.kind !== "ok") {
      if (shared.kind === "io-error") this.logFailure(shared.error);
      else console.warn(`[Longform Extended] data.json is ${shared.kind}; workflow sync will retry.`);
      return failure("read-failed");
    }
    const mirrorRead = this.readMirror();
    if (mirrorRead.error) { this.logFailure(mirrorRead.error); return failure("read-failed"); }
    const local = mirrorRead.state ?? emptyMirror(), remote = normalizeMap(shared.value["workflows"]);
    const { merged, writeRemote, writeLocal } = mergeWorkflowMaps(remote, local.workflows);
    let highest = laterStamp(local.highest_seen, laterStamp(maxStamp(remote), maxStamp(local.workflows))), dirty = false;
    if (mutate) {
      let generated: string | null = null;
      const takeStamp = (): string => {
        if (generated === null) { generated = nextStamp(highest, Date.now()); highest = generated; }
        return generated;
      };
      let result: WorkflowMutationResult;
      try { result = mutate(merged, takeStamp); }
      catch (error) { this.logFailure(error); return failure("write-failed"); }
      // A refused create or rename writes nothing, merge results included.
      if (!result.ok) return result;
      dirty = true;
    }
    let mirrorFailed = false;
    if (!mirrorRead.state || writeLocal || dirty || highest !== local.highest_seen) {
      try {
        this.app.saveLocalStorage(MIRROR_KEY, { workflows: merged, highest_seen: highest });
      } catch (error) { mirrorFailed = true; this.logFailure(error); }
    }
    const writeShared = writeRemote || dirty;
    let sharedFailed = false, sharedDeferred = false;
    if (writeShared) {
      try {
        // Matching the pre-read stat proves we still own the file we merged against.
        if ((await this.fileSignature()) !== signature) {
          sharedDeferred = true;
          console.warn("[Longform Extended] data.json changed during sync; deferring the shared write.");
        } else {
          await this.writeAtomic(this.dataPath, { ...shared.value, workflows: merged });
        }
      } catch (error) { sharedFailed = true; this.logFailure(error); }
    }
    this.refreshStore(merged);
    this.lastWritten = cloneDeep(merged) as WorkflowMap;
    this.repointPending = !(await this.repointAll(this.lastWritten));
    const sharedPersisted = !writeShared || (!sharedFailed && !sharedDeferred);
    return sharedFailed || (mirrorFailed && !sharedPersisted) ? failure("write-failed") : OK;
  }
  /**
   * Projects the merged map into the store, keeping the existing object for any
   * workflow whose content did not change so Svelte does not re-render it.
   */
  private refreshStore(merged: WorkflowMap): void {
    if (this.lastWritten && isEqual(merged, this.lastWritten)) return;
    const current = (get(workflows) ?? {}) as Record<string, Workflow>;
    const live = Object.create(null) as Record<string, Workflow>;
    for (const [name, workflow] of Object.entries(merged)) {
      if (isDeprecated(workflow)) continue;
      let next: Workflow;
      try { next = deserializeWorkflow(serializedForStore(workflow, name)); }
      catch (error) {
        // A malformed entry must not take the plugin's startup down with it.
        console.warn(`[Longform Extended] Skipping unreadable workflow "${name}":`, error);
        continue;
      }
      const existing = current[name];
      live[name] = existing && isEqual(existing, next) ? existing : next;
    }
    if (!isEqual(Object.keys(live).sort(), Object.keys(current).sort())) {
      workflows.set(live);
      return;
    }
    for (const name of Object.keys(live)) if (live[name] !== current[name]) { workflows.set(live); return; }
  }
  /** Syncs when data.json changes on disk. A no-op merge writes nothing. */
  private async poll(): Promise<void> {
    if (this.disposed) return;
    const signature = await this.fileSignature();
    // A failed run or an unfinished repoint is retried on the next tick even
    // when data.json itself did not move.
    if (signature === this.lastPollSignature && !this.retryNeeded) return;
    const result = await this.enqueue(() => this.run());
    this.retryNeeded = !result.ok || this.repointPending;
    // Only remember a stat this device has actually handled; otherwise a failed
    // write would never be retried until some unrelated change moved the file.
    this.lastPollSignature = result.ok ? signature : null;
  }
  /** Rewrites `from` to `to` in every project note that still names `from`. */
  private async repointProjects(from: string, to: string): Promise<"changed" | "unchanged" | "failed"> {
    let changed = false, failed = false;
    for (const draft of get(draftsStore) ?? []) {
      const file = this.app.vault.getAbstractFileByPath(draft.vaultPath) as TFile | null;
      const fm = file ? (this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined) : undefined;
      if (!file || !fm) continue;
      const longform = fm["longform"], isObject = !!longform && typeof longform === "object";
      const isIndexLike = isObject || Array.isArray(fm["drafts"]);
      const nested = isObject && (longform as Record<string, unknown>)["workflow"] === from;
      if (!nested && !(isIndexLike && fm["workflow"] === from)) continue;
      try {
        await this.app.fileManager.processFrontMatter(file, (data) => {
          const current = data["longform"] as Record<string, unknown> | undefined;
          if (current?.["workflow"] === from) current["workflow"] = to;
          if (isIndexLike && data["workflow"] === from) data["workflow"] = to;
        });
        changed = true;
      } catch (error) {
        failed = true;
        console.warn(`[Longform Extended] Could not repoint ${draft.vaultPath} to workflow "${to}".`, error);
      }
    }
    return failed ? "failed" : changed ? "changed" : "unchanged";
  }
  /**
   * Repoints projects for every rename tombstone in the map. The pass is
   * idempotent, so it needs no bookkeeping: a file that already names the new
   * workflow is not touched, and a chain settles because each hop runs again.
   */
  private async repointAll(merged: WorkflowMap): Promise<boolean> {
    const pairs: [string, string][] = [];
    for (const [from, w] of Object.entries(merged)) {
      const to = renamedTarget(w), target = to ? merged[to] : undefined;
      // A target that was deleted outright would leave the project pointing at
      // a workflow that no longer exists. A target that was itself renamed is
      // followed on the next pass.
      const dead = !!target && isDeprecated(target) && !renamedTarget(target);
      if (to && to !== from && !dead) pairs.push([from, to]);
    }
    for (let pass = 0; pass < pairs.length; pass++) {
      let changed = false, failed = false;
      for (const [from, to] of pairs) {
        const outcome = await this.repointProjects(from, to);
        if (outcome === "failed") failed = true;
        if (outcome === "changed") changed = true;
      }
      if (failed) return false;
      if (!changed) return true;
    }
    return true;
  }
  private readMirror(): MirrorRead {
    let stored: unknown;
    try { stored = this.app.loadLocalStorage(MIRROR_KEY); } catch (error) { return { state: null, error }; }
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return { state: null, error: null };
    const record = stored as Record<string, unknown>;
    return {
      state: {
        workflows: normalizeMap(record["workflows"]),
        highest_seen: typeof record["highest_seen"] === "string" ? record["highest_seen"] : null,
      },
      error: null,
    };
  }
  private async readShared(): Promise<SharedRead> {
    let text: string;
    try {
      if (!(await this.app.vault.adapter.exists(this.dataPath))) return { kind: "missing" };
      text = await this.app.vault.adapter.read(this.dataPath);
    } catch (error) { return { kind: "io-error", error }; }
    let value: unknown;
    try { value = JSON.parse(text); } catch { value = undefined; }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      if (this.preservedCorrupt !== text) {
        this.preservedCorrupt = text;
        try { await this.app.vault.adapter.write(`${this.dataPath}.recovered-${Date.now()}`, text); }
        catch (error) { console.warn("[Longform Extended] Could not preserve the corrupt data.json:", error); }
      }
      return { kind: "corrupt" };
    }
    this.preservedCorrupt = null;
    return { kind: "ok", value: value as Record<string, unknown> };
  }
  private async fileSignature(): Promise<string | null> {
    try {
      const stat = await this.app.vault.adapter.stat(this.dataPath);
      return stat ? `${stat.mtime}:${stat.size}` : null;
    } catch { return null; }
  }
  private async writeAtomic(path: string, value: unknown): Promise<void> {
    const temp = `${path}.tmp`;
    try {
      await this.app.vault.adapter.write(temp, JSON.stringify(value, null, 2));
      await this.app.vault.adapter.rename(temp, path);
    } catch (error) {
      try { await this.app.vault.adapter.remove(temp); } catch { /* next write overwrites */ }
      throw error;
    }
  }
  private logFailure(error: unknown): void { console.warn("[Longform Extended] Workflow sync skipped this run:", error); }
}
