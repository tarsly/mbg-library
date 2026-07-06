#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = join(__dirname, '..');
const NODE_MODULES = join(SERVER_ROOT, 'node_modules');
const SETUP_SCRIPT = join(SERVER_ROOT, 'setup.sh');
const CHAT_DB_PATH = process.env.CHAT_DB_PATH ?? '~/Library/Messages/chat.db';
const NODE_MAJOR_REQUIRED = 20;
const FDA_HINT = [
    'Cannot open ~/Library/Messages/chat.db — macOS Full Disk Access is required.',
    '',
    'Fix:',
    '  System Settings → Privacy & Security → Full Disk Access → add your terminal app (e.g. Terminal, iTerm, Warp)',
    '  Then quit and reopen the terminal so the permission takes effect.',
    '',
    'Verify:',
    '  sqlite3 ~/Library/Messages/chat.db "SELECT 1;"',
].join('\n');
function stderr(msg) {
    process.stderr.write(`[comm-imessage-fast] ${msg}\n`);
}
function preflightNodeVersion() {
    const match = process.versions.node.match(/^(\d+)/);
    const major = match ? parseInt(match[1], 10) : 0;
    if (major < NODE_MAJOR_REQUIRED) {
        stderr([
            `Node.js ${NODE_MAJOR_REQUIRED}+ required (found ${process.versions.node}).`,
            '',
            'Install Node.js LTS (≥ 20):',
            '  brew install node        # macOS with Homebrew (fastest)',
            '  # or download the LTS installer from https://nodejs.org',
            '',
            `Then re-run setup: ${SETUP_SCRIPT}`,
        ].join('\n'));
        process.exit(1);
    }
}
function preflightDeps() {
    if (!existsSync(NODE_MODULES)) {
        stderr([
            `Dependencies not installed. Missing ${NODE_MODULES}.`,
            '',
            'One-time setup:',
            `  ${SETUP_SCRIPT}`,
            '',
            'If Node.js is not installed, first:',
            '  brew install node        # macOS with Homebrew (fastest)',
            '  # or download the LTS installer from https://nodejs.org (Node ≥ 20)',
        ].join('\n'));
        process.exit(1);
    }
}
async function main() {
    preflightNodeVersion();
    preflightDeps();
    // Deferred imports so a missing node_modules produces the setup hint above,
    // not a raw ERR_MODULE_NOT_FOUND stack.
    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
    const { ChatDb } = await import('./chat-db.js');
    const { registerTools } = await import('./tools.js');
    const chatDb = new ChatDb();
    try {
        chatDb.open(CHAT_DB_PATH);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isPermission = msg.includes('unable to open') ||
            msg.includes('EPERM') ||
            msg.includes('EACCES') ||
            msg.includes('not permitted') ||
            msg.includes('SQLITE_CANTOPEN');
        stderr(isPermission ? FDA_HINT : `Failed to open chat.db: ${msg}`);
        process.exit(1);
    }
    const server = new McpServer({ name: 'comm-imessage-fast', version: '0.2.0' });
    registerTools(server, chatDb);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    stderr('MCP server ready on stdio');
    const shutdown = (signal) => {
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
