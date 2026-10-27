import {
  BasesView,
  BooleanValue,
  ListValue,
  Notice,
  NullValue,
  NumberValue,
  ObjectValue,
  type App,
  type BasesEntry,
  type BasesPropertyId,
  type BasesViewConfig,
  type QueryController,
  type TFile,
  type Value,
} from "obsidian";

import { get } from "svelte/store";

import { noteGroupSingularName } from "../../model/note-groups";
import {
  comparePlotGridRows,
  PLOT_GRID_ALL_LEVEL_VALUE,
  PLOT_GRID_VIEW_TYPE,
  plotGridDefaultLevelValue,
  plotGridDirectories,
  plotGridRowLabel,
  plotGridRowLabelPrefix,
  plotGridRowProperty,
  type PlotGridRowProperty,
} from "../../model/plot-grid";
import { drafts } from "../../model/stores";
import { singularDisplayName, type MultipleSceneDraft } from "../../model/types";

const NOTE_PREFIX = "note.";
const ALL_LEVEL_LABEL = "All";

type CellKind = "text" | "number" | "boolean";

/** One `levels` entry from the generated Base view config. */
type PlotGridViewLevel = {
  label: string;
  value: string;
  /** Ordered row properties; the view renders exactly this list. */
  properties: PlotGridRowProperty[];
};

/**
 * Reads the generated view's `levels` config. Malformed entries are ignored so
 * a hand-edited Base still renders. Property order is preserved: the YAML
 * lists levels top-down and each level's properties in scene document order.
 */
function plotGridViewLevels(config: BasesViewConfig): PlotGridViewLevel[] {
  let raw: unknown;
  try {
    raw = config.get("levels");
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) {
    return [];
  }

  const levels: PlotGridViewLevel[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label.trim() : "";
    const rawValue = record.value;
    const value =
      typeof rawValue === "string"
        ? rawValue.trim()
        : typeof rawValue === "number" && Number.isFinite(rawValue)
        ? String(rawValue)
        : "";
    if (label.length === 0 || value.length === 0) {
      continue;
    }

    const rawProperties = Array.isArray(record.properties)
      ? record.properties
      : [];
    const seen = new Set<string>();
    const properties: PlotGridRowProperty[] = [];
    for (const propertyId of rawProperties) {
      if (typeof propertyId !== "string") {
        continue;
      }
      const property = plotGridRowProperty(propertyId);
      if (property === null || seen.has(property.rawKey)) {
        continue;
      }
      seen.add(property.rawKey);
      properties.push(property);
    }

    levels.push({ label, value, properties });
  }

  return levels;
}

/**
 * The transposed plot grid: rows are the `note.plotgrid_*` properties from the
 * view order, columns are the notes returned by the Base query. Cells that
 * belong to the plot-grid namespace are edited in place and written to the
 * note's frontmatter.
 */
export class PlotGridView extends BasesView {
  readonly type = PLOT_GRID_VIEW_TYPE;
  private readonly containerEl: HTMLElement;
  /**
   * Set while an editor is open. `onDataUpdated` fires after every write; the
   * guard keeps it from replacing the DOM (and destroying focus) mid-edit.
   */
  private editing = false;
  /**
   * The level filter chosen in the dropdown. Kept on the view because
   * `onDataUpdated` and cell writes both recreate the DOM. `null` means the
   * user has not chosen yet, so the first render selects level 0 (falling back
   * to the first level, then `All`).
   */
  private selectedLevel: string | null = null;

  constructor(controller: QueryController, containerEl: HTMLElement, app: App) {
    super(controller);
    this.containerEl = containerEl;
    this.app = app;
  }

  onDataUpdated(): void {
    if (this.editing) {
      return;
    }
    this.render();
  }

  private render(): void {
    const root = this.containerEl;
    root.empty();
    root.addClass("longform-plotgrid-view");

    const entries = this.orderedEntries(this.data?.data ?? []);
    if (entries.length === 0) {
      root.createDiv({
        cls: "longform-plotgrid-empty",
        text: "No subplot or character notes matched this Base.",
      });
      return;
    }

    // Rows are the plot-grid properties from the view order. Obsidian may
    // rewrite `note.plotgrid_*` entries as bare `plotgrid_*` IDs, so both
    // forms are accepted. file.* and formula.* entries are rejected.
    const orderProperties = (this.config?.getOrder() ?? [])
      .map((propertyId) => plotGridRowProperty(propertyId))
      .filter(
        (row): row is PlotGridRowProperty => row !== null
      );

    // The generated view's `levels` entries list each level's rows in scene
    // document order. `All` is always offered first; when an older Base has no
    // levels config, it falls back to the ordered view properties.
    const configuredLevels =
      this.config == null ? [] : plotGridViewLevels(this.config);
    const allLevel = configuredLevels.find(
      (level) => level.value === PLOT_GRID_ALL_LEVEL_VALUE
    );
    const levels: PlotGridViewLevel[] = [
      {
        label: ALL_LEVEL_LABEL,
        value: PLOT_GRID_ALL_LEVEL_VALUE,
        properties:
          allLevel != null && allLevel.properties.length > 0
            ? allLevel.properties
            : orderProperties,
      },
      ...configuredLevels.filter(
        (level) => level.value !== PLOT_GRID_ALL_LEVEL_VALUE
      ),
    ];
    const defaultLevel = plotGridDefaultLevelValue(levels);
    const wantedLevel = this.selectedLevel ?? defaultLevel;
    // If a regenerated Base drops the chosen level, fall back to level 0, then
    // the first populated level, then All; otherwise keep the user's choice.
    const selectedLevel =
      levels.find((level) => level.value === wantedLevel) ??
      levels.find((level) => level.value === defaultLevel) ??
      levels[0];
    this.selectedLevel = selectedLevel.value;
    const rowProperties = selectedLevel.properties;
    if (rowProperties.length === 0) {
      root.createDiv({
        cls: "longform-plotgrid-empty",
        text: "No subplot grid properties to show. Enable the subplot grid and regenerate the Base.",
      });
      return;
    }

    this.renderLevelSelect(root, levels, selectedLevel.value);

    // The two-line row headers use the project's display names. Resolve them
    // once per render and share them across every column.
    const rowLabels = this.rowLabelPrefixes();
    const table = root.createEl("table", {
      cls: "longform-plotgrid-table",
    });
    const headRow = table.createEl("thead").createEl("tr");
    headRow.createEl("th", {
      cls: "longform-plotgrid-corner",
      text: "Property",
    });
    for (const entry of entries) {
      const header = headRow.createEl("th", {
        cls: "longform-plotgrid-note-header",
      });
      this.renderNoteLink(header, entry.file, rowLabels);
    }

    const body = table.createEl("tbody");
    for (const rowProperty of rowProperties) {
      const row = body.createEl("tr");
      const header = row.createEl("th", {
        cls: "longform-plotgrid-row-header",
      });
      header.setText(this.rowLabel(rowProperty));
      header.setAttribute("title", rowProperty.rawKey);

      for (const entry of entries) {
        const cell = row.createEl("td", {
          cls: "longform-plotgrid-cell",
        });
        this.renderCell(cell, entry, rowProperty);
      }
    }
  }

  /**
   * Renders the level dropdown above the table. `All` is first, followed by
   * the generated levels. Changing it filters the rows client-side; the
   * selection lives on the view so data updates keep it.
   */
  private renderLevelSelect(
    root: HTMLElement,
    levels: PlotGridViewLevel[],
    selected: string
  ): void {
    const controls = root.createDiv({
      cls: "longform-plotgrid-controls",
    });
    controls.createEl("label", {
      cls: "longform-plotgrid-level-label",
      text: "Level",
    });
    const select = controls.createEl("select", {
      cls: "longform-plotgrid-level-select",
    });
    for (const level of levels) {
      select.createEl("option", {
        value: level.value,
        text: level.label,
      });
    }
    select.value = selected;
    select.addEventListener("change", () => {
      this.selectedLevel = select.value;
      this.render();
    });
  }

  /**
   * Notes become columns: the Main plot first, then the other plots, then
   * characters, alphabetically within each group. The Base's own sort is
   * ignored because `file.name` alone would place `Characters/` before
   * `Plots/`.
   */
  private orderedEntries(entries: BasesEntry[]): BasesEntry[] {
    const plots = this.configString("plotsDir");
    const characters = this.configString("charactersDir");
    return entries.slice().sort((left, right) =>
      comparePlotGridRows(
        plots,
        characters,
        { path: left.file.path, name: left.file.basename },
        { path: right.file.path, name: right.file.basename }
      )
    );
  }

  /**
   * Renders the clickable note header. When the plot and character
   * directories differ the shared label helper prefixes the project's singular
   * display name, e.g. `(Subplot)`; that prefix gets its own line via a
   * `<br>`.
   */
  private renderNoteLink(
    container: HTMLElement,
    file: TFile,
    rowLabels: { plots?: string; characters?: string }
  ): void {
    const link = container.createEl("a", {
      cls: "internal-link longform-plotgrid-note-link",
    });
    link.setAttribute("href", file.path);
    link.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.app.workspace.openLinkText(file.path, "/", false);
    });

    const label = plotGridRowLabel(
      this.configString("plotsDir"),
      this.configString("charactersDir"),
      file.path,
      file.basename,
      rowLabels.plots,
      rowLabels.characters
    );
    const lineBreak = label.indexOf("\n");
    if (lineBreak >= 0) {
      link.appendText(label.slice(0, lineBreak));
      link.createEl("br");
      link.appendText(label.slice(lineBreak + 1));
    } else {
      link.setText(label);
    }
  }

  private renderCell(
    cell: HTMLElement,
    entry: BasesEntry,
    rowProperty: PlotGridRowProperty
  ): void {
    // Row properties are parsed by `plotGridRowProperty`, which only accepts
    // keys in the plot-grid namespace, so every cell here is writable.
    const value = this.readValue(entry, rowProperty.id);

    // Lists and objects are not scalar cells; keep them readable but do not
    // offer an editor so a click cannot replace structured data with text.
    if (value instanceof ListValue || value instanceof ObjectValue) {
      cell.addClass("longform-plotgrid-cell-readonly");
      cell.setText(value.toString());
      cell.setAttribute(
        "title",
        "Lists and objects are read-only in the subplot grid."
      );
      return;
    }

    const kind = cellKind(value);
    cell.setText(displayValue(value));
    cell.addClass("longform-plotgrid-cell-editable");
    if (kind === "boolean") {
      cell.setAttribute("title", "Click to edit");
    }
    cell.addEventListener("click", (event) => {
      if (this.editing || event.target !== cell) {
        return;
      }
      this.beginEdit(cell, entry.file, rowProperty.rawKey, value, kind);
    });
  }

  /**
   * Reads a row value with the ID as returned by `getOrder()`. A bare
   * `plotgrid_*` ID is not a canonical Bases property ID, so if it does not
   * resolve it is retried in its `note.*` form.
   */
  private readValue(entry: BasesEntry, propertyId: string): Value | null {
    if (propertyId.startsWith(NOTE_PREFIX)) {
      return this.safeGetValue(entry, propertyId);
    }
    const direct = this.safeGetValue(entry, propertyId);
    if (direct != null && !(direct instanceof NullValue)) {
      return direct;
    }
    return this.safeGetValue(entry, `${NOTE_PREFIX}${propertyId}`);
  }

  private safeGetValue(entry: BasesEntry, propertyId: string): Value | null {
    try {
      return entry.getValue(propertyId as BasesPropertyId);
    } catch {
      return null;
    }
  }

  private beginEdit(
    cell: HTMLElement,
    file: TFile,
    rawKey: string,
    value: Value | null,
    kind: CellKind
  ): void {
    this.editing = true;
    cell.empty();
    cell.addClass("longform-plotgrid-cell-editing");

    const input = cell.createEl("input", {
      cls: "longform-plotgrid-input",
    });
    if (kind === "boolean") {
      input.type = "checkbox";
      input.checked = value instanceof BooleanValue && value.isTruthy();
    } else {
      input.type = kind === "number" ? "number" : "text";
      input.step = "any";
      input.value = displayValue(value);
    }

    let finished = false;
    const read = (): unknown => {
      if (kind === "boolean") {
        return input.checked;
      }
      if (kind === "number") {
        const raw = input.value;
        if (raw.trim() === "") {
          return "";
        }
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : raw;
      }
      return input.value;
    };

    const finish = (commit: boolean): void => {
      if (finished) {
        return;
      }
      finished = true;
      const next = commit ? read() : undefined;
      const complete = async (): Promise<void> => {
        if (commit) {
          try {
            await this.app.fileManager.processFrontMatter(
              file,
              (frontmatter: Record<string, unknown>) => {
                frontmatter[rawKey] = next;
              }
            );
          } catch (error) {
            console.error(
              "[Longform Extended] Could not update the subplot grid cell.",
              error
            );
            new Notice("Could not update the subplot grid cell.");
          }
        }
        this.editing = false;
        // The write may have already triggered onDataUpdated, which was held
        // back by the editing guard. Rendering again picks up that data.
        this.render();
      };
      void complete();
    };

    input.addEventListener("blur", () => finish(true));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      } else if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      }
    });
    if (kind === "boolean") {
      input.addEventListener("change", () => finish(true));
    }

    input.focus();
    if (kind !== "boolean") {
      input.select();
    }
  }

  /**
   * The display name from the Base config, falling back to the raw key.
   * Obsidian may echo a bare ID instead of consulting the `properties`
   * section, which is keyed by `note.plotgrid_*`; in that case the canonical
   * note form is tried so the hierarchy titles survive normalization.
   */
  private rowLabel(row: PlotGridRowProperty): string {
    const direct = (
      this.config?.getDisplayName(row.id as BasesPropertyId) ?? ""
    ).trim();
    if (direct.length > 0 && direct !== row.id) {
      return direct;
    }
    if (!row.id.startsWith(NOTE_PREFIX)) {
      const noteName = (
        this.config?.getDisplayName(
          `${NOTE_PREFIX}${row.rawKey}` as BasesPropertyId
        ) ?? ""
      ).trim();
      if (noteName.length > 0) {
        return noteName;
      }
    }
    return direct.length > 0 ? direct : row.rawKey;
  }

  private configString(key: string): string {
    const value = this.config?.get(key);
    return typeof value === "string" ? value.trim() : "";
  }

  /**
   * The two-line row-label prefixes, e.g. `(Subplot)\n`. The Base config only
   * carries the resolved row folders, so the project draft is located by
   * matching those folders; its display names are the presentation source.
   * A hand-edited Base may instead carry an explicit label, and older Bases
   * fall back to the built-in prefixes in `plotGridRowLabel`.
   */
  private rowLabelPrefixes(): { plots?: string; characters?: string } {
    const draft = this.projectDraft();
    if (draft) {
      return {
        plots: plotGridRowLabelPrefix(
          noteGroupSingularName(draft, "plots")
        ),
        characters: plotGridRowLabelPrefix(
          noteGroupSingularName(draft, "characters")
        ),
      };
    }
    return {
      plots: this.configRowLabel("plots"),
      characters: this.configRowLabel("characters"),
    };
  }

  /** The loaded project whose resolved row folders match this Base's config. */
  private projectDraft(): MultipleSceneDraft | null {
    const plotsDir = this.configString("plotsDir");
    const charactersDir = this.configString("charactersDir");
    if (plotsDir.length === 0 || charactersDir.length === 0) {
      return null;
    }

    for (const draft of get(drafts)) {
      if (draft.format !== "scenes") {
        continue;
      }
      const directories = plotGridDirectories(this.app, draft);
      if (
        directories.plots === plotsDir &&
        directories.characters === charactersDir
      ) {
        return draft;
      }
    }
    return null;
  }

  /**
   * An explicit row-label prefix from a hand-edited Base. Accepts a full
   * prefix, a parenthesized name, or a plain display name.
   */
  private configRowLabel(
    kind: "plots" | "characters"
  ): string | undefined {
    const keys =
      kind === "plots"
        ? ["plotLabel", "plotsLabel", "plotsDisplayName"]
        : ["characterLabel", "charactersLabel", "charactersDisplayName"];
    for (const key of keys) {
      const value = this.configString(key);
      if (value.length === 0) {
        continue;
      }
      if (value.includes("\n")) {
        return value;
      }
      if (value.startsWith("(") && value.endsWith(")")) {
        return plotGridRowLabelPrefix(value.slice(1, -1));
      }
      return plotGridRowLabelPrefix(singularDisplayName(value));
    }
    return undefined;
  }
}

/** A Base value as display text; missing/null values are empty. */
function displayValue(value: Value | null): string {
  return value == null || value instanceof NullValue ? "" : value.toString();
}

/** The editor type for a scalar Base value. */
function cellKind(value: Value | null): CellKind {
  if (value instanceof BooleanValue) {
    return "boolean";
  }
  if (value instanceof NumberValue) {
    return "number";
  }
  return "text";
}
