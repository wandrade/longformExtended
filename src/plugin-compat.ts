import type { App } from "obsidian";

const LONGFORM_PLUGIN_ID = "longform";

export function isLongformPluginEnabled(
  app: App & {
    plugins?: {
      enabledPlugins?: string[];
      plugins?: Record<string, unknown>;
    };
  }
): boolean {
  if (!app?.plugins) {
    return false;
  }

  if (Array.isArray(app.plugins.enabledPlugins)) {
    if (app.plugins.enabledPlugins.includes(LONGFORM_PLUGIN_ID)) {
      return true;
    }
  }

  if (app.plugins.plugins && app.plugins.plugins[LONGFORM_PLUGIN_ID]) {
    return true;
  }

  return false;
}

export { LONGFORM_PLUGIN_ID };
