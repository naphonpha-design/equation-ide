export type FileEncoding = "utf-8" | "tis-620";

/**
 * Thai code points map onto TIS-620 bytes by a constant offset: U+0E01 is
 * 0xA1, U+0E02 is 0xA2, and so on through U+0E5B.
 */
const THAI_FIRST = 0x0e01;
const THAI_LAST = 0x0e5b;
const THAI_BYTE_OFFSET = 0x0d60;

/** Decodes file bytes, guessing the encoding when it is not given.
 *
 *  Legacy `.eqs` files carry Thai comments in TIS-620, which is what Windows
 *  Thai locale writes. Reading those as UTF-8 turns every comment into noise,
 *  so anything that is not valid UTF-8 is read as TIS-620 instead. */
export function decodeSource(
  bytes: Uint8Array,
  encoding?: FileEncoding,
): { text: string; encoding: FileEncoding } {
  if (encoding === "tis-620") {
    return { text: decodeTis620(bytes), encoding };
  }
  if (encoding === "utf-8") {
    return { text: new TextDecoder("utf-8").decode(bytes), encoding };
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { text, encoding: "utf-8" };
  } catch {
    return { text: decodeTis620(bytes), encoding: "tis-620" };
  }
}

export function encodeSource(text: string, encoding: FileEncoding): Uint8Array {
  if (encoding === "utf-8") return new TextEncoder().encode(text);
  return encodeTis620(text);
}

function decodeTis620(bytes: Uint8Array): string {
  // windows-874 is TIS-620 plus a handful of punctuation characters, and is
  // the only Thai legacy encoding browsers are required to support.
  return new TextDecoder("windows-874").decode(bytes);
}

/** Characters that TIS-620 cannot represent become '?', matching what Windows
 *  does when saving. */
function encodeTis620(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) {
      bytes[i] = code;
    } else if (code >= THAI_FIRST && code <= THAI_LAST) {
      bytes[i] = code - THAI_BYTE_OFFSET;
    } else {
      bytes[i] = 0x3f; // '?'
    }
  }
  return bytes;
}

/** True when the text contains characters that TIS-620 would replace with '?'. */
export function hasCharactersTis620CannotStore(text: string): boolean {
  for (const character of text) {
    const code = character.codePointAt(0)!;
    if (code < 0x80) continue;
    if (code >= THAI_FIRST && code <= THAI_LAST) continue;
    return true;
  }
  return false;
}
