import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const execFileAsync = promisify(execFile);

/**
 * Name of the user-installed Shortcuts workflow that creates/sends group
 * iMessages. Messages.app's AppleScript dictionary cannot create new group
 * threads (broken since ~macOS 10.14); the Shortcuts "Send Message" action can.
 * The comm-imessage-fast-setup skill walks the user through installing it.
 */
export const GROUP_SHORTCUT_NAME = 'MBG Group Send';

/** Delimiter between the recipients CSV and the message body in shortcut input. */
const DELIMITER = '|||MBG|||';

export async function groupShortcutInstalled(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('shortcuts', ['list']);
    return stdout.split('\n').some((l) => l.trim() === GROUP_SHORTCUT_NAME);
  } catch {
    return false; // shortcuts CLI missing (pre-Monterey) or errored
  }
}

/**
 * Send a message to multiple recipients via the installed shortcut, creating
 * the group thread if Messages doesn't have one. Input format is
 * "<comma-separated recipients>|||MBG|||<message>" passed as a temp file.
 * Throws (with the shortcut's stderr) if the run fails.
 */
export async function sendGroupViaShortcut(recipients: string[], text: string): Promise<void> {
  const safeText = text.split(DELIMITER).join(''); // never let the body forge the delimiter
  const input = `${recipients.join(',')}${DELIMITER}${safeText}`;
  const inputPath = join(tmpdir(), `mbg-group-send-${randomUUID()}.txt`);
  await writeFile(inputPath, input, 'utf8');
  try {
    await execFileAsync('shortcuts', ['run', GROUP_SHORTCUT_NAME, '-i', inputPath], {
      timeout: 30_000,
    });
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    throw new Error(
      `Shortcut "${GROUP_SHORTCUT_NAME}" failed: ${e.stderr?.trim() || e.message || 'unknown error'}`,
    );
  } finally {
    await unlink(inputPath).catch(() => {});
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
