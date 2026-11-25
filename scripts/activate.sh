#!/bin/sh
# Put the recorded Node runtime first on PATH for the current shell.
# Sourcing this file never edits shell rc files. It prefers the worktree's
# toolchain record and falls back to the legacy clone-local symlink only for a
# checkout prepared before the record existed.

if [ -n "${BASH_SOURCE:-}" ]; then
  ACTIVATE_DIR=$(CDPATH= cd "$(dirname "$BASH_SOURCE")" && pwd)
elif [ -n "${ZSH_VERSION:-}" ]; then
  ACTIVATE_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)
else
  ACTIVATE_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)
fi

if [ -n "${OPENSPEC_FLOW_WORKTREE_ROOT:-}" ]; then
  ACTIVATE_ROOT=$OPENSPEC_FLOW_WORKTREE_ROOT
else
  ACTIVATE_ROOT=$(CDPATH= cd "$ACTIVATE_DIR/.." && pwd)
fi

RECORD="$ACTIVATE_ROOT/.cache/toolchain/manifest.json"
ACTIVATE_NODE=

if [ -f "$RECORD" ] && command -v node >/dev/null 2>&1; then
  ACTIVATE_NODE=$(node -e '
    const { readFileSync } = require("node:fs")
    try {
      const record = JSON.parse(readFileSync(process.argv[1], "utf8"))
      if (typeof record.node?.path === "string") process.stdout.write(record.node.path)
    } catch {}
  ' "$RECORD" 2>/dev/null || true)
fi

if [ -n "$ACTIVATE_NODE" ] && [ -x "$ACTIVATE_NODE" ]; then
  ACTIVATE_BIN=$(dirname "$ACTIVATE_NODE")
  case ":$PATH:" in
    *":$ACTIVATE_BIN:"*) ;;
    *) PATH="$ACTIVATE_BIN:$PATH" ;;
  esac
  export PATH
  echo "bootstrap: using $("$ACTIVATE_NODE" --version) from the worktree record" >&2
  return 0 2>/dev/null || exit 0
fi

LEGACY="$ACTIVATE_ROOT/.cache/toolchain/node/bin"
if [ -x "$LEGACY/node" ]; then
  case ":$PATH:" in
    *":$LEGACY:"*) ;;
    *) PATH="$LEGACY:$PATH" ;;
  esac
  export PATH
  echo "bootstrap: using $("$LEGACY/node" --version) from the legacy clone-local runtime" >&2
  return 0 2>/dev/null || exit 0
fi

echo "bootstrap: no toolchain record and no clone-local Node runtime; run ./scripts/bootstrap.sh" >&2
return 1 2>/dev/null || exit 1
