import { containsAccount, hashAccount, maskAccount, maskAsTyped, normaliseAccount, protectAccount, sha256Hex, validateAccount } from './account';

describe('sha256Hex (FIPS 180-4 test vectors)', () => {
  it('hashes the empty string', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
  it('hashes "abc"', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('hashes a two-block message', () => {
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });
  it('hashes exactly 55 and 56 bytes (padding boundary) and UTF-8 text', () => {
    expect(sha256Hex('a'.repeat(55))).toBe('9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318');
    expect(sha256Hex('a'.repeat(56))).toBe('b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a');
    expect(sha256Hex('é')).toHaveLength(64);
  });
  it('matches the platform SubtleCrypto when available', async () => {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return;
    const msg = 'pcg:v1:GB29NWBK60161331926819';
    const buf = await subtle.digest('SHA-256', new TextEncoder().encode(msg));
    const hex = Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
    expect(sha256Hex(msg)).toBe(hex);
  });
});

describe('account masking and hashing', () => {
  it('normalises spaces, dashes and case', () => {
    expect(normaliseAccount(' gb29 nwbk-6016.1331/9268 19 ')).toBe('GB29NWBK60161331926819');
  });

  it('masks to four bullets and the last four characters only', () => {
    expect(maskAccount('20-71-44 61552018')).toBe('•••• 2018');
    expect(maskAccount('NL20 DEMO 0417 7365 12')).toBe('•••• 6512');
    expect(maskAccount('')).toBe('');
    expect(maskAccount('1234')).toBe('••••');
  });

  it('shows every character but the last four as bullets while typing', () => {
    expect(maskAsTyped('1234567890')).toBe('•••• ••78 90');
    expect(maskAsTyped('123')).toBe('•••');
  });

  it('hashes the same account the same way however it is typed, and different accounts differently', () => {
    expect(hashAccount('40-21 55 83991706')).toBe(hashAccount('40215583991706'));
    expect(hashAccount('40215583991706')).not.toBe(hashAccount('40215583991707'));
    expect(hashAccount('40215583991706')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('protectAccount returns only the masked form and a hash that do not contain the number', () => {
    const acct = 'GB29 NWBK 6016 1331 9268 19';
    const p = protectAccount(acct);
    expect(Object.keys(p).sort()).toEqual(['hash', 'masked']);
    expect(containsAccount(p.masked, acct)).toBe(false);
    expect(containsAccount(p.hash, acct)).toBe(false);
    expect(p.masked).toBe('•••• 6819');
  });

  it('validates length and characters', () => {
    expect(validateAccount('')).toMatch(/Enter/);
    expect(validateAccount('12345')).toMatch(/at least 6/);
    expect(validateAccount('1'.repeat(35))).toMatch(/at most 34/);
    expect(validateAccount('12#4567')).toMatch(/letters and digits/);
    expect(validateAccount('20-71-44 61552018')).toBeNull();
  });
});
