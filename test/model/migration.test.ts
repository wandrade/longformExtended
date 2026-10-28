import { beforeEach, describe, expect, it, vi } from "vitest";

import type { App } from "obsidian";
import { get } from "svelte/store";

import { migrate, readLegacySettings } from "../../src/model/migration";
import { pluginSettings } from "../../src/model/stores";
import {
  DEFAULT_SETTINGS,
  LONGFORM_EXTENDED_CURRENT_PLUGIN_DATA_VERSION,
  type LongformExtendedPluginSettings,
} from "../../src/model/types";

function settings(
  overrides: Partial<LongformExtendedPluginSettings> = {}
): LongformExtendedPluginSettings {
  return {
    ...DEFAULT_SETTINGS,
    version: LONGFORM_EXTENDED_CURRENT_PLUGIN_DATA_VERSION,
    projects: {},
    ...overrides,
  };
}

function legacyApp(options: {
  exists: boolean;
  contents?: string;
  configDir?: string;
}): { app: App; paths: string[] } {
  const paths: string[] = [];
  const app = {
    vault: {
      configDir: options.configDir ?? ".obsidian",
      adapter: {
        exists: async (path: string): Promise<boolean> => {
          paths.push(path);
          return options.exists;
        },
        read: async (path: string): Promise<string> => {
          paths.push(path);
          return options.contents ?? "";
        },
      },
    },
  } as unknown as App;
  return { app, paths };
}

beforeEach(() => {
  pluginSettings.set(settings());
});

describe("migrate", () => {
  it("advances the data version and clears legacy projects", async () => {
    const current = settings({
      version: 2,
      projects: {
        "Books/Old": { indexFile: "Index", draftsPath: "Drafts" },
      },
    });
    // With no index metadata the project loop cannot migrate, but the version
    // and legacy projects map are still brought up to date.
    const app = {
      metadataCache: { getCache: (): null => null },
      vault: {
        adapter: {
          append: async (): Promise<void> => undefined,
          list: async (): Promise<{
            files: string[];
            folders: string[];
          }> => ({ files: [], folders: [] }),
          rename: async (): Promise<void> => undefined,
        },
      },
    } as unknown as App;

    const migrated = await migrate(current, app);

    expect(migrated).toBe(true);
    expect(get(pluginSettings)?.version).toBe(
      LONGFORM_EXTENDED_CURRENT_PLUGIN_DATA_VERSION
    );
    expect(get(pluginSettings)?.projects).toEqual({});
    expect(get(pluginSettings)).not.toBe(current);
  });

  it("does nothing when the data version is already current", async () => {
    const current = settings({
      projects: { Keep: { indexFile: "Index", draftsPath: "Drafts" } },
    });
    const app = {} as App;

    const migrated = await migrate(current, app);

    expect(migrated).toBe(false);
    // The early return leaves the settings object untouched.
    expect(current.version).toBe(
      LONGFORM_EXTENDED_CURRENT_PLUGIN_DATA_VERSION
    );
    expect(current.projects).toEqual({
      Keep: { indexFile: "Index", draftsPath: "Drafts" },
    });
  });
});

describe("readLegacySettings", () => {
  it("reads the data file beside this plugin's own folder", async () => {
    const { app, paths } = legacyApp({
      exists: true,
      contents: JSON.stringify({ version: 2, projects: {} }),
    });

    const result = await readLegacySettings(
      app,
      ".obsidian/plugins/longform-extended"
    );

    expect(paths[0]).toBe(".obsidian/plugins/longform/data.json");
    expect(result).toEqual({ version: 2, projects: {} });
  });

  it("falls back to the config directory when the plugin folder is unknown", async () => {
    const { app, paths } = legacyApp({
      exists: true,
      contents: JSON.stringify({ version: 3 }),
    });

    await readLegacySettings(app, null);

    expect(paths[0]).toBe(".obsidian/plugins/longform/data.json");
  });

  it("returns null when upstream Longform left no data file", async () => {
    const { app } = legacyApp({ exists: false });

    expect(
      await readLegacySettings(app, ".obsidian/plugins/longform-extended")
    ).toBeNull();
  });

  it("returns null for unreadable or non-object data", async () => {
    const warn = vi
      .spyOn(console, "warn")
      .mockImplementation((): void => undefined);

    const notJson = legacyApp({ exists: true, contents: "not json" });
    expect(await readLegacySettings(notJson.app, null)).toBeNull();

    const array = legacyApp({ exists: true, contents: "[]" });
    expect(await readLegacySettings(array.app, null)).toBeNull();

    warn.mockRestore();
  });
});
