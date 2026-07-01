import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
} from 'node:fs';

const STATE_DIR = join(homedir(), 'Library', 'Application Support', 'comm-imessage-fast');
const STATE_FILE = join(STATE_DIR, 'state.json');

interface State {
  lastRowId: number;
}

export function getMarker(): number | null {
  if (!existsSync(STATE_FILE)) return null;
  try {
    const raw = readFileSync(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as State;
    if (typeof parsed.lastRowId !== 'number' || !Number.isFinite(parsed.lastRowId)) {
      return null;
    }
    return parsed.lastRowId;
  } catch {
    return null;
  }
}

export function setMarker(rowId: number): void {
  ensureStateDir();
  const tmp = STATE_FILE + '.tmp';
  const payload: State = { lastRowId: rowId };
  writeFileSync(tmp, JSON.stringify(payload, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, STATE_FILE);
}

export function stateFilePath(): string {
  return STATE_FILE;
}

function ensureStateDir(): void {
  mkdirSync(dirname(STATE_FILE), { recursive: true, mode: 0o700 });
}
