#!/bin/bash
# comm-imessage-fast MCP server — one-time setup
# Installs runtime deps only (--omit=dev). dist/ ships pre-built in the repo.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "📨  comm-imessage-fast — MCP server setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# --- 1. Node.js check --------------------------------------------------------
NODE_MAJOR_REQUIRED=20

if ! command -v node >/dev/null 2>&1; then
  cat <<'EOF'

❌ Node.js is not installed.

Install Node.js LTS (≥ 20):

  brew install node        # macOS with Homebrew (fastest)

or download the LTS installer from https://nodejs.org

After installing, re-run this setup script.
EOF
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/^v//')
NODE_MAJOR=${NODE_VERSION%%.*}
if [ "$NODE_MAJOR" -lt "$NODE_MAJOR_REQUIRED" ]; then
  cat <<EOF

❌ Node.js $NODE_MAJOR_REQUIRED+ required (found v$NODE_VERSION).

Upgrade Node.js:

  brew upgrade node        # macOS with Homebrew

or install the LTS from https://nodejs.org

After upgrading, re-run this setup script.
EOF
  exit 1
fi
echo "   ✅ Node.js v$NODE_VERSION"

# --- 2. npm install (runtime deps only) -------------------------------------
if ! command -v npm >/dev/null 2>&1; then
  echo "   ❌ npm not found (should ship with Node.js). Reinstall Node."
  exit 1
fi

echo "   📦 Installing dependencies (runtime only)…"
npm install --omit=dev --no-audit --no-fund --silent
echo "   ✅ Dependencies installed"

# --- 3. Full Disk Access reminder -------------------------------------------
cat <<'EOF'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Next step — grant Full Disk Access
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The MCP server needs to read ~/Library/Messages/chat.db, which requires
Full Disk Access on macOS.

1. System Settings → Privacy & Security → Full Disk Access
2. Add your terminal app (Terminal, iTerm, Warp) — whichever launches Claude Code
3. Quit and reopen that terminal so the permission takes effect

Verify:
  sqlite3 ~/Library/Messages/chat.db "SELECT 1;"

Then restart Claude Code so the MCP server can boot.
EOF

echo ""
echo "✅ Setup complete."
echo ""
