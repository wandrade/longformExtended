import { beforeEach, describe, expect, it } from "vitest";

import type { App } from "obsidian";
import { get } from "svelte/store";

import {
  determineMigrationStatus,
  migrate,
  needsMigration,
} from "../../src/model/migration";
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

beforeEach(() => {
  needsMigration.set(false);
  pluginSettings.set(settings());
});

describe("determineMigrationStatus", () => {
  it("flags older data versions only", () => {
    determineMigrationStatus(settings({ version: 2 }));
    expect(get(needsMigration)).toBe(true);

    determineMigrationStatus(
      settings({ version: LONGFORM_EXTENDED_CURRENT_PLUGIN_DATA_VERSION })
    );
    expect(get(needsMigration)).toBe(false);

    determineMigrationStatus(
      settings({ version: LONGFORM_EXTENDED_CURRENT_PLUGIN_DATA_VERSION + 1 })
    );
    expect(get(needsMigration)).toBe(false);
  });
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

    await migrate(current, app);

    expect(get(pluginSettings)?.version).toBe(
      LONGFORM_EXTENDED_CURRENT_PLUGIN_DATA_VERSION
    );
    expect(get(pluginSettings)?.projects).toEqual({});
    expect(get(needsMigration)).toBe(false);
  });

  it("does nothing when the data version is already current", async () => {
    const current = settings({
      projects: { Keep: { indexFile: "Index", draftsPath: "Drafts" } },
    });
    const app = {} as App;

    await migrate(current, app);

    // The early return leaves the settings object untouched.
    expect(current.version).toBe(
      LONGFORM_EXTENDED_CURRENT_PLUGIN_DATA_VERSION
    );
    expect(current.projects).toEqual({
      Keep: { indexFile: "Index", draftsPath: "Drafts" },
    });
    expect(get(needsMigration)).toBe(false);
  });
});
