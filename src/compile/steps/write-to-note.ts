import { App, FileView, Notice, normalizePath, type WorkspaceLeaf } from "obsidian";
import type { CompileContext, CompileManuscriptInput } from "..";
import {
  CompileStepKind,
  CompileStepOptionType,
  makeBuiltinStep,
} from "./abstract-compile-step";
import { writeEpubFromMarkdown, type EpubImage } from "../export/epub";
import { collectEpubStyle } from "../export/epub-style";


const EXPORT_DOCS_URL =
  "https://github.com/wandrade/longformExtended/blob/main/docs/COMPILE.md#save-as-note";

type WriteToNoteOutputSelection = {
  markdown: boolean;
  epub: boolean;
};


function readBooleanOption(
  optionValues: Record<string, unknown>,
  key: string,
  fallback: boolean
): boolean {
  const value = optionValues[key];
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }
  return fallback;
}

export function resolveWriteToNoteOutputSelection(
  optionValues: Record<string, unknown>
): WriteToNoteOutputSelection {
  const selected: WriteToNoteOutputSelection = {
    markdown: readBooleanOption(optionValues, "output-markdown", true),
    epub: readBooleanOption(optionValues, "output-epub", false),
  };

  if (!selected.markdown && !selected.epub) {
    selected.markdown = true;
  }

  return selected;
}

function outputPathForTarget(
  targetPath: string,
  extension: "md" | "epub"
): string {
  const withoutExtension = targetPath.replace(/\.[^./]+$/i, "");
  return `${withoutExtension}.${extension}`;
}

function writeBinaryToFile(
  app: App,
  filePath: string,
  contents: Uint8Array
): Promise<void> {
  const adapter = app.vault.adapter as typeof app.vault.adapter & {
    writeBinary?: (path: string, data: Uint8Array) => Promise<void>;
  };

  if (typeof adapter.writeBinary === "function") {
    return adapter.writeBinary(filePath, contents);
  }

  return app.vault.adapter.write(filePath, new TextDecoder().decode(contents));
}

function imageMime(path: string): string | null {
  const extension = path.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "webp":
      return "image/webp";
    default:
      return null;
  }
}

function imageSources(markdown: string): string[] {
  const sources: string[] = [];
  const pattern = /!\[\[([^\]]+)\]\]|!\[[^\]]*\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    const raw = (match[1] ?? match[2] ?? "").trim();
    const source = raw.split("|")[0].split("#")[0].trim();
    if (source) {
      sources.push(source);
    }
  }
  return sources;
}

async function collectEpubImages(
  app: App,
  markdown: string,
  projectPath: string
): Promise<Map<string, EpubImage>> {
  const images = new Map<string, EpubImage>();
  const adapter = app.vault.adapter as typeof app.vault.adapter & {
    readBinary?: (path: string) => Promise<ArrayBuffer>;
  };
  if (typeof adapter.readBinary !== "function") {
    return images;
  }

  const usedNames = new Map<string, number>();
  for (const source of imageSources(markdown)) {
    if (images.has(source)) {
      continue;
    }

    const vaultPath = normalizePath(
      source.startsWith("/") ? source.slice(1) : `${projectPath}/${source}`
    );
    const mediaType = imageMime(vaultPath);
    if (!mediaType) {
      continue;
    }

    try {
      const data = await adapter.readBinary(vaultPath);
      const basename = vaultPath.split("/").pop() ?? "image";
      const count = usedNames.get(basename) ?? 0;
      usedNames.set(basename, count + 1);
      const href =
        count === 0
          ? `images/${basename}`
          : `images/${basename.replace(/(\.[^.]+)$/, `-${count}$1`)}`;
      const image: EpubImage = {
        href,
        data: new Uint8Array(data),
        mediaType,
      };
      images.set(source, image);
      images.set(vaultPath, image);
    } catch (error) {
      console.error(
        `[Longform Extended] Could not embed image ${vaultPath}:`,
        error
      );
    }
  }

  return images;
}

async function writeEpub(
  app: App,
  projectPath: string,
  filePath: string,
  contents: string,
  title: string
): Promise<boolean> {
  try {
    const images = await collectEpubImages(app, contents, projectPath);
    const { style, fonts } = await collectEpubStyle(app, contents, projectPath);
    const data = writeEpubFromMarkdown(contents, {
      title,
      images,
      style,
      fonts,
    });
    await writeBinaryToFile(app, filePath, data);
    new Notice(`EPUB written to ${filePath}`);
    return true;
  } catch (error) {
    new Notice(
      `EPUB export failed: ${
        error instanceof Error ? error.message : String(error)
      }. See ${EXPORT_DOCS_URL}`
    );
    return false;
  }
}

export const WriteToNoteStep = makeBuiltinStep({
  id: "write-to-note",
  description: {
    name: "Save as Note",
    description: "Saves your manuscript as Markdown and/or EPUB.",
    availableKinds: [CompileStepKind.Manuscript],
    options: [
      {
        id: "target",
        name: "Output path",
        description:
          "Path for the created manuscript note. Paths starting with '/' are relative to your vault root; otherwise relative to your project. $1 will be replaced with your project's title.",
        type: CompileStepOptionType.Text,
        default: "manuscript.md",
      },
      {
        id: "output-markdown",
        name: "Markdown",
        description: "Save the compiled manuscript as Markdown.",
        type: CompileStepOptionType.Boolean,
        default: true,
      },
      {
        id: "output-epub",
        name: "EPUB",
        description:
          "Save an EPUB export beside the Markdown manuscript. Works offline on desktop and mobile.",
        type: CompileStepOptionType.Boolean,
        default: false,
      },
      {
        id: "open-after",
        name: "Open Compiled Manuscript",
        description:
          "If checked, open the first generated output, focusing an existing tab when it is already open.",
        type: CompileStepOptionType.Boolean,
        default: true,
      },
    ],
  },
  async compile(
    input: CompileManuscriptInput,
    context: CompileContext
  ): Promise<CompileManuscriptInput> {
    if (context.kind !== CompileStepKind.Manuscript) {
      throw new Error("Cannot write non-manuscript as note.");
    }

    let target =
      (context.optionValues["target"] as string | undefined) ?? "manuscript.md";
    target = target.replace("$1", context.draft.title);

    const openAfter = context.optionValues["open-after"] as boolean;
    if (!target || target.length == 0) {
      throw new Error("Invalid path for Save as Note.");
    }

    const filePath = resolvePath(context.projectPath, target);
    const outputSelection = resolveWriteToNoteOutputSelection(
      context.optionValues
    );

    let firstGeneratedPath: string | null = null;

    if (outputSelection.markdown) {
      await writeToFile(context.app, filePath, input.contents);
      firstGeneratedPath = filePath;
    }

    if (outputSelection.epub) {
      const epubPath = outputPathForTarget(filePath, "epub");
      const ok = await writeEpub(
        context.app,
        context.projectPath,
        epubPath,
        input.contents,
        context.draft.title
      );
      if (ok && !firstGeneratedPath) {
        firstGeneratedPath = epubPath;
      }
    }

    if (
      openAfter &&
      context.openOutput !== false &&
      firstGeneratedPath !== null
    ) {
      await openGeneratedOutput(context.app, firstGeneratedPath).catch(
        (err) => {
          console.error(
            "[Longform Extended] Could not open",
            firstGeneratedPath,
            err
          );
        }
      );
    }

    return input;
  },
});

function leafFilePath(leaf: WorkspaceLeaf): string | null {
  if (leaf.view instanceof FileView) {
    return leaf.view.file?.path ?? null;
  }
  // Background tabs can be deferred; their file is still in the saved state.
  const stateFile = leaf.getViewState().state?.file;
  return typeof stateFile === "string" ? stateFile : null;
}

function findOpenMarkdownLeaf(
  app: App,
  filePath: string
): WorkspaceLeaf | null {
  const matching = app.workspace
    .getLeavesOfType("markdown")
    .filter((leaf) => leafFilePath(leaf) === filePath);

  return (
    matching.find((leaf) => leaf === app.workspace.getMostRecentLeaf()) ??
    matching[0] ??
    null
  );
}

async function openGeneratedOutput(
  app: App,
  filePath: string
): Promise<void> {
  const existing = findOpenMarkdownLeaf(app, filePath);
  if (existing) {
    app.workspace.setActiveLeaf(existing, { focus: true });
    await app.workspace.revealLeaf(existing);
    return;
  }

  await app.workspace.openLinkText(filePath, "/", true);
}

async function writeToFile(
  app: App,
  filePath: string,
  contents: string
): Promise<void> {
  await ensureContainingFolderExists(app, filePath);

  await app.vault.adapter.write(filePath, contents);
}

async function ensureContainingFolderExists(
  app: App,
  filePath: string
): Promise<void> {
  const containingFolderParts = filePath.split("/");
  const containingFolderPath = containingFolderParts.slice(0, -1).join("/");

  try {
    await app.vault.createFolder(containingFolderPath);
  } catch {
    // do nothing, folder already existed
  }
}

function resolvePath(projectPath: string, filePath: string): string {
  const filename = filePath.split("/").last();
  if (!filename.contains(".")) {
    filePath = filePath + ".md";
  }

  if (!filePath.startsWith(".")) {
    if (filePath.startsWith("/")) {
      return normalizePath(filePath.substring(1));
    }
    return normalizePath(`${projectPath}/${filePath}`);
  }

  return resolveRelativeFilePath(
    projectPath.split("/"),
    filePath.split("/"),
    true
  );
}

function resolveRelativeFilePath(
  projectPathComponents: string[],
  filePathComponents: string[],
  atStartOfFilePath: boolean
): string {
  const filePathComponent = filePathComponents.first();
  switch (filePathComponent) {
    case "..": {
      if (projectPathComponents.length === 0) {
        throw new Error("[Longform Extended] Invalid path for Save as Note.");
      }
      return resolveRelativeFilePath(
        projectPathComponents.slice(0, -1),
        filePathComponents.slice(1),
        false
      );
    }
    case ".": {
      if (!atStartOfFilePath) {
        throw new Error("[Longform Extended] Invalid path for Save as Note.");
      }
      return resolveRelativeFilePath(
        projectPathComponents,
        filePathComponents.slice(1),
        false
      );
    }
    default: {
      const filename = filePathComponents.last();
      if (filename.startsWith(".")) {
        new Notice(
          "Obsidian cannot open files that begin with a dot. Consider a different name."
        );
      }
      return normalizePath(
        projectPathComponents.concat(filePathComponents).join("/")
      );
    }
  }
}
