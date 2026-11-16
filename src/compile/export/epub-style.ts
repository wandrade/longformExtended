import type { App } from "obsidian";

import type { EpubFont, EpubStyle } from "./epub";

const DEFAULT_STYLE: EpubStyle = {
  bodyFont: "Georgia",
  epigraphFont: "Georgia",
  epigraphSize: "1.5em",
};

function firstFontFamily(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const quoted = value.match(/"([^"]+)"/);
  if (quoted) {
    return quoted[1];
  }
  const first = value.split(",")[0]?.trim();
  return first || null;
}

function cssVariable(body: string, name: string): string | null {
  const match = body.match(
    new RegExp(`--${name}\\s*:\\s*([^;]+);`, "i")
  );
  return match ? match[1].trim() : null;
}

function cssFontSize(body: string): string | null {
  const match = body.match(/font-size\s*:\s*([^;]+);/i);
  return match ? match[1].trim() : null;
}

function classFromManuscript(markdown: string): string | null {
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) {
    return null;
  }
  const inline = frontmatter[1].match(/cssclasses:\s*\[([^\]]*)\]/i);
  if (inline) {
    return inline[1].split(",")[0]?.trim().replace(/^["']|["']$/g, "") || null;
  }
  const block = frontmatter[1].match(
    /cssclasses:\s*\n\s*-\s*([^\n]+)/i
  );
  return block ? block[1].trim().replace(/^["']|["']$/g, "") : null;
}

function parseEpubStyle(css: string, className: string | null): EpubStyle {
  const style: EpubStyle = { ...DEFAULT_STYLE };

  const blocks = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = blocks.exec(css)) !== null) {
    const selector = match[1].trim();
    const body = match[2];
    const isProjectClass =
      className !== null &&
      new RegExp(`\\.${className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$|,)`).test(
        selector
      );

    if (isProjectClass) {
      const bodyFont = firstFontFamily(cssVariable(body, "font-body"));
      const epigraphFont = firstFontFamily(cssVariable(body, "font-epigraph"));
      const paragraphIndent = cssVariable(body, "paragraph-indent");
      const paragraphSpace = cssVariable(body, "paragraph-space");
      const sceneSpace = cssVariable(body, "scene-space");
      if (bodyFont) style.bodyFont = bodyFont;
      if (epigraphFont) style.epigraphFont = epigraphFont;
      if (paragraphIndent) style.paragraphIndent = paragraphIndent;
      if (paragraphSpace) style.paragraphSpace = paragraphSpace;
      if (sceneSpace) style.sceneSpace = sceneSpace;
    }

    if (selector.includes(".HyperMD-quote-2")) {
      const size = cssFontSize(body);
      if (size) style.epigraphSize = size;
    }
  }

  return style;
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function familyFromFilename(filename: string): string {
  const base = filename.replace(/\.(ttf|otf)$/i, "");
  const withoutStyle = base.replace(
    /[-_](regular|bold|italic|bolditalic|variable)$/i,
    ""
  );
  const normalizedBase = normalized(withoutStyle);
  const known: Array<[string, string]> = [
    ["texgyrepagella", "TeX Gyre Pagella"],
    ["texgyreadventor", "TeX Gyre Adventor"],
    ["texgyrebonum", "TeX Gyre Bonum"],
    ["texgyrepagella", "TeX Gyre Pagella"],
    ["runionneo", "Runion Neo"],
    ["lavishlyyours", "Lavishly Yours"],
    ["almendra", "Almendra"],
    ["fondamento", "Fondamento"],
  ];
  for (const [key, family] of known) {
    if (normalizedBase.startsWith(key)) {
      return family;
    }
  }
  return withoutStyle
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim();
}

function styleFromFilename(filename: string): {
  style: "normal" | "italic";
  weight: "normal" | "bold";
} {
  const lower = filename.toLowerCase();
  return {
    style: lower.includes("italic") || lower.includes("oblique")
      ? "italic"
      : "normal",
    weight:
      lower.includes("bold") || lower.includes("black") ? "bold" : "normal",
  };
}

async function collectFonts(
  app: App,
  projectPath: string,
  style: EpubStyle
): Promise<EpubFont[]> {
  const adapter = app.vault.adapter as typeof app.vault.adapter & {
    readBinary?: (path: string) => Promise<ArrayBuffer>;
  };
  if (typeof adapter.readBinary !== "function") {
    return [];
  }

  const wanted = new Set(
    [style.bodyFont, style.epigraphFont]
      .filter((family): family is string => Boolean(family))
      .map(normalized)
  );
  const roots = [`${projectPath}/fonts/`, "fonts/"];
  const fonts: EpubFont[] = [];

  for (const file of app.vault.getFiles()) {
    if (!/\.(ttf|otf)$/i.test(file.path)) {
      continue;
    }
    if (!roots.some((root) => file.path.startsWith(root))) {
      continue;
    }

    const family = familyFromFilename(file.name);
    if (!wanted.has(normalized(family))) {
      continue;
    }

    try {
      const data = await adapter.readBinary(file.path);
      const ext = file.extension.toLowerCase();
      fonts.push({
        href: `fonts/${file.name}`,
        data: new Uint8Array(data),
        family,
        ...styleFromFilename(file.name),
        mediaType: ext === "otf" ? "font/otf" : "font/ttf",
        format: ext === "otf" ? "opentype" : "truetype",
      });
    } catch (error) {
      console.error(
        `[Longform Extended] Could not embed font ${file.path}:`,
        error
      );
    }
  }

  return fonts;
}

export async function collectEpubStyle(
  app: App,
  markdown: string,
  projectPath: string
): Promise<{ style: EpubStyle; fonts: EpubFont[] }> {
  let css = "";
  const cssPath = `${app.vault.configDir}/snippets/texts-fonts.css`;
  try {
    css = await app.vault.adapter.read(cssPath);
  } catch {
    // No shared font snippet: use readable defaults.
  }

  const style = parseEpubStyle(css, classFromManuscript(markdown));
  const fonts = await collectFonts(app, projectPath, style);
  return { style, fonts };
}
