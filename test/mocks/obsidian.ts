/**
 * Minimal runtime stub for the `obsidian` package, which ships type
 * definitions only. Tests that exercise model logic need `normalizePath`.
 */
export function normalizePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

/** Runtime stand-in for Obsidian's Platform module. */
export const Platform = {
  isMobile: false,
  isMobileApp: false,
  isDesktopApp: true,
};

/** Runtime stand-in for Obsidian's Notice, for modules that import it. */
export class Notice {
  constructor(public message: string) {}
}

/** Runtime stand-in for Obsidian's TFile, for `instanceof` checks. */
export class TFile {}

export type MemoryFile = { content: string; mtime: number };

/** Shared in-memory `DataAdapter.rename`, so adapter mocks can exercise it. */
export function rename(
  files: Map<string, MemoryFile>,
  from: string,
  to: string
): void {
  const file = files.get(from);
  if (!file) {
    throw new Error(`No such file: ${from}`);
  }
  files.delete(from);
  files.set(to, file);
}


