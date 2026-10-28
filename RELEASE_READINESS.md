## Short answer

**The unofficial 1.0.0 GitHub release is live.** Tag `1.0.0` points at `500cfb6`, and the release includes `main.js`, `manifest.json`, and `styles.css`. CI and the Release workflow both passed.

The only remaining blocker is the **Community directory fork policy**: the public approval request [issue #349](https://github.com/kevboh/longform/issues/349) is still open with no approval. That blocks official listing, not the GitHub release.

Future releases use the `release` / `no-release` PR labels; `Release label` is now a required check.

## Readiness scorecard

| Area | Status |
|---|---|
| Public GitHub repo, `main` default branch | ✅ Public, fork of `kevboh/longform`; `main` is default and protected |
| `README.md`, `manifest.json`, `versions.json` at root | ✅ All present and tracked |
| Exact `LICENSE` file at root | ✅ Present; validator reports “README.md and LICENSE present” |
| Manifest `id`, `name`, `version`, `minAppVersion` | ✅ Validator reports “manifest.json fields valid”; current version is `1.0.0` |
| Manifest description | ✅ Corrected; no “Obsidian”, corkboard, or stale plot-grid claim |
| `versions.json` | ✅ `1.0.0 -> 1.14.0`; matches `minAppVersion` |
| `package.json` version and description | ✅ `1.0.0`; description matches manifest |
| Fork policy | ❌ Public request open at [issue #349](https://github.com/kevboh/longform/issues/349) (2026-10-27); no approval yet |
| CI workflow (`.github/workflows/ci.yml`) | ✅ Present; tests, build, and source review pass with 0 errors / 2 warnings |
| `release` / `no-release` label gate | ✅ Live; `Release label` is a required check, and the Release workflow uses the `release` label |
| Branch protection / rulesets | ✅ “Protect main” and “Release tags” active |
| Required checks on `main` | ✅ Unit tests, Production build, Version bump, Obsidian review preflight, Release label |
| Release workflow (`.github/workflows/release.yml`) | ✅ Label-gated `pull_request: closed` flow; PR #3 (`release`) completed successfully |
| Release tag and GitHub release | ✅ `1.0.0` at `500cfb6`; GitHub release published |
| Release assets | ✅ `main.js`, `manifest.json`, `styles.css` attached |
| Automated source review | ✅ 0 errors / 2 non-blocking warnings; merged to `main` |
| README install/funding/support text | ✅ Extended install section and Sponsorship present; no stale funding TODO |
| Tests | ✅ 231 passing locally and in CI |
| Issues tracker | ✅ Enabled |
| GitHub repo metadata (description, topics, funding) | ✅ Description, topics, and `.github/FUNDING.yml` verified |

## 1. The hard blocker: this is a fork

The directory policy says:

> “Forks are not allowed in the Community directory unless they meet one of the following criteria:
> 1. The fork has received explicit written approval from the original author in a publicly verifiable way.
> 2. The fork author can show proof that the original author is unreachable and has not updated the project for at least 6 months.”

After the 6-month route, you must contact the author and allow **30 days** for a public acknowledgement. In both cases, the original author must be credited as a contributor.

Your repo is publicly marked as a fork of `kevboh/longform`. Upstream’s last commit was **2025-12-02**, so it is over six months old, but that alone is not enough: you need proof the author is unreachable and a public 30-day notice. The safer path is public written approval from Kevin Barrett. Your README already credits him, which is good, but approval still has to be publicly verifiable.

A public approval request was opened on **2026-10-27**: [kevboh/longform issue #349](https://github.com/kevboh/longform/issues/349). It is currently open with no approval response. This documents the fork request in a public place, but it is not itself permission. Keep the issue open and do not submit until you have approval or have satisfied the unreachability and 30-day-notice route.

## 2. Manifest, license, and repository fixes (verified)

These are now done on `main` at `8c78296`:

- `manifest.json` description is `Extend Longform projects with configurable note groups, timelines, kanban boards, and an editable subplot grid.` The same text is in `manifest-beta.json`, `package.json`, and the GitHub repo description. It contains no “Obsidian” and no corkboard claim.
- The required root `LICENSE` file exists alongside `LICENSE.md` and `LICENSE-ADDITIONS.md`. The validator reports `ok manifest.json fields valid`, `ok versions.json maps 1.0.0 -> 1.14.0`, and `ok README.md and LICENSE present`.
- The README has a **Longform Extended** installation section using `.obsidian/plugins/longform-extended/` and **Settings → Community plugins**. The stale funding TODO is gone, and the Sponsorship section links to GitHub Sponsors.
- GitHub Issues is enabled; topics and the repository description are set; `.github/FUNDING.yml` is present.
- The fork's additions remain under `LICENSE-ADDITIONS.md`, which restricts redistribution; the original Longform code remains under `LICENSE.md`.

Manifest fields verified:

- `id: longform-extended` — lowercase, no “obsidian”, does not end in “plugin”.
- `name: Longform Extended` — no “Obsidian” or “Plugin”.
- `version: 1.0.0` — valid SemVer; matches `package.json`.
- `minAppVersion: 1.14.0` — valid SemVer and matches the `versions.json` mapping.
- `isDesktopOnly: false` — no Node/Electron imports found.
- `author`, `authorUrl`, `fundingUrl` — populated.

## 3. Source review: passes with two warnings

The current branch reports:

```text
2 problems (0 errors, 2 warnings)
```

The cleanup fixes the command ID prefixes, console logging, floating promises, unsafe types, `innerHTML`, timers, trash API, static styles, and sentence-case findings. It also removes the user-script compile-step feature entirely, including the `window.eval` loader, observer, settings, store, UI, serialization lookup, `isScript` metadata, fixtures, and tests. The removal is documented in `README.md` and `docs/COMPILE.md` with the version history (ESLint `no-eval` since v0.0.2; current review toolchain enforcement).

Remaining warnings are non-blocking:

- `src/view/settings/LongformSettings.ts` — `getSettingDefinitions()` warning; settings are not searchable in Obsidian settings search.
- `src/view/settings/suggest.ts` — custom `TextInputSuggest` warning; migrating to `AbstractInputSuggest` would rewrite the suggestion layer.

The official directory still runs its own scan on every release. Preview it from the developer dashboard before submitting.

## 4. How the actual release and submission work

The old “open a PR against `obsidianmd/obsidian-releases`” method is deprecated. Use **community.obsidian.md**.

1. **Confirm the version (already set)**
   - `manifest.json` and `package.json` are `1.0.0`; `versions.json` maps `"1.0.0": "1.14.0"`.
   - Commit the manifest to the default branch; the directory reads `manifest.json` at HEAD. The version gate requires a strictly greater version only once release tags exist.

2. **Build the artifacts**
   ```bash
   npm ci
   npm run build
   ```
   Keep `main.js` out of Git; it is ignored. The release needs the built file.

3. **Create the GitHub release**
   - For **1.0.0 this is already done**: tag `1.0.0` at `500cfb6`, with all three assets.
   - For future releases, tag exactly the manifest version — no `v` prefix.
   - Publish a normal release, not a draft/prerelease.
   - Attach three individual binary assets:
     - `main.js`
     - `manifest.json`
     - `styles.css` (optional but you have one)
   - Do not attach a source zip or the repository tarball.
   - The live `.github/workflows/release.yml` currently automates this on a push to `main`; the `release` / `no-release` label-gated flow is still being implemented.

4. **Submit through the directory**
   - Sign in at `community.obsidian.md` with an Obsidian account.
   - Link your GitHub account to verify repository ownership.
   - Add the plugin; the ID must be unique and must not contain “obsidian”.
   - Run/pass automated review. Fix issues, increment the version, and create a new release if needed.
   - After approval, the plugin becomes installable from Community plugins. Future updates are picked up from new GitHub release tags; no resubmission.

5. **GitHub Actions release workflow**
The label-gated Release workflow is live. PR #3 carried the `release` label and completed successfully; `release` PRs create the tag/release, while `no-release` PRs skip it. Future releases need an appropriate version bump plus the `release` label.

## Recommended order

1. **Test the published 1.0.0 release.** Download the three assets or install through your vault and verify the plugin loads, settings/Notes/Compile work, and the user-script feature is gone.
2. **Official listing:** wait for fork approval at issue #349, or complete the unreachability + 30-day notice route.
3. After approval, submit `1.0.0` through `community.obsidian.md`.
4. For future changes, bump the version and merge with the `release` label; use `no-release` for non-release merges.

The unofficial 1.0.0 release is complete. The only remaining path is the official Community listing: fork approval (or the unreachability/30-day-notice route), then submission through community.obsidian.md.

Sources: [Submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins), [Developer policies](https://docs.obsidian.md/community-directory/developer-policies), [Submit your plugin](https://docs.obsidian.md/plugins/releasing/submit-plugin), [Manifest reference](https://docs.obsidian.md/Reference/Manifest), [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines), [Community directory FAQ](https://docs.obsidian.md/community-directory/faq), [upstream Longform commit history](https://github.com/kevboh/longform/commits/main), [Obsidian 1.14 release](https://obsidian.md/changelog/2026-10-05-desktop-v1.14.4/), [official ESLint plugin](https://github.com/obsidianmd/eslint-plugin).
