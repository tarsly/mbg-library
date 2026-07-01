/**
 * Parses the attributedBody NSAttributedString binary blob.
 * macOS Ventura+ stores iMessage text in this column instead of plain text.
 */
export function extractText(attributedBody, plainText) {
    if (plainText && plainText.trim().length > 0) {
        return plainText;
    }
    if (!attributedBody || attributedBody.length === 0) {
        return '';
    }
    return parseAttributedBody(attributedBody);
}
/** Minimum length for a candidate to be considered real text (guards against noise). */
const MIN_CANDIDATE_LENGTH = 2;
function parseAttributedBody(buf) {
    const nsStringMarker = Buffer.from('NSString');
    const idx = buf.indexOf(nsStringMarker);
    if (idx !== -1) {
        const searchStart = idx + nsStringMarker.length;
        for (let i = searchStart; i < Math.min(searchStart + 32, buf.length - 1); i++) {
            const possibleLen = buf[i];
            if (possibleLen > 0 && possibleLen < 0x80 && i + 1 + possibleLen <= buf.length) {
                const candidate = decodeStrictUtf8(buf.subarray(i + 1, i + 1 + possibleLen));
                if (isValidCandidate(candidate))
                    return candidate;
            }
            if (possibleLen === 0x81 && i + 2 < buf.length) {
                const actualLen = buf[i + 1];
                if (actualLen > 0 && i + 2 + actualLen <= buf.length) {
                    const candidate = decodeStrictUtf8(buf.subarray(i + 2, i + 2 + actualLen));
                    if (isValidCandidate(candidate))
                        return candidate;
                }
            }
        }
    }
    // No fallback scan — that path historically emitted noise (see Phase 4 findings).
    // If NSString parsing fails, the message has no extractable text; the adapter
    // filters rows with empty content and no attachments.
    return '';
}
/**
 * Decode bytes as UTF-8. If the sequence is invalid, Node substitutes U+FFFD;
 * we return an empty string in that case so isValidCandidate rejects it.
 */
function decodeStrictUtf8(buf) {
    const decoded = buf.toString('utf-8');
    return decoded.includes('�') ? '' : decoded;
}
function isValidCandidate(str) {
    if (str.length < MIN_CANDIDATE_LENGTH)
        return false;
    for (const char of str) {
        if (!isPrintableChar(char))
            return false;
    }
    return true;
}
function isPrintableChar(char) {
    const code = char.codePointAt(0);
    if (code === undefined)
        return false;
    if (code === 0xfffd)
        return false; // Unicode replacement — signals invalid UTF-8
    if (code <= 0x08)
        return false;
    if (code >= 0x0e && code <= 0x1f)
        return false;
    if (code === 0x7f)
        return false;
    return true;
}
