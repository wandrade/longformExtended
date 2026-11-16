/**
 * Minimal, dependency-free EPUB 3 writer used on both desktop and mobile.
 *
 * It deliberately handles the Markdown constructs a compiled manuscript uses
 * (headings, paragraphs, blockquotes, lists, code, links, images, emphasis and
 * raw drop-cap spans) instead of passing HTML through a filesystem exporter.
 */

export type EpubImage = {
  /** Path inside the EPUB, relative to OEBPS. */
  href: string;
  data: Uint8Array;
  mediaType: string;
};

export type EpubBuildOptions = {
  title?: string;
  language?: string;
  images?: Map<string, EpubImage>;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  const table = new Uint32Array(256);

  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }

  for (const byte of bytes) {
    crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createZipArchive(
  entries: Array<{ path: string; data: Uint8Array }>
): Uint8Array {
  const encoder = new TextEncoder();
  const localHeaders: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const data = entry.data;
    const crc = crc32(data);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(localHeader.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    const headerData = new Uint8Array(localHeader.length + data.length);
    headerData.set(localHeader, 0);
    headerData.set(data, localHeader.length);
    localHeaders.push(headerData);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralDirectory.push(centralHeader);

    offset += headerData.length;
  }

  const centralSize = centralDirectory.reduce(
    (sum, item) => sum + item.length,
    0
  );
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offset, true);
  eocdView.setUint16(20, 0, true);

  const output = new Uint8Array(
    localHeaders.reduce((sum, item) => sum + item.length, 0) +
      centralDirectory.reduce((sum, item) => sum + item.length, 0) +
      eocd.length
  );

  let cursor = 0;
  for (const item of localHeaders) {
    output.set(item, cursor);
    cursor += item.length;
  }
  for (const item of centralDirectory) {
    output.set(item, cursor);
    cursor += item.length;
  }
  output.set(eocd, cursor);

  return output;
}

function imageTag(
  alt: string,
  src: string,
  images: Map<string, EpubImage> | undefined
): string {
  const image = images?.get(src) ?? images?.get(src.replace(/^\.\//, ""));
  if (image) {
    return `<img src="${escapeXml(image.href)}" alt="${escapeXml(alt)}"/>`;
  }
  return `<img src="${escapeXml(src)}" alt="${escapeXml(alt)}"/>`;
}

function renderText(
  text: string,
  images: Map<string, EpubImage> | undefined
): string {
  let rendered = escapeXml(text);

  rendered = rendered.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_match, alt: string, src: string) => imageTag(alt, src, images)
  );
  rendered = rendered.replace(
    /!\[\[([^\]]+)\]\]/g,
    (_match, target: string) => imageTag(target, target, images)
  );
  rendered = rendered.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, label: string, href: string) =>
      `<a href="${escapeXml(href)}">${label}</a>`
  );
  rendered = rendered.replace(/`([^`]+)`/g, "<code>$1</code>");
  rendered = rendered.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  rendered = rendered.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  rendered = rendered.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  rendered = rendered.replace(
    /\[\[([^\]]+)\]\]/g,
    '<span class="wikilink">$1</span>'
  );
  return rendered;
}

function renderInline(
  text: string,
  images: Map<string, EpubImage> | undefined
): string {
  // Preserve authored HTML such as <span class="dropcap">T</span>, while
  // escaping ordinary text around it.
  return text
    .split(/(<[^>]+>)/g)
    .map((part) =>
      part.startsWith("<") && part.endsWith(">")
        ? part
        : renderText(part, images)
    )
    .join("");
}

function renderParagraph(
  lines: string[],
  images: Map<string, EpubImage> | undefined
): string {
  return `<p>${lines.map((line) => renderInline(line, images)).join("<br/>")}</p>`;
}

function isFence(line: string): boolean {
  return /^\s*```/.test(line);
}

function isHr(line: string): boolean {
  return /^\s*(\*{3,}|-{3,}|_{3,})\s*$/.test(line);
}

function isUnorderedList(line: string): boolean {
  return /^\s*[-*+]\s+/.test(line);
}

function isOrderedList(line: string): boolean {
  return /^\s*\d+\.\s+/.test(line);
}

function isBlockquote(line: string): boolean {
  return /^\s*>/.test(line);
}

function stripBlockquote(line: string): string {
  return line.replace(/^\s*(?:>\s?)+/, "");
}

function markdownBlocks(
  markdown: string,
  images: Map<string, EpubImage> | undefined
): string[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (isFence(line)) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !isFence(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) {
        i += 1;
      }
      output.push(`<pre><code>${escapeXml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      output.push(`<h${level}>${renderInline(heading[2], images)}</h${level}>`);
      i += 1;
      continue;
    }

    if (isHr(line)) {
      output.push("<hr/>");
      i += 1;
      continue;
    }

    if (isBlockquote(line)) {
      const quote: string[] = [];
      while (i < lines.length && (isBlockquote(lines[i]) || !lines[i].trim())) {
        if (lines[i].trim()) {
          quote.push(stripBlockquote(lines[i]));
        }
        i += 1;
      }
      output.push(
        `<blockquote>${renderParagraph(quote, images)}</blockquote>`
      );
      continue;
    }

    if (isUnorderedList(line) || isOrderedList(line)) {
      const ordered = isOrderedList(line);
      const items: string[] = [];
      const pattern = ordered ? /^\s*\d+\.\s+/ : /^\s*[-*+]\s+/;
      while (i < lines.length && pattern.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(pattern, ""), images)}</li>`);
        i += 1;
      }
      output.push(
        ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`
      );
      continue;
    }

    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !isFence(lines[i]) &&
      !isHr(lines[i]) &&
      !isBlockquote(lines[i]) &&
      !isUnorderedList(lines[i]) &&
      !isOrderedList(lines[i]) &&
      !lines[i].match(/^(#{1,6})\s+/)
    ) {
      paragraph.push(lines[i]);
      i += 1;
    }
    output.push(renderParagraph(paragraph, images));
  }

  return output;
}

function stripFrontmatter(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return normalized;
  }
  const closing = normalized.indexOf("\n---", 4);
  if (closing < 0) {
    return normalized;
  }
  return normalized.slice(closing + 4).replace(/^\s*\n/, "");
}

export function markdownToXhtml(
  markdown: string,
  options: EpubBuildOptions = {}
): string {
  const normalized = stripFrontmatter(markdown).trim();
  const body = normalized
    ? markdownBlocks(normalized, options.images).join("\n")
    : "<p> </p>";

  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(
    options.language ?? "en"
  )}">
  <head>
    <title>${escapeXml(options.title ?? "Compiled manuscript")}</title>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    ${body}
  </body>
</html>`;
}

export function writeEpubFromMarkdown(
  markdown: string,
  options: EpubBuildOptions = {}
): Uint8Array {
  const title = options.title ?? "Compiled manuscript";
  const language = options.language ?? "en";
  const xhtml = markdownToXhtml(markdown, options);
  const modified = new Date().toISOString();
  const css = `body { font-family: Georgia, "Times New Roman", serif; line-height: 1.7; margin: 2em; color: #111; }
p { margin: 0 0 1em; orphans: 2; widows: 2; }
h1, h2, h3, h4, h5, h6 { font-family: Georgia, "Times New Roman", serif; page-break-after: avoid; }
blockquote { margin: 1.2em 2em; font-style: italic; }
ul, ol { margin: 0 0 1em 1.5em; }
pre { white-space: pre-wrap; margin: 0 0 1em; }
code { font-family: monospace; }
.dropcap { float: left; font-size: 3em; line-height: 0.8; padding-right: 0.08em; font-weight: 700; }
strong { font-weight: 700; }
em { font-style: italic; }
img { max-width: 100%; height: auto; }
.wikilink { text-decoration: none; }`;
  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Table of contents</title></head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Contents</h1>
      <ol><li><a href="content.xhtml">${escapeXml(title)}</a></li></ol>
    </nav>
  </body>
</html>`;

  const imageEntries = Array.from(options.images?.values() ?? []);
  const imageManifest = imageEntries
    .map(
      (image, index) =>
        `    <item id="image-${index}" href="${escapeXml(
          image.href
        )}" media-type="${escapeXml(image.mediaType)}"/>`
    )
    .join("\n");

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>${escapeXml(language)}</dc:language>
    <dc:identifier id="BookId">urn:uuid:longform-extended-export</dc:identifier>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="content" href="content.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
${imageManifest}
  </manifest>
  <spine><itemref idref="content"/></spine>
</package>`;
  const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

  const entries = [
    { path: "mimetype", data: new TextEncoder().encode("application/epub+zip") },
    { path: "META-INF/container.xml", data: new TextEncoder().encode(container) },
    { path: "OEBPS/content.opf", data: new TextEncoder().encode(opf) },
    { path: "OEBPS/content.xhtml", data: new TextEncoder().encode(xhtml) },
    { path: "OEBPS/nav.xhtml", data: new TextEncoder().encode(nav) },
    { path: "OEBPS/style.css", data: new TextEncoder().encode(css) },
    ...imageEntries.map((image) => ({
      path: `OEBPS/${image.href}`,
      data: image.data,
    })),
  ];

  return createZipArchive(entries);
}

