#!/usr/bin/env bash
# Install/reinstall dsh-skin-desktop into the web profile (manual install;
# avoids pnpm hanging on file: dependencies in this environment).
# Usage: bash install.sh
set -euo pipefail

PLUGIN_SRC="$(cd "$(dirname "$0")" && pwd)"
PROFILE_DIR="${DSH_HOME:-$HOME/.dsh}/profiles/web"
PKG_NAME="dsh-skin-desktop"

if [ ! -f "$PROFILE_DIR/package.json" ]; then
  echo "error: profile not found at $PROFILE_DIR" >&2
  exit 1
fi

echo "==> Copying plugin to $PROFILE_DIR/node_modules/$PKG_NAME"
rm -rf "$PROFILE_DIR/node_modules/$PKG_NAME"
mkdir -p "$PROFILE_DIR/node_modules"
cp -R "$PLUGIN_SRC" "$PROFILE_DIR/node_modules/$PKG_NAME"
rm -rf "$PROFILE_DIR/node_modules/$PKG_NAME/install.sh" "$PROFILE_DIR/node_modules/$PKG_NAME/README.md"

echo "==> Updating profile manifest (dependencies + bundles)"
NODE_BIN="$(command -v node || ls "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | head -1)"
if [ -z "$NODE_BIN" ]; then
  echo "error: node not found" >&2
  exit 1
fi
"$NODE_BIN" -e "
const fs = require('fs');
const p = process.argv[1];
const m = JSON.parse(fs.readFileSync(p, 'utf8'));
if (!m.dependencies || typeof m.dependencies !== 'object') m.dependencies = {};
if (!m.dsh || typeof m.dsh !== 'object') m.dsh = {};
if (!m.dsh.profile || typeof m.dsh.profile !== 'object') m.dsh.profile = {};
if (!Array.isArray(m.dsh.profile.bundles)) m.dsh.profile.bundles = [];
m.dependencies['$PKG_NAME'] = 'file:$PLUGIN_SRC';
if (!m.dsh.profile.bundles.includes('$PKG_NAME')) m.dsh.profile.bundles.push('$PKG_NAME');
fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n');
" "$PROFILE_DIR/package.json"

echo "==> Done. Restart the desktop shell / web app for the new bundle to load."
echo "    bundles: $("$NODE_BIN" -e "console.log(require('$PROFILE_DIR/package.json').dsh.profile.bundles.join(' -> '))")"
