#!/usr/bin/env bash
#
# Typecheck, test, build, run the Obsidian review preflight, and install the
# result into a local vault.
#
# Usage:
#   ./scripts/build-install.sh                 # install to the default vault
#   LONGFORM_PLUGIN_DIR=/path/to/plugin ./scripts/build-install.sh
#
# Environment:
#   LONGFORM_PLUGIN_DIR  Destination plugin folder.
#   SKIP_INSTALL=1       Build and verify only, do not copy.
#   SKIP_TESTS=1         Skip the unit tests.

set -euo pipefail

PLUGIN_DIR="${LONGFORM_PLUGIN_DIR:-/var/home/werner/repos/Texts/Projects/.obsidian/plugins/longform-extended}"
VALIDATOR="obsidian-plugin-validator@1.0.6"

cd "$(dirname "$0")/.."

step() {
  printf '\n\033[1m==> %s\033[0m\n' "$1"
}

step "Typecheck"
npx tsc --noEmit -p tsconfig.json

if [[ "${SKIP_TESTS:-0}" != "1" ]]; then
  step "Unit tests"
  npx vitest run
fi

step "Lint"
npx svelte-check --tsconfig tsconfig.json --fail-on-hints
npx eslint . --ext .ts

step "Build"
npx rollup --config rollup.config.js --environment BUILD:production

step "Obsidian review preflight"
npx --yes "$VALIDATOR"

if [[ "${SKIP_INSTALL:-0}" == "1" ]]; then
  step "Skipping install (SKIP_INSTALL=1)"
  exit 0
fi

step "Install"
if [[ ! -d "$PLUGIN_DIR" ]]; then
  echo "Plugin folder not found, creating it: $PLUGIN_DIR"
  mkdir -p "$PLUGIN_DIR"
fi

for file in main.js manifest.json styles.css; do
  if [[ ! -f "$file" ]]; then
    echo "Missing build artifact: $file" >&2
    exit 1
  fi
  cp "$file" "$PLUGIN_DIR/$file"
done

version="$(node -p "require('./manifest.json').version")"
echo "Installed $version into $PLUGIN_DIR"
echo "Reload Obsidian (or toggle the plugin) to pick it up."
