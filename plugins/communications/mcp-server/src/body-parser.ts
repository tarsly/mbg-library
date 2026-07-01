/**
 * Parses the attributedBody NSAttributedString binary blob.
 * macOS Ventura+ stores iMessage text in this column instead of plain text.
 */
export function extractText(
  attributedBody: Buffer | null,
  plainText: string | null,
): string {
  if (plainText && plainText.trim().length > 0) {
    return plainText;
  }
  if (!attributedBody || attributedBody.length === 0) {
    return '';
  }
  return parseAttributedBody(attributedBody);
}

function parseAttributedBody(buf: Buffer): string {
  const nsStringMarker = Buffer.from('NSString');
  const idx = buf.indexOf(nsStringMarker);

  if (idx !== -1) {
    const searchStart = idx + nsStringMarker.length;
    for (let i = searchStart; i < Math.min(searchStart + 32, buf.length - 1); i++) {
      const possibleLen = buf[i];
      if (possibleLen > 0 && possibleLen < 0x80 && i + 1 + possibleLen <= buf.length) {
        const candidate = buf.subarray(i + 1, i + 1 + possibleLen).toString('utf-8');
        if (isPrintable(candidate) && candidate.length >= 1) {
          return candidate;
        }
      }
      if (possibleLen === 0x81 && i + 2 < buf.length) {
        const actualLen = buf[i + 1];
        if (actualLen > 0 && i + 2 + actualLen <= buf.length) {
          const candidate = buf.subarray(i + 2, i + 2 + actualLen).toString('utf-8');
          if (isPrintable(candidate) && candidate.length >= 1) {
            return candidate;
          }
        }
      }
    }
  }
  return extractLongestPrintableRun(buf, 20);
}

function extractLongestPrintableRun(buf: Buffer, startOffset: number): string {
  const str = buf.subarray(startOffset).toString('utf-8');
  let longest = '';
  let current = '';
  for (const char of str) {
    if (isPrintableChar(char)) {
      current += char;
    } else {
      if (current.length > longest.length) longest = current;
      current = '';
    }
  }
  if (current.length > longest.length) longest = current;
  return longest.trim();
}

function isPrintable(str: string): boolean {
  for (const char of str) {
    if (!isPrintableChar(char)) return false;
  }
  return true;
}

function isPrintableChar(char: string): boolean {
  const code = char.codePointAt(0);
  if (code === undefined) return false;
  if (code <= 0x08) return false;
  if (code >= 0x0e && code <= 0x1f) return false;
  if (code === 0x7f) return false;
  return true;
}
