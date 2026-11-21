/**
 * Account details. The app never stores a full account number: forms take it, show it masked, compute a SHA-256
 * hash in the browser, and only the masked form and the hash are written. The hash is for change detection and
 * "same account as another supplier" checks; it is not encryption (see README, Known limits).
 */
import { limits } from '../model';

/** Upper-case letters and digits only (spaces, dashes and dots removed), as banks print IBANs in groups. */
export function normaliseAccount(raw: string): string {
  return raw.replace(/[\s\-./]/g, '').toUpperCase();
}

/** Null when the account looks usable, otherwise a message for the form. */
export function validateAccount(raw: string): string | null {
  const n = normaliseAccount(raw);
  if (!n) return 'Enter the new account number or IBAN.';
  if (!/^[A-Z0-9]+$/.test(n)) return 'Use letters and digits only.';
  if (n.length < limits.account.min) return `An account number has at least ${limits.account.min} characters.`;
  if (n.length > limits.account.max) return `An account number has at most ${limits.account.max} characters.`;
  return null;
}

/** "•••• 4821": four bullets and the last four characters. Short input masks everything it can. */
export function maskAccount(raw: string): string {
  const n = normaliseAccount(raw);
  if (!n) return '';
  const tail = n.length > 4 ? n.slice(-4) : '';
  return `•••• ${tail}`.trimEnd();
}

/** The live preview while typing: every character but the last four shown as a bullet, in groups of four. */
export function maskAsTyped(raw: string): string {
  const n = normaliseAccount(raw);
  const shown = n.length > 4 ? '•'.repeat(n.length - 4) + n.slice(-4) : '•'.repeat(n.length);
  return shown.replace(/(.{4})(?=.)/g, '$1 ');
}

/* ------------------------------------------------------------------ SHA-256 (FIPS 180-4), pure and synchronous */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256 of a UTF-8 string as 64 lower-case hex characters. Synchronous so forms can flag shared accounts live. */
export function sha256Hex(message: string): string {
  const bytes = new TextEncoder().encode(message);
  const bitLen = bytes.length * 8;
  const total = Math.ceil((bytes.length + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(total - 4, bitLen >>> 0);

  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, '0')).join('');
}

/** The stored hash of an account: SHA-256 of the normalised account with a fixed app prefix. */
export function hashAccount(raw: string): string {
  return sha256Hex(`pcg:v1:${normaliseAccount(raw)}`);
}

/** Masked + hash: the only two things about an account that are ever stored. */
export function protectAccount(raw: string): { masked: string; hash: string } {
  return { masked: maskAccount(raw), hash: hashAccount(raw) };
}

/** True when `s` contains `digits` (a run of 6+ account characters) anywhere: used to prove nothing leaks. */
export function containsAccount(s: string, account: string): boolean {
  const n = normaliseAccount(account);
  return normaliseAccount(s).includes(n);
}
