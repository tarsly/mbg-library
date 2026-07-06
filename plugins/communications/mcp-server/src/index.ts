#!/usr/bin/env node
/**
 * comm-imessage-fast MCP server.
 * Self-contained: dist/index.cjs is a single esbuild bundle using Node's
 * built-in node:sqlite — no npm install, no native modules, no setup step.
 */

const CHAT_DB_PATH = process.env.CHAT_DB_PATH ?? '~/Library/Messages/chat.db';

const FDA_HINT = [
  'Cannot open ~/Library/Messages/chat.db — macOS Full Disk Access is required for reading messages.',
  '(Sending still works without it.)',
  '',
  'Fix: System Settings → Privacy & Security → Full Disk Access, then add the app',
  'that RUNS Claude (the MCP server inherits its permission):',
  '  - Claude Code in a terminal → add that terminal app (Terminal, iTerm, Warp)',
  '  - Claude Desktop / Cowork on this Mac → add Claude.app',
  'Then FULLY quit that app (Cmd-Q) and reopen it.',
  '',
  'Verify (from a terminal that has FDA):',
  '  sqlite3 ~/Library/Messages/chat.db "SELECT 1;"',
].join('\n');

function stderr(msg: string): void {
  process.stderr.write(`[comm-imessage-fast] ${msg}\n`);
}

async function main(): Promise<void> {
  // node:sqlite ships unflagged in Node 24+ (experimental in 22.5–23.3).
  try {
    await import('node:sqlite');
  } catch {
    stderr(
      [
        `This server needs Node.js 24+ (built-in node:sqlite); found ${process.versions.node}.`,
        '',
        'Install Node.js LTS:',
        '  brew install node        # macOS with Homebrew (fastest)',
        '  # or download the LTS installer from https://nodejs.org',
      ].join('\n'),
    );
    process.exit(1);
  }

  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const { ChatDb } = await import('./chat-db.js');
  const { registerTools } = await import('./tools.js');

  const chatDb = new ChatDb();
  try {
    chatDb.open(CHAT_DB_PATH);
  } catch (err) {
    // Do NOT exit: sending via AppleScript needs no chat.db access. Read tools
    // will fail per-call with this hint, which surfaces in-session instead of
    // as an invisible dead server.
    const msg = err instanceof Error ? err.message : String(err);
    const isPermission =
      msg.includes('unable to open') ||
      msg.includes('EPERM') ||
      msg.includes('EACCES') ||
      msg.includes('not permitted') ||
      msg.includes('CANTOPEN');
    const reason = isPermission ? FDA_HINT : `Failed to open chat.db: ${msg}`;
    chatDb.markUnavailable(reason);
    stderr(`chat.db unavailable — read tools disabled, send tools still work.\n${reason}`);
  }

  const server = new McpServer({ name: 'comm-imessage-fast', version: '0.3.0' });
  registerTools(server, chatDb);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  stderr('MCP server ready on stdio');

  const shutdown = (signal: string) => {
    stderr(`Received ${signal}, closing chat.db`);
    chatDb.close();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[comm-imessage-fast] fatal: ${msg}\n`);
  process.exit(1);
});
