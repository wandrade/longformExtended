import type { App } from "obsidian";

export const DESKTOP_EXPORT_DOCS_URL =
  "https://github.com/wandrade/longformExtended/blob/main/docs/COMPILE.md#save-as-note";

type NodeRequire = (id: string) => unknown;
type ChildProcess = {
  spawnSync: (
    command: string,
    args: string[],
    options: {
      input?: Uint8Array;
      encoding?: "buffer";
      maxBuffer?: number;
    }
  ) => {
    status: number | null;
    stdout?: Uint8Array;
    stderr?: Uint8Array;
    error?: Error;
  };
};
type FsModule = {
  existsSync: (path: string) => boolean;
};
type ProcessModule = {
  env?: Record<string, string | undefined>;
  platform?: string;
};

export type DesktopConversionResult =
  | { ok: true; data: Uint8Array }
  | { ok: false; reason: string };

function conversionFailure(
  result: DesktopConversionResult
): result is { ok: false; reason: string } {
  return !result.ok;
}

function nodeRequire(): NodeRequire | null {
  const runtime = (typeof window !== "undefined" ? window : globalThis) as {
    require?: NodeRequire;
  };
  return typeof runtime.require === "function" ? runtime.require : null;
}

function childProcess(): ChildProcess | null {
  const requireFn = nodeRequire();
  if (!requireFn) {
    return null;
  }
  try {
    return requireFn("child_process") as ChildProcess;
  } catch {
    return null;
  }
}

function fsModule(): FsModule | null {
  const requireFn = nodeRequire();
  if (!requireFn) {
    return null;
  }
  try {
    return requireFn("fs") as FsModule;
  } catch {
    return null;
  }
}

function processModule(): ProcessModule | null {
  const runtime = globalThis as { process?: ProcessModule };
  return runtime.process ?? null;
}

function isFlatpak(): boolean {
  return Boolean(processModule()?.env?.["FLATPAK_ID"]);
}

function flatpakSpawnAvailable(): boolean {
  const fs = fsModule();
  return Boolean(fs?.existsSync("/usr/bin/flatpak-spawn"));
}

function basePathFor(app: App): string | null {
  const adapter = app.vault.adapter as typeof app.vault.adapter & {
    getBasePath?: () => string;
  };
  return typeof adapter.getBasePath === "function"
    ? adapter.getBasePath()
    : null;
}

function resourcePath(app: App, projectPath: string): string | null {
  const base = basePathFor(app);
  if (!base) {
    return null;
  }
  return `${base}/${projectPath}`;
}

function errorText(result: {
  stderr?: Uint8Array;
  error?: Error;
}): string {
  const stderr = result.stderr
    ? new TextDecoder().decode(result.stderr).trim()
    : "";
  if (stderr) {
    return stderr.slice(-500);
  }
  return result.error?.message ?? "Unknown converter error";
}

function runPandoc(
  command: string,
  args: string[],
  markdown: Uint8Array
): DesktopConversionResult {
  const cp = childProcess();
  if (!cp) {
    return {
      ok: false,
      reason:
        "The desktop converter could not be started. External process execution is unavailable in this Obsidian runtime.",
    };
  }

  try {
    const result = cp.spawnSync(command, args, {
      input: markdown,
      encoding: "buffer",
      maxBuffer: 64 * 1024 * 1024,
    });

    if (result.error) {
      const code = (result.error as Error & { code?: string }).code;
      if (code === "ENOENT") {
        return {
          ok: false,
          reason:
            "Pandoc was not found on PATH. Install Pandoc and restart Obsidian.",
        };
      }
      return { ok: false, reason: result.error.message };
    }
    if (result.status !== 0) {
      return { ok: false, reason: errorText(result) };
    }
    if (!result.stdout || result.stdout.length === 0) {
      return { ok: false, reason: "Converter produced no output." };
    }
    return { ok: true, data: result.stdout };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function pandocArgs(
  format: "docx" | "pdf",
  app: App,
  projectPath: string
): string[] {
  const args = ["-f", "markdown", "-t", format, "-o", "-"];
  const resources = resourcePath(app, projectPath);
  if (resources) {
    args.push(`--resource-path=${resources}`);
  }
  if (format === "pdf") {
    args.push("--pdf-engine=xelatex");
  }
  return args;
}

export function convertOnDesktop(
  app: App,
  projectPath: string,
  format: "docx" | "pdf",
  markdown: string
): DesktopConversionResult {
  const input = new TextEncoder().encode(markdown);
  const args = pandocArgs(format, app, projectPath);

  // Flatpak Obsidian has its own Pandoc but not necessarily a TeX engine.
  // Prefer the host toolchain when the sandbox exposes flatpak-spawn.
  if (isFlatpak() && flatpakSpawnAvailable()) {
    const hostResult = runPandoc(
      "flatpak-spawn",
      ["--host", "pandoc", ...args],
      input
    );
    if (hostResult.ok) {
      return hostResult;
    }
  }

  const direct = runPandoc("pandoc", args, input);
  if (!conversionFailure(direct)) {
    return direct;
  }

  const reason = direct.reason;
  if (format === "pdf") {
    return {
      ok: false,
      reason:
        reason +
        " Install Pandoc and a LaTeX engine (xelatex or lualatex), then restart Obsidian. See the Compile documentation.",
    };
  }

  return {
    ok: false,
    reason:
      reason +
      " Install Pandoc, then restart Obsidian. See the Compile documentation.",
  };
}
