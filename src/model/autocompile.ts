import type { App } from "obsidian";
import { get, type Unsubscriber } from "svelte/store";

import { calculateWorkflow, compile, WorkflowError } from "src/compile";
import { refreshGeneratedFiles } from "./refresh-generated";
import { drafts as draftsStore, workflows } from "./stores";
import type { MultipleSceneDraft } from "./types";

type ProjectTimer = {
  minutes: number;
  handle: number;
};

/**
 * Runs each project's compile and status refresh on its own interval.
 *
 * One timer per scenes project with a positive `autocompileMinutes`, keyed by
 * vault path. Timers are rebuilt whenever the drafts store changes and are
 * cleared on teardown.
 */
export class AutocompileScheduler {
  private app: App;
  private timers = new Map<string, ProjectTimer>();
  private running = new Set<string>();
  private unsubscribeDrafts: Unsubscriber | null = null;
  private destroyed = false;

  constructor(app: App) {
    this.app = app;
  }

  start(): void {
    this.sync();
    this.unsubscribeDrafts = draftsStore.subscribe(() => this.sync());
  }

  destroy(): void {
    this.destroyed = true;
    if (this.unsubscribeDrafts) {
      this.unsubscribeDrafts();
      this.unsubscribeDrafts = null;
    }
    for (const timer of this.timers.values()) {
      window.clearInterval(timer.handle);
    }
    this.timers.clear();
  }

  /**
   * Brings the timer set in line with the store. A timer whose project was
   * removed or whose interval changed is replaced; matching timers keep their
   * current countdown.
   */
  private sync(): void {
    if (this.destroyed) {
      return;
    }

    const wanted = new Map<string, number>();
    for (const draft of get(draftsStore)) {
      if (draft.format !== "scenes") {
        continue;
      }
      const minutes = draft.autocompileMinutes;
      if (typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0) {
        wanted.set(draft.vaultPath, Math.floor(minutes));
      }
    }

    for (const [vaultPath, timer] of Array.from(this.timers.entries())) {
      const minutes = wanted.get(vaultPath);
      if (minutes === undefined || minutes !== timer.minutes) {
        window.clearInterval(timer.handle);
        this.timers.delete(vaultPath);
      }
    }

    for (const [vaultPath, minutes] of wanted) {
      if (this.timers.has(vaultPath)) {
        continue;
      }
      const handle = window.setInterval(() => {
        void this.run(vaultPath);
      }, minutes * 60 * 1000);
      this.timers.set(vaultPath, { minutes, handle });
    }
  }

  private async run(vaultPath: string): Promise<void> {
    if (this.destroyed || this.running.has(vaultPath)) {
      return;
    }

    const draft = get(draftsStore).find(
      (candidate): candidate is MultipleSceneDraft =>
        candidate.format === "scenes" && candidate.vaultPath === vaultPath
    );
    if (!draft) {
      return;
    }

    this.running.add(vaultPath);
    try {
      await this.compileIfConfigured(draft);
    } catch (error) {
      console.error(
        `[Longform Extended] Autocompile failed to compile ${vaultPath}:`,
        error
      );
    }

    try {
      await refreshGeneratedFiles(this.app, draft);
    } catch (error) {
      console.error(
        `[Longform Extended] Autocompile failed to refresh ${vaultPath}:`,
        error
      );
    } finally {
      this.running.delete(vaultPath);
    }
  }

  private async compileIfConfigured(
    draft: MultipleSceneDraft
  ): Promise<void> {
    const workflow = draft.workflow
      ? get(workflows)[draft.workflow] ?? null
      : null;
    if (!workflow) {
      return;
    }

    const [validation, kinds] = calculateWorkflow(workflow, true);
    if (validation.error !== WorkflowError.Valid) {
      return;
    }

    await compile(this.app, draft, workflow, kinds, () => {
      // Autocompile has no visible status surface.
    });
  }
}
