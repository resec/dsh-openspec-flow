#!/bin/sh
# Put a clone-local Node runtime first on PATH for the current shell.
# Source this file; it never edits shell rc files.

if [ -n "${BASH_SOURCE:-}" ]; then
  ACTIVATE_DIR=$(CDPATH= cd "$(dirname "$BASH_SOURCE")" && pwd)
elif [ -n "${ZSH_VERSION:-}" ]; then
  ACTIVATE_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)
else
  ACTIVATE_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)
fi

ACTIVATE_ROOT=$(CDPATH= cd "$ACTIVATE_DIR/.." && pwd)
ACTIVATE_NODE="$ACTIVATE_ROOT/.cache/toolchain/node/bin"

if [ -x "$ACTIVATE_NODE/node" ]; then
  case ":$PATH:" in
    *":$ACTIVATE_NODE:"*) ;;
    *) PATH="$ACTIVATE_NODE:$PATH" ;;
  esac
  export PATH
  echo "bootstrap: using $("$ACTIVATE_NODE/node" --version) from $ACTIVATE_NODE"
else
  echo "bootstrap: no clone-local Node runtime; run ./scripts/bootstrap.sh first" >&2
  return 1 2>/dev/null || exit 1
fi
