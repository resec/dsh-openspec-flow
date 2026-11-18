#!/bin/sh
# Bootstrap entrypoint. This file must work on a host without a qualifying
# Node: it discovers a host runtime, or downloads and verifies the pinned one
# into the clone before handing the remaining work to scripts/bootstrap.mjs.
set -eu

ROOT=$(CDPATH= cd "$(dirname "$0")/.." && pwd)
MIRROR=${NODE_DIST_MIRROR:-https://nodejs.org/dist}
PASSTHROUGH=

usage() {
  cat <<'EOF'
Usage: scripts/bootstrap.sh [options] [-- bootstrap options]

Resolve a Node 24 runtime, then install dependencies, Git hooks, the
Playwright Chromium binary and run the lab doctor and tests.

Options:
  --help                 Show this usage and exit.
  --print-node-version   Print the baseline Node version and exit.
  --print-asset          Print the Node tarball name for this platform and exit.
  --print-candidate-paths Print the global Node roots this script inspects.
  --node-mirror URL      Node distribution mirror (default https://nodejs.org/dist).
  --full                 Run verification and the lab instead of the plain test suite.
  --skip-test            Skip npm test.
  --skip-install         Reuse node_modules instead of running npm ci.
  --skip-playwright      Skip the Playwright browser installation.
  --playwright-host URL  Chromium download host (PLAYWRIGHT_DOWNLOAD_HOST).
  --reset-browsers       Remove .cache/lab/pw-browsers before installing Chromium.
  --force                Continue past the free-disk threshold.
  --registry URL         npm registry for npm ci and npx.

The script never edits shell rc files, global Git configuration or DSH
profiles, and never runs the CLI's init or update commands.
EOF
}

baseline_version() {
  sed -n '/"node"[[:space:]]*:/,/}/p' "$ROOT/coverage.baseline.json" \
    | sed -E -n 's/.*"version"[[:space:]]*:[[:space:]]*"v?([0-9][0-9.]*)".*/\1/p' \
    | head -n 1
}

detect_platform() {
  case "$(uname -s)" in
    Darwin) echo darwin ;;
    Linux) echo linux ;;
    *) echo "bootstrap: unsupported platform $(uname -s); use macOS or Linux" >&2; return 1 ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    arm64|aarch64) echo arm64 ;;
    x86_64|amd64) echo x64 ;;
    *) echo "bootstrap: unsupported architecture $(uname -m)" >&2; return 1 ;;
  esac
}

print_asset() {
  version=$(baseline_version)
  [ -n "$version" ] || { echo "bootstrap: coverage.baseline.json has no node.version" >&2; exit 1; }
  platform=$(detect_platform) || exit 1
  arch=$(detect_arch) || exit 1
  echo "node-v${version}-${platform}-${arch}.tar.gz"
}

print_candidate_paths() {
  printf '%s\n' \
    "$HOME/.local/share/fnm/node-versions" \
    "$HOME/.nvm/versions/node" \
    "$HOME/.volta/tools/image/node" \
    "$HOME/.asdf/installs/nodejs" \
    "/opt/homebrew/opt/node@24/bin/node" \
    "/usr/local/opt/node@24/bin/node" \
    "/home/linuxbrew/.linuxbrew/opt/node@24/bin/node"
}

node_version() {
  "$1" --version 2>/dev/null || true
}

# True for a 24.x runtime at or above 24.9.0. The Node preflight in
# bootstrap.mjs enforces the exact engines.node range.
qualifies() {
  version=${1#v}
  major=${version%%.*}
  rest=${version#*.}
  minor=${rest%%.*}
  [ "$major" = 24 ] || return 1
  [ "$minor" -ge 9 ] || return 1
  return 0
}

version_gt() {
  left=${1#v}
  right=${2#v}
  left_major=${left%%.*}; left_rest=${left#*.}; left_minor=${left_rest%%.*}; left_patch=${left_rest#*.}; left_patch=${left_patch%%[!0-9]*}
  right_major=${right%%.*}; right_rest=${right#*.}; right_minor=${right_rest%%.*}; right_patch=${right_rest#*.}; right_patch=${right_patch%%[!0-9]*}
  [ "$left_major" -ne "$right_major" ] && { [ "$left_major" -gt "$right_major" ]; return $?; }
  [ "$left_minor" -ne "$right_minor" ] && { [ "$left_minor" -gt "$right_minor" ]; return $?; }
  [ "$left_patch" -gt "$right_patch" ]
}

BEST_PATH=
BEST_VERSION=
consider() {
  candidate=$1
  [ -n "$candidate" ] || return 0
  [ -x "$candidate" ] || return 0
  version=$(node_version "$candidate")
  [ -n "$version" ] || return 0
  qualifies "$version" || return 0
  if [ -z "$BEST_VERSION" ] || version_gt "$version" "$BEST_VERSION"; then
    BEST_PATH=$candidate
    BEST_VERSION=$version
  fi
}

for arg in "$@"; do
  case "$arg" in
    --help)
      usage
      exit 0
      ;;
    --print-node-version)
      baseline_version
      exit 0
      ;;
    --)
      break
      ;;
    --print-asset)
      print_asset
      exit 0
      ;;
    --print-candidate-paths)
      print_candidate_paths
      exit 0
      ;;
  esac
done

while [ $# -gt 0 ]; do
  case "$1" in
    --)
      shift
      while [ $# -gt 0 ]; do
        PASSTHROUGH="$PASSTHROUGH $1"
        shift
      done
      break
      ;;
    --node-mirror)
      [ $# -ge 2 ] || { echo "bootstrap: --node-mirror needs a value" >&2; exit 2; }
      MIRROR=$2
      shift 2
      ;;
    --node-mirror=*)
      MIRROR=${1#*=}
      shift
      ;;
    *)
      PASSTHROUGH="$PASSTHROUGH $1"
      shift
      ;;
  esac
done

consider "$(command -v node 2>/dev/null || true)"
consider "/opt/homebrew/opt/node@24/bin/node"
consider "/usr/local/opt/node@24/bin/node"
consider "/home/linuxbrew/.linuxbrew/opt/node@24/bin/node"
for candidate in "$HOME"/.local/share/fnm/node-versions/*/installation/bin/node \
  "$HOME"/.nvm/versions/node/*/bin/node \
  "$HOME"/.volta/tools/image/node/*/bin/node \
  "$HOME"/.asdf/installs/nodejs/*/bin/node; do
  consider "$candidate"
done

if [ -n "$BEST_PATH" ]; then
  PATH="$(dirname "$BEST_PATH"):$PATH"
  export PATH
  # shellcheck disable=SC2086
  exec "$BEST_PATH" "$ROOT/scripts/bootstrap.mjs" $PASSTHROUGH
fi

VERSION=$(baseline_version)
[ -n "$VERSION" ] || { echo "bootstrap: coverage.baseline.json has no node.version" >&2; exit 1; }
PLATFORM=$(detect_platform) || exit 1
ARCH=$(detect_arch) || exit 1

ASSET="node-v${VERSION}-${PLATFORM}-${ARCH}.tar.gz"
TARGET="$ROOT/.cache/toolchain/node-v${VERSION}-${PLATFORM}-${ARCH}"
if [ -x "$TARGET/bin/node" ]; then
  ln -sfn "$TARGET" "$ROOT/.cache/toolchain/node"
  PATH="$TARGET/bin:$PATH"
  export PATH
  # shellcheck disable=SC2086
  exec "$TARGET/bin/node" "$ROOT/scripts/bootstrap.mjs" $PASSTHROUGH
fi

mkdir -p "$ROOT/.cache/toolchain"
URL="${MIRROR%/}/v${VERSION}/${ASSET}"
SUM_URL="${MIRROR%/}/v${VERSION}/SHASUMS256.txt"
TARBALL="$ROOT/.cache/toolchain/$ASSET"
SUMS="$ROOT/.cache/toolchain/SHASUMS256-${VERSION}.txt"

echo "bootstrap: downloading Node ${VERSION} from $URL"
curl -fsSL "$URL" -o "$TARBALL"
curl -fsSL "$SUM_URL" -o "$SUMS"
EXPECTED=$(awk -v asset="$ASSET" '$2 == asset { print $1; exit }' "$SUMS")
[ -n "$EXPECTED" ] || { echo "bootstrap: no checksum for $ASSET" >&2; exit 1; }
if command -v shasum >/dev/null 2>&1; then
  ACTUAL=$(shasum -a 256 "$TARBALL" | awk '{ print $1 }')
elif command -v sha256sum >/dev/null 2>&1; then
  ACTUAL=$(sha256sum "$TARBALL" | awk '{ print $1 }')
else
  echo "bootstrap: no sha256 tool (shasum or sha256sum)" >&2
  exit 1
fi
[ "$EXPECTED" = "$ACTUAL" ] || { echo "bootstrap: checksum mismatch for $ASSET" >&2; exit 1; }

rm -rf "$TARGET"
tar -xzf "$TARBALL" -C "$ROOT/.cache/toolchain"
[ -x "$TARGET/bin/node" ] || { echo "bootstrap: extracted Node is missing $TARGET/bin/node" >&2; exit 1; }
ln -sfn "$TARGET" "$ROOT/.cache/toolchain/node"
PATH="$TARGET/bin:$PATH"
export PATH
# shellcheck disable=SC2086
exec "$TARGET/bin/node" "$ROOT/scripts/bootstrap.mjs" $PASSTHROUGH
