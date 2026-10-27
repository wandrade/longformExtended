#!/usr/bin/env node
/**
 * Shared version gate for pull-request CI and the release workflow.
 *
 * Rule implemented here:
 *   1. manifest.json `version` must be valid SemVer 2.0.0.
 *   2. versions.json must contain `version` mapped exactly to manifest
 *      `minAppVersion` (the value Obsidian reads for compatibility).
 *   3. package.json `version` must equal manifest.json `version`.
 *   4. Every git tag whose name is a valid SemVer string is treated as a
 *      release tag (the repository convention is an exact version, no "v").
 *      If at least one exists, the manifest version must be strictly greater
 *      than the highest release tag using SemVer precedence.
 *   5. If no release tags exist yet, there is nothing to compare against. The
 *      version is accepted as the first/unreleased version after checks 1-3.
 *      This deliberately does not compare against main's manifest, so an
 *      initial 0.0.1 is not rejected because an old unreleased main says 1.0.0.
 *
 * The checkout must not be shallow: tags are the source of truth for released
 * versions, and a shallow clone would silently hide them.
 *
 * Usage:
 *   node .github/scripts/check-version.mjs --mode pr
 *   node .github/scripts/check-version.mjs --mode release
 *
 * Exit status: 0 when every check passes, 1 otherwise.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function parseSemver(value) {
  if (typeof value !== "string") return null;
  const match = SEMVER_RE.exec(value);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

function compareSemver(a, b) {
  for (const key of ["major", "minor", "patch"]) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }

  // A stable version has higher precedence than any prerelease of it.
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;

  const length = Math.min(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const left = a.prerelease[index];
    const right = b.prerelease[index];
    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);

    if (leftNumeric && rightNumeric) {
      const leftNumber = Number(left);
      const rightNumber = Number(right);
      if (leftNumber !== rightNumber) return leftNumber < rightNumber ? -1 : 1;
    } else if (leftNumeric) {
      return -1; // Numeric identifiers have lower precedence.
    } else if (rightNumeric) {
      return 1;
    } else if (left !== right) {
      return left < right ? -1 : 1;
    }
  }

  if (a.prerelease.length === b.prerelease.length) return 0;
  return a.prerelease.length < b.prerelease.length ? -1 : 1;
}

function usage() {
  console.log(`Usage: node .github/scripts/check-version.mjs [--mode pr|release]

Validates manifest.json, versions.json and package.json, and (when release
tags exist) requires the manifest version to be strictly greater than the
highest SemVer tag.

Options:
  --mode pr|release  Label the run and validate the mode name (default: pr)
  -h, --help         Show this help`);
}

function parseArgs(argv) {
  let mode = "pr";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    } else if (arg === "--mode") {
      mode = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--mode=")) {
      mode = arg.slice("--mode=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!["pr", "release"].includes(mode)) {
    throw new Error(`Invalid --mode "${mode}"; expected "pr" or "release".`);
  }
  return { mode };
}

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
  console.error(`\nVersion check failed: ${message}`);
  process.exit(1);
}

function readJson(name) {
  try {
    return JSON.parse(readFileSync(resolve(process.cwd(), name), "utf8"));
  } catch (error) {
    fail(`Cannot read ${name}: ${error.message}`);
  }
}

function git(args) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function findLatestReleaseTag() {
  let shallow;
  try {
    shallow = git(["rev-parse", "--is-shallow-repository"]).trim();
  } catch (error) {
    fail(`Cannot inspect the git repository: ${error.stderr || error.message}`);
  }

  if (shallow === "true") {
    fail(
      "Shallow git checkout detected, so release tags are unavailable. " +
        "Check out with full history (actions/checkout fetch-depth: 0).",
    );
  }

  let output;
  try {
    // Only tags reachable from the checked-out commit count. Release tags live
    // on main; tags on unrelated branches must not raise the bar.
    output = git(["tag", "--list", "--merged", "HEAD"]);
  } catch (error) {
    fail(`Cannot list git tags: ${error.stderr || error.message}`);
  }

  let latestTag = null;
  let latestParsed = null;
  for (const tag of output.split(/\r?\n/).map((line) => line.trim())) {
    if (!tag) continue;
    const parsed = parseSemver(tag);
    if (!parsed) continue; // Not a release tag (for example, "v1.2.3").
    if (latestParsed === null || compareSemver(parsed, latestParsed) > 0) {
      latestTag = tag;
      latestParsed = parsed;
    }
  }

  return { tag: latestTag, parsed: latestParsed };
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    fail(error.message);
  }

  const { mode } = options;
  const manifest = readJson("manifest.json");
  const versions = readJson("versions.json");
  const packageJson = readJson("package.json");

  const errors = [];
  const version = manifest.version;
  const parsedVersion = parseSemver(version);

  if (parsedVersion === null) {
    errors.push(
      `manifest.json version ${JSON.stringify(version)} is not valid SemVer 2.0.0.`,
    );
  }

  if (
    typeof manifest.minAppVersion !== "string" ||
    parseSemver(manifest.minAppVersion) === null
  ) {
    errors.push(
      `manifest.json minAppVersion ${JSON.stringify(
        manifest.minAppVersion,
      )} is not valid SemVer 2.0.0.`,
    );
  }

  if (
    versions === null ||
    typeof versions !== "object" ||
    Array.isArray(versions)
  ) {
    errors.push("versions.json must contain a JSON object.");
  } else if (!Object.prototype.hasOwnProperty.call(versions, version)) {
    errors.push(
      `versions.json is missing an entry for "${version}". ` +
        `Add "${version}": "${manifest.minAppVersion}".`,
    );
  } else if (versions[version] !== manifest.minAppVersion) {
    errors.push(
      `versions.json maps "${version}" to ${JSON.stringify(
        versions[version],
      )}, but manifest.json minAppVersion is ${JSON.stringify(
        manifest.minAppVersion,
      )}.`,
    );
  }

  if (packageJson.version !== version) {
    errors.push(
      `package.json version ${JSON.stringify(
        packageJson.version,
      )} must match manifest.json version ${JSON.stringify(version)}.`,
    );
  }

  const latest = findLatestReleaseTag();
  if (parsedVersion !== null && latest.parsed !== null) {
    if (compareSemver(parsedVersion, latest.parsed) <= 0) {
      const alreadyReleased =
        compareSemver(parsedVersion, latest.parsed) === 0;
      errors.push(
        alreadyReleased
          ? `manifest.json version "${version}" is already released (tag "${latest.tag}"). ` +
              "Bump to a strictly greater SemVer before merging."
          : `manifest.json version "${version}" must be strictly greater than ` +
              `the latest release tag "${latest.tag}".`,
      );
    }
  }

  console.log(`Version check (${mode})`);
  console.log(`  manifest.json version:   ${String(version)}`);
  console.log(`  manifest.json minApp:    ${String(manifest.minAppVersion)}`);
  console.log(`  versions.json mapping:   ${String(versions?.[version])}`);
  console.log(`  package.json version:    ${String(packageJson.version)}`);
  console.log(
    `  latest release tag:      ${latest.tag ?? "none (first/unreleased version)"}`,
  );

  if (errors.length > 0) {
    console.error("");
    for (const error of errors) {
      annotate(error);
      console.error(`  - ${error}`);
    }
    console.error(`\nVersion check failed with ${errors.length} error(s).`);
    process.exit(1);
  }

  if (latest.tag === null) {
    console.log(
      "  No release tags found; validated as the first/unreleased version " +
        "(no comparison against main's manifest).",
    );
  }

  console.log("\nVersion check passed.");
}

main();
