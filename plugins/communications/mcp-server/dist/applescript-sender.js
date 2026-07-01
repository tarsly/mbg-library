import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
/**
 * Sends an iMessage via AppleScript using Messages.app.
 * Uses execFile (not exec) to avoid shell injection.
 */
export async function sendMessage(chatGuid, text) {
    const escapedText = escapeAppleScript(text);
    const escapedGuid = escapeAppleScript(chatGuid);
    const script = `tell application "Messages" to send "${escapedText}" to chat id "${escapedGuid}"`;
    await execFileAsync('osascript', ['-e', script]);
}
/**
 * Sends an iMessage to a recipient (phone or email) rather than an existing chat GUID.
 * Tries modern participant syntax first, falls back to legacy buddy syntax.
 */
export async function sendToRecipient(recipient, text) {
    const escapedText = escapeAppleScript(text);
    const escapedRecipient = escapeAppleScript(recipient);
    const modernScript = [
        'tell application "Messages"',
        `  set targetBuddy to participant "${escapedRecipient}" of account 1`,
        `  send "${escapedText}" to targetBuddy`,
        'end tell',
    ].join('\n');
    const legacyScript = [
        'tell application "Messages"',
        `  set targetService to 1st account whose service type = iMessage`,
        `  set targetBuddy to participant "${escapedRecipient}" of targetService`,
        `  send "${escapedText}" to targetBuddy`,
        'end tell',
    ].join('\n');
    try {
        await execFileAsync('osascript', ['-e', modernScript]);
    }
    catch {
        await execFileAsync('osascript', ['-e', legacyScript]);
    }
}
function escapeAppleScript(str) {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
