import { describe, expect, it } from "vitest";

import { isLongformPluginEnabled } from "../src/plugin-compat";

describe("Longform conflict detection", () => {
  it("detects when the upstream Longform plugin is enabled", () => {
    const app = {
      plugins: {
        enabledPlugins: ["longform"],
        plugins: { longform: { id: "longform" } },
      },
    } as any;

    expect(isLongformPluginEnabled(app)).toBe(true);
  });

  it("returns false when Longform is not enabled", () => {
    const app = {
      plugins: {
        enabledPlugins: ["other-plugin"],
        plugins: { "other-plugin": { id: "other-plugin" } },
      },
    } as any;

    expect(isLongformPluginEnabled(app)).toBe(false);
  });
});
