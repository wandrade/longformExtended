import { last } from "lodash";
import { App, normalizePath } from "obsidian";
import { writable } from "svelte/store";
import { insertDraftIntoFrontmatter } from "./draft-utils";
import { pluginSettings } from "./stores";
import {
  DEFAULT_CHARACTERS_DISPLAY_NAME,
  DEFAULT_KANBAN_COLUMNS,
  DEFAULT_KANBAN_INCLUDE_PLOTS,
  DEFAULT_KANBAN_OUTPUT_PATH,
  DEFAULT_PLOT_GRID_CHARACTERS_DIR,
  DEFAULT_PLOT_GRID_ENABLED,
  DEFAULT_PLOT_GRID_OUTPUT_PATH,
  DEFAULT_PLOT_GRID_PLOTS_DIR,
  DEFAULT_PLOTS_DISPLAY_NAME,
  DEFAULT_SCENE_DISPLAY_NAME,
  DEFAULT_TIMEFRAME_TAG_NAME,
  DEFAULT_TIMELINE_OUTPUT_PATH,
  DEFAULT_TIME_FORMAT,
  LONGFORM_EXTENDED_CURRENT_PLUGIN_DATA_VERSION,
  type LongformExtendedPluginSettings,
  type MultipleSceneDraft,
} from "./types";

const INDEX_MIGRATION_NOTICE =
  "\n\nThis is a Longform 1.0 Index File, and the project it corresponded to has since been migrated. It has been marked as to-be-ignored in the new project and can be safely deleted.";

export const needsMigration = writable<boolean>(false);

/** The draft shape written by the legacy Projects 1.0/2.0 index format. */
type LegacyDraft = {
  name: string;
  folder: string;
  scenes: string[];
};

/**
 * The version values compared below are data-format versions inherited from
 * upstream Longform FORKED_VERSION. They are independent of Longform
 * Extended's own release version (see manifest.json), so do not align them
 * with the fork's semver.
 */
export function determineMigrationStatus(settings: LongformExtendedPluginSettings) {
  needsMigration.set(settings.version < LONGFORM_EXTENDED_CURRENT_PLUGIN_DATA_VERSION);
}

export async function migrate(settings: LongformExtendedPluginSettings, app: App) {
  if (settings.version >= LONGFORM_EXTENDED_CURRENT_PLUGIN_DATA_VERSION) {
    return;
  }

  let currentVersion = settings.version;

  while (currentVersion < LONGFORM_EXTENDED_CURRENT_PLUGIN_DATA_VERSION) {
    // Projects 1.0 -> Projects 2.0
    if (currentVersion === 2) {
      // for each tracked project, for each draft in each tracked project
      // convert to a projects 2.0 Draft.
      // projects with one draft lose their Drafts/Draft folder
      // projects with > 1 draft

      const projectPaths = Object.keys(settings.projects);
      for (const projectPath of projectPaths) {
        const project = settings.projects[projectPath];
        const normalizedProjectPath = normalizePath(projectPath);

        const indexPath = normalizePath(
          `${projectPath}/${project.indexFile}.md`
        );
        const metadata = app.metadataCache.getCache(indexPath);
        if (!metadata || !metadata.frontmatter) {
          continue;
        }
        const frontmatter = metadata.frontmatter as Record<string, unknown>;
        const workflow = (frontmatter["workflow"] ?? null) as string | null;
        const drafts = (frontmatter["drafts"] ?? []) as LegacyDraft[];
        const title = last(projectPath.split("/"));

        const moveScenes = async (from: string, to: string) => {
          const { files } = await app.vault.adapter.list(from);
          for (const file of files) {
            if (file.endsWith(".md")) {
              const fileName = last(file.split("/"));
              const toPath = normalizePath(`${to}/${fileName}`);
              await app.vault.adapter.rename(file, toPath);
            }
          }
        };

        try {
          await app.vault.adapter.append(indexPath, INDEX_MIGRATION_NOTICE);
        } catch (error) {
          console.warn(
            `[Longform Extended] Error appending deprecation notice to old index file`,
            error
          );
        }

        if (drafts.length === 1) {
          const oldDraft = drafts[0];
          const vaultPath = normalizePath(`${projectPath}/${title}.md`);
          const draft: MultipleSceneDraft = {
            format: "scenes",
            title,
            titleInFrontmatter: false,
            draftTitle: null,
            vaultPath,
            workflow,
            sceneFolder: "/",
            scenes: oldDraft.scenes.map((s) => ({
              title: s,
              indent: 0,
            })),
            sceneDisplayName: DEFAULT_SCENE_DISPLAY_NAME,
            plotsDisplayName: DEFAULT_PLOTS_DISPLAY_NAME,
            charactersDisplayName: DEFAULT_CHARACTERS_DISPLAY_NAME,
            noteGroups: [],
            ignoredFiles: [project.indexFile],
            unknownFiles: [],
            sceneTemplate: null,
            plotTemplate: null,
            characterTemplate: null,
            plots: [],
            characters: [],
            timeframeTagName: DEFAULT_TIMEFRAME_TAG_NAME,
            timeFormat: DEFAULT_TIME_FORMAT,
            kanbanColumns: DEFAULT_KANBAN_COLUMNS,
            kanbanShowUnassigned: false,
            kanbanSaveWordCounts: true,
            kanbanEnabled: true,
            kanbanIncludePlots: DEFAULT_KANBAN_INCLUDE_PLOTS,
            kanbanOutputPath: DEFAULT_KANBAN_OUTPUT_PATH,
            timelineEnabled: true,
            timelineOutputPath: DEFAULT_TIMELINE_OUTPUT_PATH,
            plotGridEnabled: DEFAULT_PLOT_GRID_ENABLED,
            plotGridOutputPath: DEFAULT_PLOT_GRID_OUTPUT_PATH,
            plotGridPlotsDir: DEFAULT_PLOT_GRID_PLOTS_DIR,
            plotGridCharactersDir: DEFAULT_PLOT_GRID_CHARACTERS_DIR,
          };

          await insertDraftIntoFrontmatter(app, vaultPath, draft);
          await moveScenes(
            normalizePath(
              `${projectPath}/${project.draftsPath}/${oldDraft.folder}/`
            ),
            normalizedProjectPath
          );
        } else {
          for (const oldDraft of drafts) {
            const vaultPathParent = normalizePath(
              `${projectPath}/${oldDraft.name}/`
            );
            try {
              await app.vault.createFolder(vaultPathParent);
            } catch (error) {
              console.warn(
                `[Longform Extended] Error creating folder during migration`,
                error
              );
            }
            const vaultPath = normalizePath(
              `${vaultPathParent}/${oldDraft.name}.md`
            );
            const draft: MultipleSceneDraft = {
              format: "scenes",
              title,
              titleInFrontmatter: true,
              draftTitle: oldDraft.name,
              vaultPath,
              workflow,
              sceneFolder: "/",
              scenes: oldDraft.scenes.map((s) => ({
                title: s,
                indent: 0,
              })),
              sceneDisplayName: DEFAULT_SCENE_DISPLAY_NAME,
              plotsDisplayName: DEFAULT_PLOTS_DISPLAY_NAME,
              charactersDisplayName: DEFAULT_CHARACTERS_DISPLAY_NAME,
              noteGroups: [],
              ignoredFiles: [],
              unknownFiles: [],
              sceneTemplate: null,
              plotTemplate: null,
              characterTemplate: null,
              plots: [],
              characters: [],
              timeframeTagName: DEFAULT_TIMEFRAME_TAG_NAME,
              timeFormat: DEFAULT_TIME_FORMAT,
              kanbanColumns: DEFAULT_KANBAN_COLUMNS,
              kanbanShowUnassigned: false,
              kanbanSaveWordCounts: true,
              kanbanEnabled: true,
              kanbanIncludePlots: DEFAULT_KANBAN_INCLUDE_PLOTS,
              kanbanOutputPath: DEFAULT_KANBAN_OUTPUT_PATH,
              timelineEnabled: true,
              timelineOutputPath: DEFAULT_TIMELINE_OUTPUT_PATH,
              plotGridEnabled: DEFAULT_PLOT_GRID_ENABLED,
              plotGridOutputPath: DEFAULT_PLOT_GRID_OUTPUT_PATH,
              plotGridPlotsDir: DEFAULT_PLOT_GRID_PLOTS_DIR,
              plotGridCharactersDir: DEFAULT_PLOT_GRID_CHARACTERS_DIR,
            };

            await insertDraftIntoFrontmatter(app, vaultPath, draft);
            await moveScenes(
              normalizePath(
                `${projectPath}/${project.draftsPath}/${oldDraft.folder}/`
              ),
              vaultPathParent
            );
          }
        }
      }
    }

    currentVersion = currentVersion + 1;
  }

  pluginSettings.update((settings) => {
    settings.version = currentVersion;
    settings.projects = {};
    return settings;
  });
  needsMigration.set(false);
}
