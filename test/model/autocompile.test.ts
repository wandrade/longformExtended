import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { App } from "obsidian";

import { AutocompileScheduler } from "../../src/model/autocompile";
import { calculateWorkflow, compile, WorkflowError } from "src/compile";
import { refreshGeneratedFiles } from "../../src/model/refresh-generated";
import { drafts as draftsStore, workflows } from "../../src/model/stores";
import type { MultipleSceneDraft } from "../../src/model/types";

vi.mock("src/compile", () => ({
  compile: vi.fn(),
  calculateWorkflow: vi.fn(),
  WorkflowError: { Valid: "", BadFirstStep: "bad first step" },
}));

vi.mock("../../src/model/refresh-generated", () => ({
  refreshGeneratedFiles: vi.fn(),
}));

// The scheduler clears and creates timers through `window`. Tests run in plain
// Node, so point `window` at the faked global timer functions.
(globalThis as unknown as { window: typeof globalThis }).window = globalThis;

const app = {} as App;

function makeDraft(
  overrides: Partial<MultipleSceneDraft> = {}
): MultipleSceneDraft {
  return {
    format: "scenes",
    title: "Book",
    titleInFrontmatter: true,
    draftTitle: null,
    vaultPath: "Books/My/Book.md",
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
    sceneDisplayName: "Scenes",
    plotsDisplayName: "Subplots",
    charactersDisplayName: "Characters",
    noteGroups: [],
    timeframeTagName: "timeframe",
    timeFormat: "datetime",
    kanbanColumns: "Planned Draft Reviewed",
    kanbanShowUnassigned: false,
    kanbanSaveWordCounts: true,
    kanbanEnabled: true,
    kanbanIncludePlots: true,
    kanbanOutputPath: "Build/$1_kanban.base",
    timelineEnabled: true,
    timelineOutputPath: "Build/$1_timeline.md",
    plotGridEnabled: true,
    plotGridOutputPath: "Base/$1_plotgrid.base",
    plotGridPlotsDir: "Subplots",
    plotGridCharactersDir: "Characters",
    autocompileMinutes: null,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const schedulers: AutocompileScheduler[] = [];

function startScheduler(): AutocompileScheduler {
  const scheduler = new AutocompileScheduler(app);
  scheduler.start();
  schedulers.push(scheduler);
  return scheduler;
}

beforeEach(() => {
  vi.useFakeTimers();
  draftsStore.set([]);
  workflows.set({});
  vi.mocked(compile).mockReset();
  vi.mocked(compile).mockResolvedValue(undefined);
  vi.mocked(calculateWorkflow).mockReset();
  vi.mocked(calculateWorkflow).mockReturnValue([
    { error: WorkflowError.Valid, stepPosition: 0 },
    [],
  ]);
  vi.mocked(refreshGeneratedFiles).mockReset();
  vi.mocked(refreshGeneratedFiles).mockResolvedValue(undefined);
});

afterEach(() => {
  for (const scheduler of schedulers) {
    scheduler.destroy();
  }
  schedulers.length = 0;
  vi.useRealTimers();
});

describe("AutocompileScheduler", () => {
  it("creates no timer for null, zero, or negative values", () => {
    draftsStore.set([
      makeDraft({ vaultPath: "Books/Null/Book.md", autocompileMinutes: null }),
      makeDraft({ vaultPath: "Books/Zero/Book.md", autocompileMinutes: 0 }),
      makeDraft({ vaultPath: "Books/Negative/Book.md", autocompileMinutes: -5 }),
    ]);

    startScheduler();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("creates a timer whose interval is the minutes value times 60000", async () => {
    draftsStore.set([makeDraft({ autocompileMinutes: 2 })]);

    startScheduler();
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(2 * 60 * 1000 - 1);
    expect(refreshGeneratedFiles).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(refreshGeneratedFiles).toHaveBeenCalledTimes(1);
  });

  it("reschedules when the value changes", async () => {
    const draft = makeDraft({ autocompileMinutes: 1 });
    draftsStore.set([draft]);
    startScheduler();

    await vi.advanceTimersByTimeAsync(30_000);
    draftsStore.set([{ ...draft, autocompileMinutes: 5 }]);
    expect(vi.getTimerCount()).toBe(1);

    // The old one-minute timer would have fired at 60 seconds.
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 - 1);
    expect(refreshGeneratedFiles).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(refreshGeneratedFiles).toHaveBeenCalledTimes(1);
  });

  it("clears the timer for a project removed from the store", () => {
    draftsStore.set([makeDraft({ autocompileMinutes: 1 })]);
    startScheduler();
    expect(vi.getTimerCount()).toBe(1);

    draftsStore.set([]);

    expect(vi.getTimerCount()).toBe(0);
  });

  it("destroy clears every timer and unsubscribes from the drafts store", () => {
    draftsStore.set([
      makeDraft({ vaultPath: "Books/A/Book.md", autocompileMinutes: 1 }),
      makeDraft({ vaultPath: "Books/B/Book.md", autocompileMinutes: 2 }),
    ]);
    const scheduler = startScheduler();
    expect(vi.getTimerCount()).toBe(2);

    scheduler.destroy();
    expect(vi.getTimerCount()).toBe(0);

    draftsStore.set([
      makeDraft({ vaultPath: "Books/C/Book.md", autocompileMinutes: 1 }),
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refreshes on a tick even when the project has no workflow", async () => {
    const draft = makeDraft({ autocompileMinutes: 1, workflow: null });
    draftsStore.set([draft]);
    startScheduler();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(compile).not.toHaveBeenCalled();
    expect(refreshGeneratedFiles).toHaveBeenCalledTimes(1);
    expect(refreshGeneratedFiles).toHaveBeenCalledWith(app, draft);
  });

  it("skips compilation when the named workflow does not exist but still refreshes", async () => {
    const draft = makeDraft({ autocompileMinutes: 1, workflow: "Missing" });
    draftsStore.set([draft]);
    startScheduler();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(compile).not.toHaveBeenCalled();
    expect(refreshGeneratedFiles).toHaveBeenCalledTimes(1);
  });

  it("skips compilation when the workflow is invalid but still refreshes", async () => {
    const draft = makeDraft({ autocompileMinutes: 1, workflow: "Novel" });
    workflows.set({
      Novel: { name: "Novel", description: "", steps: [] },
    });
    vi.mocked(calculateWorkflow).mockReturnValue([
      { error: WorkflowError.BadFirstStep, stepPosition: 0 },
      [],
    ]);
    draftsStore.set([draft]);
    startScheduler();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(compile).not.toHaveBeenCalled();
    expect(refreshGeneratedFiles).toHaveBeenCalledTimes(1);
  });

  it("compiles before refreshing when the workflow is valid", async () => {
    const draft = makeDraft({ autocompileMinutes: 1, workflow: "Novel" });
    workflows.set({
      Novel: { name: "Novel", description: "", steps: [] },
    });
    draftsStore.set([draft]);
    startScheduler();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(compile).toHaveBeenCalledTimes(1);
    expect(refreshGeneratedFiles).toHaveBeenCalledTimes(1);
    expect(vi.mocked(compile).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(refreshGeneratedFiles).mock.invocationCallOrder[0]
    );
  });

  it("skips a tick while the previous run is still in progress", async () => {
    const pending = deferred<void>();
    vi.mocked(refreshGeneratedFiles).mockReturnValue(pending.promise);
    const draft = makeDraft({ autocompileMinutes: 1, workflow: null });
    draftsStore.set([draft]);
    startScheduler();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(refreshGeneratedFiles).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(refreshGeneratedFiles).toHaveBeenCalledTimes(1);

    pending.resolve();
    await pending.promise;

    await vi.advanceTimersByTimeAsync(60_000);
    expect(refreshGeneratedFiles).toHaveBeenCalledTimes(2);
  });
});
