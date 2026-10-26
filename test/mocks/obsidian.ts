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

/** Runtime stand-in for Obsidian's TFile, for `instanceof` checks. */
export class TFile {}

