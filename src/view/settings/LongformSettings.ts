import {
  App,
  debounce,
  normalizePath,
  PluginSettingTab,
  Setting,
} from "obsidian";
import type { Unsubscriber } from "svelte/store";
import { get } from "svelte/store";

import type LongformExtendedPlugin from "../../main";
import { pluginSettings } from "src/model/stores";
import { DEFAULT_SESSION_FILE } from "src/model/types";
import { FileSuggest } from "./file-suggest";
import { syncSceneIndices } from "src/model/store-vault-sync";

export class LongformExtendedSettingsTab extends PluginSettingTab {
  plugin: LongformExtendedPlugin;
  private unsubscribeSettings: Unsubscriber;

  constructor(app: App, plugin: LongformExtendedPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const settings = get(pluginSettings);

    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl).setName("Composition").setHeading();
    new Setting(containerEl).setName("New scene template").addSearch((cb) => {
      new FileSuggest(this.app, cb.inputEl);
      cb.setPlaceholder("templates/Scene.md")
        .setValue(settings.sceneTemplate)
        .onChange((v) => {
          pluginSettings.update((s) => ({
            ...s,
            sceneTemplate: v,
          }));
        });
    });
    containerEl.createEl("p", { cls: "setting-item-description" }, (el) => {
      el.setText(
        "This file will be used as a template when creating new scenes via the new scene… field. If you use a templating plugin (templater or the core plugin) it will be used to process this template. This setting applies to all projects and can be overridden per-project in the project > project metadata settings in the longform extended pane."
      );
    });

    new Setting(containerEl)
      .setName("New subplot template")
      .addSearch((cb) => {
        new FileSuggest(this.app, cb.inputEl);
        cb.setPlaceholder("templates/Subplot.md")
          .setValue(settings.plotTemplate)
          .onChange((v) => {
            pluginSettings.update((s) => ({
              ...s,
              plotTemplate: v,
            }));
          });
      });
    containerEl.createEl("p", { cls: "setting-item-description" }, (el) => {
      el.setText(
        "This file will be used as a template when creating new subplots via the new subplot… field. If you use a templating plugin (templater or the core plugin) it will be used to process this template. This setting applies to all projects and can be overridden per-project in the project > project metadata settings in the longform extended pane."
      );
    });

    new Setting(containerEl)
      .setName("New character template")
      .addSearch((cb) => {
        new FileSuggest(this.app, cb.inputEl);
        cb.setPlaceholder("templates/Character.md")
          .setValue(settings.characterTemplate)
          .onChange((v) => {
            pluginSettings.update((s) => ({
              ...s,
              characterTemplate: v,
            }));
          });
      });
    containerEl.createEl("p", { cls: "setting-item-description" }, (el) => {
      el.setText(
        "This file will be used as a template when creating new characters via the new character… field. If you use a templating plugin (templater or the core plugin) it will be used to process this template. This setting applies to all projects and can be overridden per-project in the project > project metadata settings in the longform extended pane."
      );
    });

    new Setting(containerEl)
      .setName("Show scene numbers in scenes tab")
      .setDesc(
        "If on, shows numbers for scenes with subscenes separated by periods, e.g. 1.1.2. Create subscenes by dragging a scene to an indent under an existing scene, or us an indent command."
      )
      .addToggle((cb) => {
        cb.setValue(settings.numberScenes);
        cb.onChange((value) => {
          pluginSettings.update((s) => ({
            ...s,
            numberScenes: value,
          }));
        });
      });

    new Setting(containerEl)
      .setName("Write scene index to frontmatter")
      .setDesc(
        "If enabled, will add a scene index, and scene number, to the frontmatter of scene notes."
      )
      .addToggle((toggle) => {
        toggle.setValue(settings.writeProperty);
        toggle.onChange((value) => {
          pluginSettings.update((settings) => ({
            ...settings,
            writeProperty: value,
          }));
          if (value) {
            void syncSceneIndices(this.app);
          }
        });
      });

    new Setting(containerEl).setName("Word counts & sessions").setHeading();
    new Setting(containerEl)
      .setName("Show word counts in status bar")
      .setDesc("Click the status item to show the focused note’s project.")
      .addToggle((cb) => {
        cb.setValue(settings.showWordCountInStatusBar);
        cb.onChange((value) => {
          pluginSettings.update((s) => ({
            ...s,
            showWordCountInStatusBar: value,
          }));
        });
      });
    new Setting(containerEl)
      .setName("Start new writing sessions each day")
      .setDesc(
        "You can always manually start a new session by running the longform extended: Start new writing session command. Turning this off will cause writing sessions to carry over across multiple days until you manually start a new one."
      )
      .addToggle((cb) => {
        cb.setValue(settings.startNewSessionEachDay);
        cb.onChange((value) => {
          pluginSettings.update((s) => ({
            ...s,
            startNewSessionEachDay: value,
          }));
        });
      });
    new Setting(containerEl)
      .setName("Session word count goal")
      .setDesc("A number of words to target for a given writing session.")
      .addText((cb) => {
        cb.setValue(settings.sessionGoal.toString());
        cb.onChange((value) => {
          const numberValue = +value;
          if (numberValue && numberValue > 0) {
            pluginSettings.update((s) => ({ ...s, sessionGoal: numberValue }));
          }
        });
      });
    new Setting(containerEl)
      .setName("Goal applies to")
      .setDesc(
        "You can set your word count goal to target all longform extended writing, or you can make each project or scene have its own discrete goal."
      )
      .addDropdown((cb) => {
        cb.addOption("all", "Words written across all projects");
        cb.addOption("project", "Each project individually");
        cb.addOption("note", "Each scene or single-scene project");
        cb.setValue(settings.applyGoalTo);
        cb.onChange((value: "all" | "project" | "note") => {
          pluginSettings.update((s) => ({ ...s, applyGoalTo: value }));
        });
      });
    new Setting(containerEl)
      .setName("Notify on goal reached")
      .addToggle((cb) => {
        cb.setValue(settings.notifyOnGoal);
        cb.onChange((value) => {
          pluginSettings.update((s) => ({ ...s, notifyOnGoal: value }));
        });
      });
    new Setting(containerEl)
      .setName("Count deletions against goal")
      .setDesc(
        "If on, deleting words will count as negative words written. You cannot go below zero for a session."
      )
      .addToggle((cb) => {
        cb.setValue(settings.countDeletionsForGoal);
        cb.onChange((value) => {
          pluginSettings.update((s) => ({
            ...s,
            countDeletionsForGoal: value,
          }));
        });
      });
    new Setting(containerEl)
      .setName("Sessions to keep")
      .setDesc("Number of sessions to store locally.")
      .addText((cb) => {
        cb.setValue(settings.keepSessionCount.toString());
        cb.onChange((value) => {
          const numberValue = +value;
          if (numberValue && numberValue > 0) {
            pluginSettings.update((s) => ({
              ...s,
              keepSessionCount: numberValue,
            }));
          }
        });
      });
    new Setting(containerEl)
      .setName("Store session data")
      .setDesc(
        "Where your writing session data is stored. By default, data is stored alongside other Longform Extended settings in the plugin’s data.json file. You may instead store it in a separate .json file in the plugin folder, or in a file in your vault. You may want to do this for selective sync or git reasons."
      )
      .addDropdown((cb) => {
        cb.addOption("data", "With longform extended settings");
        cb.addOption(
          "plugin-folder",
          "as a .json file in the longform-extended/ plugin folder"
        );
        cb.addOption("file", "As a file in your vault");
        cb.setValue(settings.sessionStorage);
        cb.onChange((value: "data" | "plugin-folder" | "file") => {
          pluginSettings.update((s) => ({ ...s, sessionStorage: value }));
        });
      });

    const updateSessionFile = debounce((value: string) => {
      // Normalize file to end in .json
      let fileName = value;
      if (!fileName || fileName.length === 0) {
        fileName = DEFAULT_SESSION_FILE;
      }
      fileName = normalizePath(fileName);
      if (!fileName.endsWith(".json")) {
        fileName = `${fileName}.json`;
      }
      pluginSettings.update((s) => ({ ...s, sessionFile: fileName }));
    }, 1000);

    const sessionFileStorageSettings = new Setting(containerEl)
      .setName("Session storage file")
      .setDesc(
        "Location in your vault to store session JSON. Created if does not exist, overwritten if it does."
      )
      .addText((cb) => {
        cb.setPlaceholder(DEFAULT_SESSION_FILE);
        cb.setValue(settings.sessionFile ?? DEFAULT_SESSION_FILE);
        cb.onChange(updateSessionFile);
      });
    sessionFileStorageSettings.settingEl.setCssProps({ display: "none" });

    this.unsubscribeSettings = pluginSettings.subscribe((settings) => {
      sessionFileStorageSettings.settingEl.setCssProps({
        display: settings.sessionStorage === "file" ? "flex" : "none",
      });
    });

    new Setting(containerEl).setName("Troubleshooting").setHeading();

    new Setting(containerEl)
      .setName("Wait for Obsidian Sync")
      .setDesc("Prevent longform extended from running until Obsidian Sync completes its first sync. If you are using sync, you may want to enable this if you experience issues with scenes disappearing or falsely being shown as new.")
      .addToggle((cb) => {
        cb.setValue(settings.waitForSync);
        cb.onChange((value) => {
          pluginSettings.update((s) => ({
            ...s,
            waitForSync: value,
          }));
        });
      });

    new Setting(containerEl)
      .setName("Enable fallback wait")
      .setDesc("If sync status cannot be detected, wait for the time specified below before looking for scenes.")
      .addToggle((cb) => {
        cb.setValue(settings.fallbackWaitEnabled);
        cb.onChange((value) => {
          pluginSettings.update((s) => ({
            ...s,
            fallbackWaitEnabled: value,
          }));
        });
      });

    new Setting(containerEl)
      .setName("Fallback wait time")
      .setDesc("Time to wait in seconds if sync status cannot be detected.")
      .addText((cb) => {
        cb.setValue(settings.fallbackWaitTime.toString());
        cb.onChange((value) => {
          const numberValue = parseInt(value);
          if (!isNaN(numberValue) && numberValue > 0) {
            pluginSettings.update((s) => ({
              ...s,
              fallbackWaitTime: numberValue,
            }));
          }
        });
      });

    new Setting(containerEl).setName("Credits").setHeading();

    containerEl.createEl("p", {}, (el) => {
      el.appendText("Longform was created by ");
      el.createEl("a", {
        text: "Kevin barrett",
        href: "https://github.com/kevboh/longform",
      });
      el.appendText(".");
    });
    containerEl.createEl("p", {}, (el) => {
      el.appendText("Longform Extended is maintained by ");
      el.createEl("a", {
        text: "Werner thomassen andrade",
        href: "https://github.com/wandrade/longformExtended",
      });
      el.appendText(".");
    });
    containerEl.createEl("p", {}, (el) => {
      el.appendText("Read the source code and report issues at ");
      el.createEl("a", {
        text: "HTTPS://GitHub.com/wandrade/longformextended",
        href: "https://github.com/wandrade/longformExtended",
      });
      el.appendText(".");
    });
    containerEl.createEl("p", {}, (el) => {
      el.appendText("Icon made by ");
      el.createEl("a", {
        text: "Zlatko najdenovski",
        href: "https://www.flaticon.com/authors/zlatko-najdenovski",
        attr: { title: "Zlatko najdenovski" },
      });
      el.appendText(" from ");
      el.createEl("a", {
        text: "www.flaticon.com",
        href: "https://www.flaticon.com/",
        attr: { title: "Flaticon" },
      });
      el.appendText(".");
    });
  }

  hide(): void {
    this.unsubscribeSettings();
  }
}
