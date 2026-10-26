import { normalizePath, type App } from "obsidian";
import { get } from "svelte/store";

import { projectFolderPath } from "./scene-navigation";
import { workflows } from "./stores";
import type { MultipleSceneDraft } from "./types";

const DEFAULT_TARGET = "manuscript.md";

/** The compiled manuscript path, with an extension. */
export function compiledPath(app: App, draft: MultipleSceneDraft): string {
  const workflow = draft.workflow ? get(workflows)[draft.workflow] : undefined;
  const step = workflow?.steps.find(
    (candidate) => candidate.description.canonicalID === "write-to-note"
  );
  const configured = step?.optionValues?.["target"];
  const target =
    typeof configured === "string" && configured.trim().length > 0
      ? configured.trim()
      : DEFAULT_TARGET;
  const rawTarget = target.replace("$1", draft.title);
  const withExtension = /\.\w+$/.test(rawTarget)
    ? rawTarget
    : `${rawTarget}.md`;
  return withExtension.startsWith("/")
    ? normalizePath(withExtension.slice(1))
    : normalizePath(`${projectFolderPath(draft, app.vault)}/${withExtension}`);
}

/** The compiled manuscript path with `_suffix` before the extension. */
export function generatedNotePath(
  app: App,
  draft: MultipleSceneDraft,
  suffix: string
): string {
  return compiledPath(app, draft).replace(/(\.[^./]+)$/, `_${suffix}$1`);
}

/**
 * Resolves a generated file's configured output path.
 *
 * `configured` is used when non-empty, otherwise `defaultPath`. `$1` is
 * replaced with the project title. A path starting with `/` is vault-relative;
 * anything else is relative to the project folder. The result is normalized
 * and gets `extension` appended when it does not already end with it.
 */
export function configuredOutputPath(
  app: App,
  draft: MultipleSceneDraft,
  configured: string | null | undefined,
  defaultPath: string,
  extension: string
): string {
  const value =
    typeof configured === "string" && configured.trim().length > 0
      ? configured.trim()
      : defaultPath;
  const rawPath = value.replace(/\$1/g, draft.title);
  const withExtension = rawPath
    .toLowerCase()
    .endsWith(extension.toLowerCase())
    ? rawPath
    : `${rawPath}${extension}`;
  return withExtension.startsWith("/")
    ? normalizePath(withExtension.slice(1))
    : normalizePath(`${projectFolderPath(draft, app.vault)}/${withExtension}`);
}

/** Writes a generated note, creating its folder and skipping unchanged content. */
export async function writeGeneratedNote(
  app: App,
  path: string,
  contents: string
): Promise<void> {
  if (
    (await app.vault.adapter.exists(path)) &&
    (await app.vault.adapter.read(path)) === contents
  ) {
    return;
  }

  const folder = path.split("/").slice(0, -1).join("/");
  if (folder && !(await app.vault.adapter.exists(folder))) {
    await app.vault.createFolder(folder).catch(() => undefined);
  }

  await app.vault.adapter.write(path, contents);
}

/** A scene note as a wikilink, optionally escaping the alias separator. */
export function sceneWikilink(
  path: string,
  title: string,
  escapePipe = false
): string {
  const notePath = path.replace(/\.md$/i, "");
  const alias = title.replace(/\|/g, "\\|");
  return `[[${notePath}${escapePipe ? "\\|" : "|"}${alias}]]`;
}
