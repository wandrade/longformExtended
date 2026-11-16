import { App, Notice, Platform, normalizePath } from "obsidian";
import type { CompileContext, CompileManuscriptInput } from "..";
import {
  CompileStepKind,
  CompileStepOptionType,
  makeBuiltinStep,
} from "./abstract-compile-step";
import { writeEpubFromMarkdown, type EpubImage } from "../export/epub";
import {
  convertOnDesktop,
  DESKTOP_EXPORT_DOCS_URL,
} from "../export/desktop";

export { markdownToXhtml, writeEpubFromMarkdown } from "../export/epub";

export type WriteToNoteOutputSelection = {
  markdown: boolean;
  docx: boolean;
  pdf: boolean;
  epub: boolean;
};

export type WriteToNoteOutputCapabilities = WriteToNoteOutputSelection;

export type WriteToNoteOutputCapabilityOptions = {
  isMobile?: boolean;
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
    docx: readBooleanOption(optionValues, "output-docx", false),
    pdf: readBooleanOption(optionValues, "output-pdf", false),
    epub: readBooleanOption(optionValues, "output-epub", false),
  };

  if (!selected.markdown && !selected.docx && !selected.pdf && !selected.epub) {
    selected.markdown = true;
  }

  return selected;
}

export function getWriteToNoteOutputCapabilities(
  options: WriteToNoteOutputCapabilityOptions = {}
): WriteToNoteOutputCapabilities {
  const isMobile =
    options.isMobile ?? Boolean(Platform.isMobile || Platform.isMobileApp);

  return {
    markdown: true,
    docx: !isMobile,
    pdf: !isMobile,
    epub: true,
  };
}

function isMobilePlatform(): boolean {
  return Boolean(Platform.isMobile || Platform.isMobileApp);
}

function outputPathForTarget(
  targetPath: string,
  extension: "md" | "docx" | "pdf" | "epub"
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

async function writeDerivedOutput(
  app: App,
  projectPath: string,
  kind: "docx" | "pdf" | "epub",
  filePath: string,
  contents: string,
  title: string
): Promise<boolean> {
  if (kind === "epub") {
    try {
      const images = await collectEpubImages(app, contents, projectPath);
      const data = writeEpubFromMarkdown(contents, { title, images });
      await writeBinaryToFile(app, filePath, data);
      return true;
    } catch (error) {
      new Notice(
        `EPUB export failed: ${
          error instanceof Error ? error.message : String(error)
        }. Check the Compile documentation for troubleshooting: ${DESKTOP_EXPORT_DOCS_URL}`
      );
      return false;
    }
  }

  const result = convertOnDesktop(app, projectPath, kind, contents);
  if (!result.ok) {
    const reason = "reason" in result ? result.reason : "Unknown converter error";
    new Notice(
      `${kind.toUpperCase()} export failed: ${reason} See ${DESKTOP_EXPORT_DOCS_URL}`
    );
    return false;
  }

  await writeBinaryToFile(app, filePath, result.data);
  return true;
}

export const WriteToNoteStep = makeBuiltinStep({
  id: "write-to-note",
  description: {
    name: "Save as Note",
    description: "Saves your manuscript as a note in your vault.",
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
        id: "output-docx",
        name: "DOCX",
        description:
          "Desktop only. Requires Pandoc. See the Compile documentation for installation instructions.",
        type: CompileStepOptionType.Boolean,
        default: false,
        desktopOnly: true,
        disabledReason:
          "Desktop only. See the Compile documentation to install Pandoc.",
      },
      {
        id: "output-pdf",
        name: "PDF",
        description:
          "Desktop only. Requires Pandoc and a LaTeX engine. See the Compile documentation for installation instructions.",
        type: CompileStepOptionType.Boolean,
        default: false,
        desktopOnly: true,
        disabledReason:
          "Desktop only. See the Compile documentation to install Pandoc and a LaTeX engine.",
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
        description: "If checked, open the compiled manuscript in a new pane.",
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
    const capabilities = getWriteToNoteOutputCapabilities({
      isMobile: isMobilePlatform(),
    });

    let firstGeneratedPath: string | null = null;

    if (outputSelection.markdown) {
      await writeToFile(context.app, filePath, input.contents);
      firstGeneratedPath = filePath;
    }

    if (outputSelection.docx) {
      if (!capabilities.docx) {
        new Notice(
          `DOCX export is desktop only. See ${DESKTOP_EXPORT_DOCS_URL}`
        );
      } else {
        const docxPath = outputPathForTarget(filePath, "docx");
        const ok = await writeDerivedOutput(
          context.app,
          context.projectPath,
          "docx",
          docxPath,
          input.contents,
          context.draft.title
        );
        if (ok && !firstGeneratedPath) {
          firstGeneratedPath = docxPath;
        }
      }
    }

    if (outputSelection.pdf) {
      if (!capabilities.pdf) {
        new Notice(
          `PDF export is desktop only. See ${DESKTOP_EXPORT_DOCS_URL}`
        );
      } else {
        const pdfPath = outputPathForTarget(filePath, "pdf");
        const ok = await writeDerivedOutput(
          context.app,
          context.projectPath,
          "pdf",
          pdfPath,
          input.contents,
          context.draft.title
        );
        if (ok && !firstGeneratedPath) {
          firstGeneratedPath = pdfPath;
        }
      }
    }

    if (outputSelection.epub) {
      const epubPath = outputPathForTarget(filePath, "epub");
      const ok = await writeDerivedOutput(
        context.app,
        context.projectPath,
        "epub",
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
      context.app.workspace
        .openLinkText(firstGeneratedPath, "/", true)
        .catch((err) => {
          console.error(
            "[Longform Extended] Could not open",
            firstGeneratedPath,
            err
          );
        });
    }

    return input;
  },
});

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
