/** DOM-free base64url + UTF-8 helpers (core runs in Node, workers and the extension SW). */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const LOOKUP = new Map<string, number>([...ALPHABET].map((c, i) => [c, i]));

export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] as number;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += ALPHABET[b0 >> 2];
    out += ALPHABET[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 !== undefined) out += ALPHABET[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 !== undefined) out += ALPHABET[b2 & 63];
  }
  return out;
}

export function base64UrlToBytes(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c = [0, 1, 2, 3].map((k) => {
      const ch = clean[i + k];
      if (ch === undefined) return -1;
      const v = LOOKUP.get(ch);
      if (v === undefined) throw new Error('Invalid base64url character');
      return v;
    }) as [number, number, number, number];
    out[o++] = (c[0] << 2) | (c[1] >> 4);
    if (c[2] >= 0) out[o++] = ((c[1] & 15) << 4) | (c[2] >> 2);
    if (c[3] >= 0) out[o++] = ((c[2] & 3) << 6) | c[3];
  }
  return out.subarray(0, o);
}

export function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 63),
        0x80 | ((cp >> 6) & 63),
        0x80 | (cp & 63),
      );
  }
  return Uint8Array.from(out);
}

export function utf8Decode(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length;) {
    const c = b[i] as number;
    let cp: number;
    if (c < 0x80) {
      cp = c;
      i += 1;
    } else if (c < 0xe0) {
      cp = ((c & 31) << 6) | ((b[i + 1] as number) & 63);
      i += 2;
    } else if (c < 0xf0) {
      cp = ((c & 15) << 12) | (((b[i + 1] as number) & 63) << 6) | ((b[i + 2] as number) & 63);
      i += 3;
    } else {
      cp =
        ((c & 7) << 18) |
        (((b[i + 1] as number) & 63) << 12) |
        (((b[i + 2] as number) & 63) << 6) |
        ((b[i + 3] as number) & 63);
      i += 4;
    }
    out += String.fromCodePoint(cp);
  }
  return out;
}

/** FNV-1a 32-bit hash. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
