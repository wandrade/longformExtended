/**
 * Data-format version for settings stored in data.json. Inherited from
 * upstream Longform (see FORKED_VERSION); this is a different axis from the
 * fork's own release version in manifest.json and must not be tied to it.
 */
export const LONGFORM_EXTENDED_CURRENT_PLUGIN_DATA_VERSION = 3;
/**
 * Data-format version for the project index stored on disk. Inherited from
 * upstream Longform (see FORKED_VERSION) and independent of Longform
 * Extended's own release version.
 */
export const LONGFORM_EXTENDED_CURRENT_INDEX_VERSION = 1;

/**
 * The upstream Longform release this fork was based on. Used as a reference
 * anchor so the fork's own versioning (see manifest.json) stays independent.
 */
export const FORKED_VERSION = "2.1.0";

export type TimeframeFormat =
  | "epoch-datetime-dmy"
  | "epoch-datetime-mdy"
  | "datetime"
  | "time"
  | "number";

export function isTimeframeFormat(value: unknown): value is TimeframeFormat {
  return (
    value === "epoch-datetime-dmy" ||
    value === "epoch-datetime-mdy" ||
    value === "datetime" ||
    value === "time" ||
    value === "number"
  );
}

export const DEFAULT_TIMEFRAME_TAG_NAME = "timeframe";
export const DEFAULT_TIME_FORMAT: TimeframeFormat = "datetime";
export const DEFAULT_TIMELINE_OUTPUT_PATH = "Build/$1_timeline.md";
export const DEFAULT_KANBAN_COLUMNS = "Planned Draft Reviewed";
export const DEFAULT_KANBAN_OUTPUT_PATH = "Build/$1_kanban.base";
export const DEFAULT_KANBAN_INCLUDE_PLOTS = true;
export const DEFAULT_PLOT_GRID_ENABLED = true;
export const DEFAULT_PLOT_GRID_OUTPUT_PATH = "Base/$1_plotgrid.base";
export const DEFAULT_PLOT_GRID_PLOTS_DIR = "Subplots";
export const DEFAULT_PLOT_GRID_CHARACTERS_DIR = "Characters";
export const KANBAN_STATUS_TAG = "status";
/**
 * Plugin-managed frontmatter property that the generated Bases board groups by
 * and that Bases writes when a card is dragged. It mirrors the real status,
 * collapsing unrecognized statuses so they do not each become a column.
 */
export const KANBAN_HELPER_TAG = "longformKanbanStatus";
export const KANBAN_INCORRECT_LABEL = "Incorrectly Assigned";
export const KANBAN_UNASSIGNED_LABEL = "Unassigned";

export type IndentedScene = {
  title: string;
  indent: number;
};

export type MultipleSceneDraft = {
  format: "scenes";
  title: string;
  titleInFrontmatter: boolean;
  draftTitle: string | null;
  vaultPath: string;
  workflow: string | null;
  sceneFolder: string;
  scenes: IndentedScene[];
  ignoredFiles: string[] | null;
  unknownFiles: string[];
  sceneTemplate: string | null;
  plotTemplate: string | null;
  characterTemplate: string | null;
  /**
   * Organizational order/indent overlay for the Plots and Characters tabs.
   * The configured folders are the membership source of truth; these lists
   * only record the order and nesting shown in the tree.
   */
  plots: IndentedScene[];
  characters: IndentedScene[];
  timeframeTagName: string;
  timeFormat: TimeframeFormat;
  kanbanColumns: string;
  kanbanShowUnassigned: boolean;
  kanbanSaveWordCounts: boolean;
  kanbanEnabled: boolean;
  /** Include notes from the configured Plot Folder on the kanban board. */
  kanbanIncludePlots: boolean;
  kanbanOutputPath: string;
  timelineEnabled: boolean;
  timelineOutputPath: string;
  plotGridEnabled: boolean;
  plotGridOutputPath: string;
  plotGridPlotsDir: string;
  plotGridCharactersDir: string;
};

export type SingleSceneDraft = {
  format: "single";
  title: string;
  titleInFrontmatter: boolean;
  draftTitle: string | null;
  vaultPath: string;
  workflow: string | null;
};

export type Draft = MultipleSceneDraft | SingleSceneDraft;

export type SerializedStep = {
  id: string;
  optionValues: { [id: string]: unknown };
};

export type SerializedWorkflow = {
  name: string;
  description: string;
  steps: SerializedStep[];
};

/**
 * Draft vault paths to either a map of scene names to word counts or,
 * in the case of single-scene drafts, the word count.
 */
export type DraftWordCounts = Record<string, Record<string, number> | number>;

export type WordCountSession = {
  /**
   * Start date for this session.
   */
  start: Date;

  /**
   * Total number of words written in this session.
   */
  total: number;

  /**
   * Stats in this session per draft.
   */
  drafts: Record<
    string,
    {
      /**
       * Total words written in this draft in this session.
       */
      total: number;

      /**
       * Stats in this session per scene.
       */
      scenes: Record<string, number>;
    }
  >;
};

export interface LongformExtendedPluginSettings {
  version: number;
  selectedDraftVaultPath: string | null;
  workflows: Record<string, SerializedWorkflow> | null;
  userScriptFolder: string | null;
  sessionStorage: "data" | "plugin-folder" | "file";
  sessions: WordCountSession[];
  showWordCountInStatusBar: boolean;
  startNewSessionEachDay: boolean;
  sessionGoal: number;
  applyGoalTo: "all" | "project" | "note";
  notifyOnGoal: boolean;
  countDeletionsForGoal: boolean;
  keepSessionCount: number;
  sessionFile: string;
  numberScenes: boolean;
  sceneTemplate: string | null;
  plotTemplate: string | null;
  characterTemplate: string | null;
  waitForSync: boolean;
  fallbackWaitEnabled: boolean;
  fallbackWaitTime: number;
  writeProperty: boolean;
  // DEPRECATED. To be removed in future, needed now for migrations.
  projects: {
    [path: string]: {
      indexFile: string;
      draftsPath: string;
    };
  };
}

export const DEFAULT_SESSION_FILE = "longform-sessions.json";

export const DEFAULT_SETTINGS: LongformExtendedPluginSettings = {
  version: LONGFORM_EXTENDED_CURRENT_PLUGIN_DATA_VERSION,
  selectedDraftVaultPath: null,
  workflows: null,
  userScriptFolder: null,
  sessionStorage: "data",
  sessions: [],
  showWordCountInStatusBar: true,
  startNewSessionEachDay: true,
  sessionGoal: 500,
  applyGoalTo: "all",
  notifyOnGoal: true,
  countDeletionsForGoal: false,
  keepSessionCount: 30,
  sessionFile: DEFAULT_SESSION_FILE,
  numberScenes: false,
  sceneTemplate: null,
  plotTemplate: null,
  characterTemplate: null,
  writeProperty: false,
  projects: {},
  waitForSync: false,
  fallbackWaitEnabled: true,
  fallbackWaitTime: 5,
};

export const TRACKED_SETTINGS_PATHS: (keyof LongformExtendedPluginSettings)[] = [
  "version",
  "projects",
  "selectedDraftVaultPath",
  "userScriptFolder",
  "sessionStorage",
  "sessions",
  "showWordCountInStatusBar",
  "startNewSessionEachDay",
  "sessionGoal",
  "applyGoalTo",
  "notifyOnGoal",
  "countDeletionsForGoal",
  "keepSessionCount",
  "sessionFile",
  "numberScenes",
  "sceneTemplate",
  "plotTemplate",
  "characterTemplate",
  "waitForSync",
  "fallbackWaitEnabled",
  "fallbackWaitTime",
  "writeProperty",
];

export const PASSTHROUGH_SAVE_SETTINGS_PATHS: (keyof LongformExtendedPluginSettings)[] =
  [
    "sessionStorage",
    "userScriptFolder",
    "showWordCountInStatusBar",
    "startNewSessionEachDay",
    "sessionGoal",
    "applyGoalTo",
    "notifyOnGoal",
    "countDeletionsForGoal",
    "keepSessionCount",
    "sessionFile",
    "numberScenes",
    "sceneTemplate",
    "plotTemplate",
    "characterTemplate",
    "waitForSync",
    "fallbackWaitEnabled",
    "fallbackWaitTime",
    "writeProperty",
  ];
