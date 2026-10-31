import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { get } from "svelte/store";
import { rename as renameFile, type MemoryFile } from "../mocks/obsidian";
import {
  WorkflowSync, maxStamp, mergeWorkflowMaps, nextStamp,
  type WorkflowMap,
} from "../../src/model/workflow-sync";
import { drafts, workflows } from "../../src/model/stores";
import { deserializeWorkflow } from "../../src/compile/serialization";
import type { SerializedWorkflow, WorkflowSyncMetadata } from "../../src/model/types";
const PLUGIN_DIR = ".obsidian/plugins/longform-extended";
const DATA_PATH = `${PLUGIN_DIR}/data.json`;
const NOW = new Date("2026-10-29T21:04:10.123Z");
const NOW_ISO = NOW.toISOString();
const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (offsetMs: number): string => new Date(NOW.getTime() + offsetMs).toISOString();
function workflow(
  name: string, updatedAt: string | null,
  options: { description?: string; steps?: SerializedWorkflow["steps"]; metadata?: Partial<WorkflowSyncMetadata> } = {}
): SerializedWorkflow {
  const base = { name, description: options.description ?? `${name} description`, steps: options.steps ?? [] };
  return updatedAt === null ? base : {
    ...base, sync_metadata: { updated_at: updatedAt, deprecated_at: null, renamed_to: null, ...(options.metadata ?? {}) },
  };
}
const mirrorFor = (map: WorkflowMap, highest: string | null = null) => ({
  workflows: map, highest_seen: highest,
});
type WorldInit = { data?: Record<string, unknown>; corrupt?: string; mirror?: unknown };
type MemoryWorld = ReturnType<typeof createWorld>;
function createWorld(initial: WorldInit = {}) {
  const files = new Map<string, MemoryFile>();
  const writes: string[] = [], renames: [string, string][] = [], order: string[] = [], mirrorWrites: unknown[] = [];
  let clock = 1000, loadError = false, mirrorError = false, mirror: any = initial.mirror ?? null;
  const writeRaw = (path: string, value: unknown) => files.set(path, { content: JSON.stringify(value), mtime: clock++ });
  if (initial.corrupt !== undefined) files.set(DATA_PATH, { content: initial.corrupt, mtime: clock++ });
  else if (initial.data) writeRaw(DATA_PATH, initial.data);
  const adapter = {
    exists: vi.fn(async (path: string) => files.has(path)),
    read: vi.fn(async (path: string): Promise<string> => {
      const file = files.get(path); if (!file) throw new Error(`No such file: ${path}`); return file.content;
    }),
    write: vi.fn(async (path: string, data: string): Promise<void> => {
      writes.push(path); if (path.endsWith(".tmp")) order.push("data");
      files.set(path, { content: data, mtime: clock++ });
    }),
    stat: vi.fn(async (path: string) => {
      const file = files.get(path);
      return file ? { mtime: file.mtime, ctime: file.mtime, size: file.content.length, type: "file" } : null;
    }),
    rename: vi.fn(async (from: string, to: string): Promise<void> => { renames.push([from, to]); renameFile(files, from, to); }),
    remove: vi.fn(async (path: string): Promise<void> => { files.delete(path); }),
  };
  const projectFiles: { path: string }[] = [];
  const frontmatter = new Map<string, Record<string, unknown>>();
  const processFrontMatter = vi.fn(async (file: { path: string }, mutate: (fm: Record<string, unknown>) => void) => {
    const fm = frontmatter.get(file.path) ?? {}; mutate(fm); frontmatter.set(file.path, fm);
  });
  const app = {
    vault: { adapter, getAbstractFileByPath: (path: string) => projectFiles.find((f) => f.path === path) ?? null },
    metadataCache: { getFileCache: (file: { path: string }) => { const fm = frontmatter.get(file.path); return fm ? { frontmatter: fm } : null; } },
    fileManager: { processFrontMatter },
    loadLocalStorage: vi.fn(() => {
      if (loadError) throw new Error("local storage unavailable");
      return mirror === null ? null : JSON.parse(JSON.stringify(mirror));
    }),
    saveLocalStorage: vi.fn((_key: string, value: unknown) => {
      if (mirrorError) throw new Error("local storage write failed");
      order.push("mirror"); mirrorWrites.push(JSON.parse(JSON.stringify(value))); mirror = JSON.parse(JSON.stringify(value));
    }),
  } as unknown as App;
  return {
    app, adapter, files, writes, renames, order, processFrontMatter, frontmatter, mirrorWrites,
    read: (path: string): any => { const file = files.get(path); return file ? JSON.parse(file.content) : null; },
    readText: (path: string): string | null => files.get(path)?.content ?? null,
    setRaw(path: string, content: string) { files.set(path, { content, mtime: clock++ }); },
    touch(path: string, value: unknown) { writeRaw(path, value); },
    addProject(path: string, fm: Record<string, unknown>) { projectFiles.push({ path }); frontmatter.set(path, fm); },
    readMirror: (): any => mirror, setMirror(value: unknown) { mirror = JSON.parse(JSON.stringify(value)); },
    setLoadError(value: boolean) { loadError = value; }, setMirrorError(value: boolean) { mirrorError = value; },
    recovered: (): string[] => [...files.keys()].filter((key) => key.startsWith(`${DATA_PATH}.recovered-`)),
  };
}
const makeSync = (world: MemoryWorld): WorkflowSync => new WorkflowSync(world.app, PLUGIN_DIR);
function shiftStat(world: MemoryWorld): void {
  const original = world.adapter.stat.getMockImplementation()!;
  let calls = 0;
  world.adapter.stat.mockImplementation(async (path: string) => {
    const stat = await original(path); calls += 1;
    return calls === 2 && stat ? { ...stat, size: stat.size + 1 } : stat;
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(console, "warn").mockImplementation((): void => undefined);
  workflows.set({});
  drafts.set([]);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe("merge rules", () => {
  it("covers remote-only, local-only, newer, tie, and identical", () => {
    const older = workflow("Book", iso(-2 * DAY_MS), { description: "old" });
    const newer = workflow("Book", iso(-DAY_MS), { description: "new" });
    const tie = workflow("Book", iso(-DAY_MS), { description: "tie" });
    const remoteOnly = mergeWorkflowMaps({ Solo: older }, {});
    expect(remoteOnly.merged.Solo).toEqual(older);
    expect([remoteOnly.writeRemote, remoteOnly.writeLocal]).toEqual([false, true]);
    const localOnly = mergeWorkflowMaps({}, { Solo: older });
    expect([localOnly.writeRemote, localOnly.writeLocal]).toEqual([true, false]);
    const localNewer = mergeWorkflowMaps({ Book: older }, { Book: newer });
    expect(localNewer.merged.Book.description).toBe("new");
    expect([localNewer.writeRemote, localNewer.writeLocal]).toEqual([true, false]);
    const remoteNewer = mergeWorkflowMaps({ Book: newer }, { Book: older });
    expect([remoteNewer.writeRemote, remoteNewer.writeLocal]).toEqual([false, true]);
    const tied = mergeWorkflowMaps({ Book: tie }, { Book: newer });
    expect(tied.merged.Book.description).toBe("tie");
    expect([tied.writeRemote, tied.writeLocal]).toEqual([false, true]);
    expect(mergeWorkflowMaps({ Book: newer }, { Book: newer })).toMatchObject({ writeRemote: false, writeLocal: false });
  });
});
describe("sync paths", () => {
  it("copies a remote-only workflow into the device mirror", async () => {
    const entry = workflow("Solo", iso(-DAY_MS));
    const world = createWorld({ data: { workflows: { Solo: entry } } });
    await makeSync(world).sync();
    expect(world.readMirror().workflows.Solo).toEqual(entry);
    expect(get(workflows)).toHaveProperty("Solo");
    expect(world.writes).toEqual([]);
  });
  it("pushes a local-only workflow and preserves unrelated keys", async () => {
    const entry = workflow("Solo", iso(-DAY_MS));
    const sessions = [{ start: iso(-DAY_MS), total: 5 }];
    const world = createWorld({ data: { version: 3, sessions, sceneTemplate: "Templates/Scene" }, mirror: mirrorFor({ Solo: entry }, iso(-DAY_MS)) });
    await makeSync(world).sync();
    const data = world.read(DATA_PATH);
    expect(data.workflows.Solo).toEqual(entry);
    expect(data.version).toBe(3);
    expect(data.sessions).toEqual(sessions);
    expect(data.sceneTemplate).toBe("Templates/Scene");
  });
  it("writes nothing when both sides are identical", async () => {
    const entry = workflow("Book", iso(-DAY_MS));
    const world = createWorld({ data: { workflows: { Book: entry } }, mirror: mirrorFor({ Book: entry }, iso(-DAY_MS)) });
    await makeSync(world).sync();
    expect(world.writes).toEqual([]);
    expect(world.mirrorWrites).toEqual([]);
  });
  it("writes the mirror before the shared file", async () => {
    const world = createWorld({ data: { version: 3 } });
    await makeSync(world).createWorkflow("New");
    expect(world.order).toEqual(["mirror", "data"]);
  });
  it("serializes overlapping mutations through one queue", async () => {
    const world = createWorld({ data: { version: 3 } });
    const sync = makeSync(world);
    await Promise.all([
      sync.createWorkflow("A"),
      sync.updateWorkflow("A", (stored) => { stored.description = "later"; }),
    ]);
    const stored = world.read(DATA_PATH).workflows.A;
    expect(stored.description).toBe("later");
    expect(stored.sync_metadata.updated_at).toBe(iso(1));
  });
});
describe("tombstones", () => {
  it("propagates and keeps a delete tombstone permanently", async () => {
    const deletedAt = iso(-DAY_MS);
    const tombstone = workflow("Book", deletedAt, { metadata: { deprecated_at: deletedAt } });
    const world = createWorld({ data: { workflows: { Book: workflow("Book", iso(-2 * DAY_MS)) } }, mirror: mirrorFor({ Book: tombstone }, deletedAt) });
    await makeSync(world).sync();
    expect(world.read(DATA_PATH).workflows.Book).toEqual(tombstone);
    expect(get(workflows)).not.toHaveProperty("Book");
    await makeSync(world).sync();
    expect(world.read(DATA_PATH).workflows.Book).toEqual(tombstone);
  });
  it("lets an older or unstamped live entry lose to a tombstone", async () => {
    const deadAt = iso(-DAY_MS);
    const tombstone = workflow("Book", deadAt, { metadata: { deprecated_at: deadAt } });
    const world = createWorld({ data: { workflows: { Book: tombstone } }, mirror: mirrorFor({ Book: { name: "Book", description: "old", steps: [] } }, deadAt) });
    await makeSync(world).sync();
    expect(world.readMirror().workflows.Book).toEqual(tombstone);
  });
  it("lets a strictly newer live entry cancel a deletion", async () => {
    const deadAt = iso(-10 * DAY_MS);
    const world = createWorld({ data: { workflows: { Book: workflow("Book", deadAt, { metadata: { deprecated_at: deadAt } }) } }, mirror: mirrorFor({ Book: workflow("Book", iso(0), { description: "reborn" }) }, iso(0)) });
    await makeSync(world).sync();
    expect(world.read(DATA_PATH).workflows.Book.description).toBe("reborn");
    expect(world.read(DATA_PATH).workflows.Book.sync_metadata.deprecated_at).toBeNull();
  });
  it("clears a tombstone only through an explicit create", async () => {
    const oldStamp = iso(-10 * DAY_MS);
    const world = createWorld({ data: { version: 3 }, mirror: mirrorFor({ Book: workflow("Book", oldStamp, { metadata: { deprecated_at: oldStamp, renamed_to: "Other" } }) }, oldStamp) });
    await makeSync(world).createWorkflow("Book");
    expect(world.read(DATA_PATH).workflows.Book.sync_metadata).toEqual({ updated_at: NOW_ISO, deprecated_at: null, renamed_to: null });
  });
  it("treats a tombstone as a known name and leaves an empty map detectable", async () => {
    const deadAt = iso(-DAY_MS);
    const world = createWorld({ data: { workflows: { Book: workflow("Book", deadAt, { metadata: { deprecated_at: deadAt } }) } } });
    const sync = makeSync(world);
    // Nothing has been read yet, so "empty" must not answer either way.
    expect(sync.hasLoaded()).toBe(false);
    expect(sync.isEmpty()).toBe(false);
    await sync.sync();
    expect(sync.hasLoaded()).toBe(true);
    // The tombstone is still a known name, so this setup must not be reseeded.
    expect(sync.isEmpty()).toBe(false);
    expect(sync.hasWorkflow("Book")).toBe(true);
    expect(sync.hasWorkflow("Fresh")).toBe(false);
  });
  it("does not stamp an unstamped workflow during a merge", async () => {
    const legacy = workflow("Legacy", null);
    const world = createWorld({ data: { version: 3, workflows: { Legacy: legacy } } });
    await makeSync(world).sync();
    expect(world.readMirror().workflows.Legacy).toEqual(legacy);
  });
});
describe("renames", () => {
  it("tombstones the old name, creates the new one, and repoints projects", async () => {
    const stamp = iso(-10 * DAY_MS);
    const world = createWorld({ data: { version: 3, workflows: { Old: workflow("Old", stamp, { description: "kept" }) } } });
    drafts.set([{ vaultPath: "Books/Book.md" }, { vaultPath: "Books/Legacy.md" }] as any);
    world.addProject("Books/Book.md", { longform: { format: "scenes", workflow: "Old" } });
    world.addProject("Books/Legacy.md", { workflow: "Old", drafts: [] });
    await makeSync(world).renameWorkflow("Old", "New");
    const data = world.read(DATA_PATH);
    expect(data.workflows.Old.sync_metadata).toEqual({ updated_at: NOW_ISO, deprecated_at: NOW_ISO, renamed_to: "New" });
    expect(data.workflows.New.description).toBe("kept");
    expect(world.frontmatter.get("Books/Book.md")).toEqual({ longform: { format: "scenes", workflow: "New" } });
    expect(world.frontmatter.get("Books/Legacy.md")).toEqual({ workflow: "New", drafts: [] });
  });
  it("keeps the target when the old name and its tombstone tie", async () => {
    const tomb = iso(-10 * DAY_MS), target = iso(-12 * DAY_MS);
    const world = createWorld({
      data: { workflows: {
        Old: workflow("Old", tomb, { metadata: { deprecated_at: tomb, renamed_to: "New" } }),
        New: workflow("New", target, { description: "target" }),
      } },
      mirror: mirrorFor({ Old: workflow("Old", target, { description: "equal" }) }, target),
    });
    await makeSync(world).sync();
    expect(world.read(DATA_PATH).workflows.New.description).toBe("target");
  });
  it("stamps the tombstone with the rename and the new name with the content stamp", async () => {
    const content = iso(-11 * DAY_MS);
    const world = createWorld({ data: { workflows: { Old: workflow("Old", content, { description: "renamed" }) } } });
    await makeSync(world).renameWorkflow("Old", "New");
    const renamed = world.read(DATA_PATH);
    expect(renamed.workflows.Old.sync_metadata).toEqual({ updated_at: NOW_ISO, deprecated_at: NOW_ISO, renamed_to: "New" });
    expect(renamed.workflows.New.sync_metadata.updated_at).toBe(content);
    expect(get(workflows)).not.toHaveProperty("Old");
  });
  it("keeps an explicit create newer than a stale rename tombstone", async () => {
    const tomb = iso(-10 * DAY_MS);
    const world = createWorld({
      data: { workflows: {
        Old: workflow("Old", tomb, { metadata: { deprecated_at: tomb, renamed_to: "New" } }),
        New: workflow("New", tomb, { description: "target" }),
      } },
      mirror: mirrorFor({ Old: workflow("Old", iso(0), { description: "recreated" }) }, iso(0)),
    });
    await makeSync(world).sync();
    const data = world.read(DATA_PATH);
    expect(data.workflows.Old.description).toBe("recreated");
    expect(data.workflows.Old.sync_metadata.deprecated_at).toBeNull();
    expect(data.workflows.New.description).toBe("target");
  });
  it("applies a chain one hop at a time when repointing projects", async () => {
    const t1 = iso(-10 * DAY_MS), t2 = iso(-5 * DAY_MS);
    const world = createWorld({
      data: { workflows: {
        A: workflow("A", t1, { metadata: { deprecated_at: t1, renamed_to: "B" } }),
        B: workflow("B", t2, { metadata: { deprecated_at: t2, renamed_to: "C" } }),
        C: workflow("C", t2, { description: "latest" }),
      } },
    });
    drafts.set([{ vaultPath: "Books/Book.md" }] as any);
    world.addProject("Books/Book.md", { longform: { format: "scenes", workflow: "A" } });
    await makeSync(world).sync();
    expect(world.frontmatter.get("Books/Book.md")).toEqual({ longform: { format: "scenes", workflow: "C" } });
  });
  it("stamps a rename of an unstamped legacy workflow", async () => {
    const world = createWorld({ data: { workflows: { Old: workflow("Old", null) } } });
    const result = await makeSync(world).renameWorkflow("Old", "New");
    expect(result).toEqual({ ok: true });
    expect(world.read(DATA_PATH).workflows.New.sync_metadata.updated_at).toBe(NOW_ISO);
  });
  it("does not repoint onto a target that was itself deleted", async () => {
    const t1 = iso(-10 * DAY_MS), t2 = iso(-5 * DAY_MS);
    const world = createWorld({
      data: { workflows: {
        A: workflow("A", t1, { metadata: { deprecated_at: t1, renamed_to: "B" } }),
        B: workflow("B", t2, { metadata: { deprecated_at: t2, renamed_to: null } }),
      } },
    });
    drafts.set([{ vaultPath: "Books/Book.md" }] as any);
    world.addProject("Books/Book.md", { longform: { format: "scenes", workflow: "A" } });
    await makeSync(world).sync();
    expect(world.frontmatter.get("Books/Book.md")).toEqual({ longform: { format: "scenes", workflow: "A" } });
  });
  it("refuses to create over a live name or rename onto any existing name", async () => {
    const live = workflow("Book", iso(-DAY_MS));
    const deadAt = iso(-DAY_MS);
    const dead = workflow("Dead", deadAt, { metadata: { deprecated_at: deadAt } });
    const world = createWorld({
      data: { version: 3, workflows: { Book: live, Old: live, Dead: dead } },
      mirror: mirrorFor({ Book: live, Old: live, Dead: dead }, iso(-DAY_MS)),
    });
    const sync = makeSync(world);
    expect(await sync.createWorkflow("Book")).toEqual({ ok: false, reason: "exists" });
    expect(await sync.renameWorkflow("Old", "Book")).toEqual({ ok: false, reason: "exists" });
    expect(await sync.renameWorkflow("Old", "Dead")).toEqual({ ok: false, reason: "exists" });
    expect(world.writes).toEqual([]);
    expect(world.mirrorWrites).toEqual([]);
  });
  it("retries an incomplete repoint on the next sync", async () => {
    const world = createWorld({ data: { workflows: { Old: workflow("Old", iso(-DAY_MS)) } } });
    drafts.set([{ vaultPath: "Books/Book.md" }] as any);
    world.addProject("Books/Book.md", { longform: { format: "scenes", workflow: "Old" } });
    world.processFrontMatter.mockRejectedValueOnce(new Error("locked"));
    const sync = makeSync(world);
    await sync.renameWorkflow("Old", "New");
    expect(world.frontmatter.get("Books/Book.md")).toEqual({ longform: { format: "scenes", workflow: "Old" } });
    await sync.sync();
    expect(world.frontmatter.get("Books/Book.md")).toEqual({ longform: { format: "scenes", workflow: "New" } });
  });
  it("does not record a repoint before drafts are discovered", async () => {
    const world = createWorld({ data: { workflows: { Old: workflow("Old", iso(-DAY_MS)) } } });
    const sync = makeSync(world);
    await sync.renameWorkflow("Old", "New");
    drafts.set([{ vaultPath: "Books/Book.md" }] as any);
    world.addProject("Books/Book.md", { longform: { format: "scenes", workflow: "Old" } });
    await sync.sync();
    expect(world.frontmatter.get("Books/Book.md")).toEqual({ longform: { format: "scenes", workflow: "New" } });
  });
});
describe("recovery and durability", () => {
  it("rebuilds a missing mirror from data.json", async () => {
    const older = workflow("Aaaa", iso(-2 * DAY_MS));
    const newer = workflow("Bbbb", iso(-DAY_MS));
    const world = createWorld({ data: { version: 3, workflows: { Aaaa: older, Bbbb: newer } } });
    await makeSync(world).sync();
    expect(world.readMirror()).toEqual(mirrorFor({ Aaaa: older, Bbbb: newer }, iso(-DAY_MS)));
    expect(world.writes).toEqual([]);
  });
  it("copies a corrupt data.json aside and lets settings recreate it", async () => {
    const kept = workflow("Keep", iso(-DAY_MS));
    const world = createWorld({ corrupt: "{ this is not json", mirror: mirrorFor({ Keep: kept }, iso(-DAY_MS)) });
    const sync = makeSync(world);
    await sync.sync();
    expect(world.readText(DATA_PATH)).toBe("{ this is not json");
    expect(world.recovered()).toHaveLength(1);
    await sync.saveSettings((settings) => { settings.version = 3; });
    expect(world.read(DATA_PATH)).toEqual({ version: 3 });
    await sync.sync();
    expect(world.read(DATA_PATH).workflows.Keep).toEqual(kept);
  });
  it("never creates a missing data.json from the workflow path", async () => {
    const world = createWorld({ mirror: mirrorFor({ Keep: workflow("Keep", iso(-DAY_MS)) }, iso(-DAY_MS)) });
    const sync = makeSync(world);
    await sync.sync();
    expect(await sync.createWorkflow("New")).toEqual({ ok: false, reason: "read-failed" });
    expect(world.readText(DATA_PATH)).toBeNull();
    expect(world.writes).toEqual([]);
  });
  it("aborts instead of rebuilding when local storage throws", async () => {
    const disk = workflow("Disk", iso(-DAY_MS));
    const mine = workflow("Mine", iso(-DAY_MS));
    const world = createWorld({ data: { workflows: { Disk: disk } }, mirror: mirrorFor({ Mine: mine }, iso(-DAY_MS)) });
    world.setLoadError(true);
    const sync = makeSync(world);
    await sync.sync();
    expect(world.writes).toEqual([]);
    expect(world.mirrorWrites).toEqual([]);
    expect(world.read(DATA_PATH).workflows.Mine).toBeUndefined();
    world.setLoadError(false);
    await sync.sync();
    expect(world.read(DATA_PATH).workflows.Mine).toEqual(mine);
  });
  it("writes data.json through a same-folder temp then renames", async () => {
    const world = createWorld({ data: { version: 3 } });
    await makeSync(world).createWorkflow("New");
    expect(world.writes).toEqual([`${DATA_PATH}.tmp`]);
    expect(world.renames).toEqual([[`${DATA_PATH}.tmp`, DATA_PATH]]);
  });
  it("skips an unchanged settings write, including Date values", async () => {
    const world = createWorld({ data: { version: 3, sessions: [{ start: NOW_ISO, total: 1 }] } });
    const sync = makeSync(world);
    await sync.saveSettings((settings) => {
      settings.sessions = [{ start: new Date(NOW), total: 1 } as any];
    });
    expect(world.writes).toEqual([]);
    await sync.saveSettings((settings) => { settings.sceneTemplate = "Templates/Scene"; });
    expect(world.writes).toEqual([`${DATA_PATH}.tmp`]);
    await sync.saveSettings((settings) => { settings.sceneTemplate = "Templates/Scene"; });
    expect(world.writes).toEqual([`${DATA_PATH}.tmp`]);
  });
  it("defers a settings write when data.json changed after it was read", async () => {
    const world = createWorld({ data: { version: 3 } });
    shiftStat(world);
    await makeSync(world).saveSettings((settings) => { settings.sceneTemplate = "New"; });
    expect(world.writes).toEqual([]);
    expect(world.read(DATA_PATH).sceneTemplate).toBeUndefined();
  });
  it("defers the shared write when data.json changed after it was read", async () => {
    const remote = workflow("Book", iso(-2 * DAY_MS), { description: "remote" });
    const local = workflow("Book", iso(-DAY_MS), { description: "local" });
    const world = createWorld({ data: { version: 3, workflows: { Book: remote } }, mirror: mirrorFor({ Book: local }, iso(-DAY_MS)) });
    shiftStat(world);
    const sync = makeSync(world);
    await sync.sync();
    expect(world.writes).toEqual([]);
    expect(world.read(DATA_PATH).workflows.Book.description).toBe("remote");
    await sync.sync();
    expect(world.read(DATA_PATH).workflows.Book.description).toBe("local");
  });
  it("returns write-failed when the mirror fails and the shared write is deferred", async () => {
    const world = createWorld({ data: { version: 3 } });
    world.setMirrorError(true);
    shiftStat(world);
    expect(await makeSync(world).createWorkflow("New")).toEqual({ ok: false, reason: "write-failed" });
  });
  it("reads settings fresh and never carries workflows from memory", async () => {
    const world = createWorld({ data: { version: 3, workflows: { Disk: workflow("Disk", iso(-DAY_MS)) } } });
    workflows.set({ Memory: { name: "Memory", description: "", steps: [] } });
    await makeSync(world).saveSettings((settings) => { settings.sceneTemplate = "New"; });
    expect(Object.keys(world.read(DATA_PATH).workflows)).toEqual(["Disk"]);
    expect(world.readMirror()).toBeNull();
    expect(world.mirrorWrites).toEqual([]);
  });
  it("polls data.json and syncs only when its stat changes", async () => {
    const first = workflow("First", iso(-DAY_MS));
    const extra = workflow("Extra", iso(-2 * DAY_MS));
    const world = createWorld({ data: { version: 3, workflows: { First: first } }, mirror: mirrorFor({ First: first }, iso(-DAY_MS)) });
    const sync = makeSync(world);
    sync.start();
    await vi.advanceTimersByTimeAsync(0);
    // Startup wrote nothing, so a poll with an unchanged stat writes nothing.
    await vi.advanceTimersByTimeAsync(5000);
    expect(world.writes).toEqual([]);
    // A mirror-side change is only pushed once data.json's stat moves.
    world.setMirror(mirrorFor({ First: first, Extra: extra }, iso(-DAY_MS)));
    world.touch(DATA_PATH, { version: 3, workflows: { First: first } });
    await vi.advanceTimersByTimeAsync(5000);
    expect(world.read(DATA_PATH).workflows.Extra).toEqual(extra);
    sync.stop();
  });
  it("skips a malformed workflow instead of failing the run", async () => {
    const good = workflow("Good", iso(-DAY_MS));
    const world = createWorld({
      data: { workflows: { Good: good, Bad: { name: "Bad", description: "", steps: [null] } } },
      mirror: mirrorFor({}, null),
    });
    const sync = makeSync(world);
    await expect(sync.sync()).resolves.toBeUndefined();
    expect(sync.hasLoaded()).toBe(true);
    expect(get(workflows)).toHaveProperty("Good");
    expect(get(workflows)).not.toHaveProperty("Bad");
  });
  it("retries a failed shared write on the next poll", async () => {
    const local = workflow("Local", iso(-DAY_MS));
    const world = createWorld({ data: { version: 3, workflows: {} }, mirror: mirrorFor({ Local: local }, iso(-DAY_MS)) });
    world.adapter.rename.mockRejectedValueOnce(new Error("locked"));
    const sync = makeSync(world);
    sync.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(world.read(DATA_PATH).workflows.Local).toBeUndefined();
    await vi.advanceTimersByTimeAsync(5000);
    expect(world.read(DATA_PATH).workflows.Local).toEqual(local);
    sync.stop();
  });
  it("does not run queued work after stop", async () => {
    const world = createWorld({ data: { version: 3 } });
    const sync = makeSync(world);
    const pending = sync.createWorkflow("A");
    sync.stop();
    expect(await pending).toEqual({ ok: false, reason: "read-failed" });
    expect(world.writes).toEqual([]);
    expect(world.mirrorWrites).toEqual([]);
  });
});
describe("store refresh", () => {
  it("adopts a merged change over a startup entry carrying sync_metadata", async () => {
    const stale = deserializeWorkflow(workflow("Book", iso(-DAY_MS), { description: "stale" }));
    workflows.set({ Book: stale });
    const world = createWorld({
      data: { version: 3, workflows: { Book: workflow("Book", iso(0), { description: "from disk" }) } },
      mirror: mirrorFor({ Book: workflow("Book", iso(0), { description: "from disk" }) }, iso(0)),
    });
    await makeSync(world).sync();
    const after = get(workflows) as Record<string, any>;
    expect(after.Book.description).toBe("from disk");
    expect(after.Book.sync_metadata).toBeUndefined();
  });
  it("applies a disk change and keeps unchanged object identity", async () => {
    const entry = workflow("Book", iso(-DAY_MS));
    const still = workflow("Still", iso(-DAY_MS));
    const world = createWorld({
      data: { version: 3, workflows: { Book: entry, Still: still } },
      mirror: mirrorFor({ Book: entry, Still: still }, iso(-DAY_MS)),
    });
    const sync = makeSync(world);
    await sync.sync();
    const before = get(workflows) as Record<string, any>;
    world.touch(DATA_PATH, { version: 3, workflows: { Book: workflow("Book", iso(0), { description: "other device" }), Still: still } });
    await sync.sync();
    const after = get(workflows) as Record<string, any>;
    expect(after.Book.description).toBe("other device");
    expect(after.Still).toBe(before.Still);
  });
});
describe("helpers", () => {
  it("nextStamp is strictly monotonic", () => {
    expect(nextStamp(null, NOW)).toBe(NOW_ISO);
    expect(nextStamp(NOW_ISO, new Date(NOW.getTime() - 5000))).toBe(iso(1));
    expect(nextStamp(iso(10), NOW)).toBe(iso(11));
  });
  it("maxStamp includes tombstones", () => {
    const map: WorkflowMap = {
      Live: workflow("Live", iso(-10 * DAY_MS)),
      Dead: workflow("Dead", iso(-DAY_MS), { metadata: { deprecated_at: iso(-DAY_MS) } }),
    };
    expect(maxStamp(map)).toBe(iso(-DAY_MS));
  });
});
