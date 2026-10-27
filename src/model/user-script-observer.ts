import debounce from "lodash/debounce";
import type { Vault, TAbstractFile } from "obsidian";
import type { CompileStep, CompileStepOption, Workflow } from "src/compile";
import {
  CompileStepKind,
  CompileStepOptionType,
  makeBuiltinStep,
} from "src/compile";
import { pluginSettings, userScriptSteps, workflows } from "src/model/stores";
import type { LongformExtendedPluginSettings } from "src/model/types";
import type { Unsubscriber } from "svelte/store";
import { get } from "svelte/store";

const DEBOUNCE_SCRIPT_LOAD_DELAY_MS = 10_000;

type RequireFn = (module: string) => unknown;

type UserScriptOption = Partial<CompileStepOption> & {
  type: string | number;
};

type UserScriptStep = {
  id?: string;
  optionValues?: Record<string, unknown>;
  description: {
    name: string;
    description: string;
    availableKinds: string[];
    options?: UserScriptOption[];
  };
  compile: CompileStep["compile"];
};

/**
 * Watches the user's script folder and loads the scripts it finds there.
 */
export class UserScriptObserver {
  private vault: Vault;
  userScriptFolder: string | null;
  private unsubscribeScriptFolder: Unsubscriber;
  private initializedSteps = false;
  private onScriptModify: () => void;

  constructor(vault: Vault, userScriptFolder: string | null) {
    this.vault = vault;
    this.userScriptFolder = userScriptFolder;
    this.onScriptModify = debounce(() => {
      void this.loadUserSteps();
    }, DEBOUNCE_SCRIPT_LOAD_DELAY_MS);
  }

  destroy(): void {
    this.unsubscribeScriptFolder();
  }

  beginObserving(): void {
    if (this.unsubscribeScriptFolder) {
      this.unsubscribeScriptFolder();
    }
    this.unsubscribeScriptFolder = pluginSettings.subscribe((s) => {
      void this.handleSettingsChange(s);
    });
  }

  private async handleSettingsChange(
    s: LongformExtendedPluginSettings
  ): Promise<void> {
    if (
      this.initializedSteps &&
      s.userScriptFolder === this.userScriptFolder
    ) {
      return;
    }

    if (s.userScriptFolder == null) {
      return;
    }

    const valid = await this.vault.adapter.exists(s.userScriptFolder);
    if (!valid) {
      return;
    }

    this.userScriptFolder = s.userScriptFolder;
    if (this.userScriptFolder) {
      await this.loadUserSteps();
    } else {
      userScriptSteps.set(null);
    }
  }

  async loadUserSteps(): Promise<CompileStep[]> {
    if (!this.userScriptFolder) {
      return;
    }

    const valid = await this.vault.adapter.exists(this.userScriptFolder);
    if (!valid) {
      return;
    }

    // Get all .js files in folder
    const { files } = await this.vault.adapter.list(this.userScriptFolder);
    const scripts = files.filter((f) => f.endsWith("js"));

    const userSteps: CompileStep[] = [];
    for (const file of scripts) {
      try {
        const step = await this.loadScript(file);
        userSteps.push(step);
      } catch (e) {
        console.error(
          `[Longform Extended] skipping user script ${file} due to error:`,
          e
        );
      }
    }

    userScriptSteps.set(userSteps);

    this.initializedSteps = true;

    // if workflows have loaded, merge in user steps to get updated values
    const _workflows = get(workflows);
    const workflowNames = Object.keys(_workflows);
    const mergedWorkflows: Record<string, Workflow> = {};
    workflowNames.forEach((name) => {
      const workflow = _workflows[name];
      const workflowSteps = workflow.steps.map((step) => {
        const userStep = userSteps.find(
          (u) => step.description.canonicalID === u.description.canonicalID
        );
        if (userStep) {
          let mergedStep = {
            ...userStep,
            id: step.id,
            optionValues: userStep.optionValues,
          };
          // Copy existing step's option values into the merged step
          for (const key of Object.keys(step.optionValues)) {
            if (mergedStep.optionValues[key]) {
              mergedStep = {
                ...mergedStep,
                optionValues: {
                  ...mergedStep.optionValues,
                  [key]: step.optionValues[key],
                },
              };
            }
          }
          return mergedStep;
        } else {
          return step;
        }
      });
      mergedWorkflows[name] = {
        ...workflow,
        steps: workflowSteps,
      };
    });
    workflows.set(mergedWorkflows);

    return userSteps;
  }

  private async loadScript(path: string): Promise<CompileStep> {
    const js = await this.vault.adapter.read(path);

    const windowWithRequire = window as Window & { require?: RequireFn };
    const _require = (s: string): unknown => {
      return windowWithRequire.require?.(s);
    };
    const exports: Record<string, unknown> = {};
    const module: { exports: unknown } = {
      exports,
    };

    // User scripts are arbitrary JavaScript by design; executing them is the
    // only way to support this feature.
    const evaluateScript = window.eval(
      "(function anonymous(require, module, exports){" + js + "\n})"
    ) as (
      require: RequireFn,
      module: { exports: unknown },
      exports: Record<string, unknown>
    ) => void;
    evaluateScript(_require, module, exports);
    const loadedStep = (exports["default"] || module.exports) as
      | UserScriptStep
      | undefined;

    if (!loadedStep) {
      console.error(
        `[Longform Extended] Failed to load user script ${path}. No exports detected.`
      );
      throw new Error(
        `Failed to load user script ${path}. No exports detected.`
      );
    }

    const options = (loadedStep.description.options ?? []).map((o) => ({
      ...o,
      type: CompileStepOptionType[
        o.type as unknown as keyof typeof CompileStepOptionType
      ],
    })) as CompileStepOption[];

    const step = makeBuiltinStep(
      {
        ...loadedStep,
        id: path,
        description: {
          ...loadedStep.description,
          availableKinds: loadedStep.description.availableKinds.map(
            (v) => CompileStepKind[v as keyof typeof CompileStepKind]
          ),
          options,
        },
      },
      true
    );

    return {
      ...step,
      id: path,
      description: {
        ...step.description,
        canonicalID: path,
        isScript: true,
      },
    };
  }

  fileEventCallback(file: TAbstractFile): void {
    if (
      this.userScriptFolder &&
      file.path.endsWith("js") &&
      ((file.parent && file.parent.path == this.userScriptFolder) ||
        (file.parent === null && file.path.startsWith(this.userScriptFolder)))
    ) {
      this.onScriptModify();
    }
  }
}
