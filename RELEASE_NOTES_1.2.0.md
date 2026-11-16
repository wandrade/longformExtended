# Longform Extended 1.2.0

## EPUB export in Compile

**Save as Note** now supports Markdown and EPUB outputs:

- Markdown remains enabled by default and remains the canonical manuscript.
- EPUB is written beside the Markdown output as `<name>.epub`.
- Markdown and EPUB work offline on desktop, Android, and iOS.
- No Pandoc, LaTeX, or other external converter is required.
- Existing workflows with no output options keep their Markdown-only behavior.

EPUB output supports headings, paragraphs, blockquotes, lists, code, links, emphasis, images, project fonts, and project-specific paragraph and scene-spacing settings. Acts and chapters are included in the EPUB table of contents as clickable entries.

## Compile workflow fixes

- Changing a compile option and immediately pressing Compile now uses the new value instead of the previous saved value.
- Markdown is shown checked by default for older workflows that predate the output options.
- **Open Compiled Manuscript** now focuses an already-open output tab instead of creating a duplicate tab. Autocompile still never opens or focuses files.
- The compile UI handles deferred/background tabs as well as visible markdown tabs.

## Project selection

- Longform Extended now remembers the last opened project across Obsidian restarts.
- The last project is saved immediately in local storage, with the plugin data path as a fallback.
- Moved, renamed, or missing project paths are resolved to the matching draft instead of silently falling back to the first project.

## Android and mobile

- Scene hierarchy indentation now reads touch coordinates correctly, so dragging scenes on Android can change their indent level.
- EPUB generation uses the same embedded writer on desktop and mobile.

## Project settings

- Folder and template suggestion fields now show the complete option list when focused, and work when their settings sections are expanded dynamically.

## Compatibility

- Longform Extended now detects when the original Longform plugin is enabled and stops with a clear notice. Disable Longform before enabling Longform Extended.

## Documentation

- `docs/COMPILE.md` documents Markdown/EPUB outputs, output paths, and tab behavior.
