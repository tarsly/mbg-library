#!/bin/bash
# comm-imessage-fast MCP server — environment check.
# As of v0.3.0 the server is a single self-contained bundle (dist/index.cjs,
# built on Node's node:sqlite) — there is NOTHING to install. This script only
# validates the environment and points at fixes.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "📨  comm-imessage-fast — environment check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# --- 1. Node.js 24+ (node:sqlite is built in from 24) ------------------------
NODE_MAJOR_REQUIRED=24

if ! command -v node >/dev/null 2>&1; then
  cat <<'EOF'

❌ Node.js is not installed.

Install Node.js LTS (≥ 24):

  brew install node        # macOS with Homebrew (fastest)

or download the LTS installer from https://nodejs.org
EOF
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/^v//')
NODE_MAJOR=${NODE_VERSION%%.*}
if [ "$NODE_MAJOR" -lt "$NODE_MAJOR_REQUIRED" ]; then
  cat <<EOF

❌ Node.js $NODE_MAJOR_REQUIRED+ required (found v$NODE_VERSION) — the server uses
   Node's built-in sqlite (node:sqlite).

  brew upgrade node        # macOS with Homebrew

or install the LTS from https://nodejs.org
EOF
  exit 1
fi
echo "   ✅ Node.js v$NODE_VERSION"

# --- 2. Bundle present --------------------------------------------------------
if [ -f "$SCRIPT_DIR/dist/index.cjs" ]; then
  echo "   ✅ Server bundle present (dist/index.cjs — no dependencies to install)"
else
  echo "   ❌ dist/index.cjs missing — reinstall/update the communications plugin."
  exit 1
fi

# --- 3. Full Disk Access ------------------------------------------------------
if sqlite3 "$HOME/Library/Messages/chat.db" "SELECT 1;" >/dev/null 2>&1; then
  echo "   ✅ Full Disk Access (chat.db readable from this terminal)"
else
  cat <<'EOF'
   ⚠️  chat.db not readable from THIS terminal — reading messages needs
       Full Disk Access. (Sending works without it.)

       System Settings → Privacy & Security → Full Disk Access, then add the
       app that RUNS Claude (the MCP server inherits its permission):
         - Claude Code in a terminal → that terminal app (Terminal, iTerm, Warp)
         - Claude Desktop / Cowork    → Claude.app
       Then FULLY quit that app (Cmd-Q) and reopen it.
EOF
fi

# --- 4. Optional group-send shortcut -------------------------------------------
if shortcuts list 2>/dev/null | grep -qx "MBG Group Send"; then
  echo "   ✅ 'MBG Group Send' shortcut installed (new group threads enabled)"
else
  echo "   ℹ️  'MBG Group Send' shortcut not installed — only needed to CREATE new"
  echo "      group threads. Install: open \"$SCRIPT_DIR/shortcuts/MBG Group Send.shortcut\""
fi

echo ""
echo "✅ Check complete. If anything changed, restart Claude to reload the MCP server."
echo ""
