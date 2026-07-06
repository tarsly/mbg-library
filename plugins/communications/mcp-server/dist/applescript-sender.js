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
 * Targets the iMessage service explicitly first: "account 1" is whichever account
 * sorts first, often the SMS/RCS relay — that sends green through the user's
 * iPhone and fails outright when the phone is unreachable. Falls back to the
 * first account only for recipients not reachable over iMessage.
 */
export async function sendToRecipient(recipient, text) {
    const escapedText = escapeAppleScript(text);
    const escapedRecipient = escapeAppleScript(recipient);
    const imessageScript = [
        'tell application "Messages"',
        `  set targetService to 1st account whose service type = iMessage`,
        `  set targetBuddy to participant "${escapedRecipient}" of targetService`,
        `  send "${escapedText}" to targetBuddy`,
        'end tell',
    ].join('\n');
    const anyAccountScript = [
        'tell application "Messages"',
        `  set targetBuddy to participant "${escapedRecipient}" of account 1`,
        `  send "${escapedText}" to targetBuddy`,
        'end tell',
    ].join('\n');
    try {
        await execFileAsync('osascript', ['-e', imessageScript]);
    }
    catch {
        await execFileAsync('osascript', ['-e', anyAccountScript]);
    }
}
function escapeAppleScript(str) {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
