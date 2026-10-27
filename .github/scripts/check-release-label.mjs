#!/usr/bin/env node
/**
 * Enforces the release-label policy on pull requests.
 *
 * Exactly one of these labels must be present:
 *   - release     the PR bumps the version and merging it creates a release
 *   - no-release  the PR makes no release; version files need only be consistent
 *
 * Having neither label, or both labels, is an error. Requiring exactly one makes
 * the release decision explicit instead of inferred from the version files.
 *
 * Usage:
 *   PR_LABELS='["release","bug"]' node .github/scripts/check-release-label.mjs
 *   PR_LABELS='["no-release"]' \
 *     node .github/scripts/check-release-label.mjs --github-output
 *
 * PR_LABELS must be a JSON array of label names. In GitHub Actions, generate it
 * with `${{ toJSON(github.event.pull_request.labels.*.name) }}` rather than a
 * space-separated string so labels containing spaces stay unambiguous.
 *
 * --github-output appends `mode=<release|no-release>` to $GITHUB_OUTPUT, which
 * lets the version-bump job reuse this single source of truth.
 *
 * Exit status: 0 when exactly one label is present, 1 otherwise.
 */

import { appendFileSync } from "node:fs";

const RELEASE_LABEL = "release";
const NO_RELEASE_LABEL = "no-release";

function annotate(message) {
  if (process.env.GITHUB_ACTIONS !== "true") return;
  const escaped = message
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
  console.error(`::error::${escaped}`);
}

function fail(message) {
  annotate(message);
  console.error(`\nRelease label check failed: ${message}`);
  process.exit(1);
}

function usage() {
  console.log(`Usage: PR_LABELS='["release"]' node .github/scripts/check-release-label.mjs [--github-output]

Reads the pull-request label names from the PR_LABELS environment variable
(JSON array) and requires exactly one of "${RELEASE_LABEL}" or
"${NO_RELEASE_LABEL}".

Options:
  --github-output  Write mode=<release|no-release> to $GITHUB_OUTPUT
  -h, --help       Show this help`);
}

let writeGitHubOutput = false;
for (const arg of process.argv.slice(2)) {
  if (arg === "-h" || arg === "--help") {
    usage();
    process.exit(0);
  } else if (arg === "--github-output") {
    writeGitHubOutput = true;
  } else {
    fail(`Unknown argument: ${arg}`);
  }
}

let labels;
try {
  const raw = process.env.PR_LABELS;
  labels =
    raw === undefined || raw.trim() === "" || raw.trim() === "null"
      ? []
      : JSON.parse(raw);
} catch (error) {
  fail(`PR_LABELS is not valid JSON: ${error.message}`);
}

if (!Array.isArray(labels)) {
  fail("PR_LABELS must be a JSON array of label names.");
}
if (labels.some((label) => typeof label !== "string")) {
  fail("PR_LABELS must contain only strings.");
}

const hasRelease = labels.includes(RELEASE_LABEL);
const hasNoRelease = labels.includes(NO_RELEASE_LABEL);

if (hasRelease && hasNoRelease) {
  fail(
    `Both "${RELEASE_LABEL}" and "${NO_RELEASE_LABEL}" labels are present. ` +
      `Remove exactly one so the release intent is unambiguous.`,
  );
}

if (!hasRelease && !hasNoRelease) {
  fail(
    `No release label found. Add exactly one of "${RELEASE_LABEL}" or ` +
      `"${NO_RELEASE_LABEL}" to this pull request.`,
  );
}

const mode = hasRelease ? RELEASE_LABEL : NO_RELEASE_LABEL;
console.log(`Release label check passed: "${mode}" is present.`);

if (writeGitHubOutput) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    fail("--github-output was requested but GITHUB_OUTPUT is not set.");
  }
  appendFileSync(outputPath, `mode=${mode}\n`);
}
