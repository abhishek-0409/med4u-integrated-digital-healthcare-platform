import { createCipheriv, createHash, randomBytes } from 'crypto';
import { MAGIC, PrescriptionCryptoError, buildKeyRing, decrypt, encrypt } from './prescription-crypto';

const OLD_SECRET = 'old-secret-old-secret-old-secret-1234';
const NEW_SECRET = 'new-secret-new-secret-new-secret-5678';
const plain = Buffer.from('%PDF-1.4 fake prescription bytes');

/** The exact format written before key versioning existed: iv | tag | ciphertext, key = sha256(secret). */
function legacyEncrypt(data: Buffer, secret: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), iv);
  const body = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

describe('prescription crypto', () => {
  const oldRing = buildKeyRing({ currentSecret: OLD_SECRET, currentId: 1 });
  const rotated = buildKeyRing({
    currentSecret: NEW_SECRET,
    currentId: 2,
    previousSecret: OLD_SECRET,
    previousId: 1,
  });

  it('round-trips and writes the v1 header with the key id', () => {
    const blob = encrypt(plain, oldRing);
    expect(blob.subarray(0, MAGIC.length).equals(MAGIC)).toBe(true);
    expect(blob[MAGIC.length]).toBe(1);
    expect(decrypt(blob, oldRing)).toMatchObject({ format: 'v1', keyId: 1 });
    expect(decrypt(blob, oldRing).plain.equals(plain)).toBe(true);
  });

  it('opens legacy headerless files written with the same key (existing records keep working)', () => {
    const legacy = legacyEncrypt(plain, OLD_SECRET);
    const result = decrypt(legacy, oldRing);
    expect(result.format).toBe('legacy');
    expect(result.plain.equals(plain)).toBe(true);
  });

  it('after rotation, still opens legacy files and old-key v1 files via the previous key', () => {
    const legacy = legacyEncrypt(plain, OLD_SECRET);
    expect(decrypt(legacy, rotated)).toMatchObject({ format: 'legacy', keyId: 1 });
    const v1Old = encrypt(plain, oldRing);
    expect(decrypt(v1Old, rotated)).toMatchObject({ format: 'v1', keyId: 1 });
    expect(decrypt(v1Old, rotated).plain.equals(plain)).toBe(true);
  });

  it('writes new files with the new key id, which the old ring cannot open', () => {
    const blob = encrypt(plain, rotated);
    expect(blob[MAGIC.length]).toBe(2);
    expect(decrypt(blob, rotated).plain.equals(plain)).toBe(true);
    expect(() => decrypt(blob, oldRing)).toThrow(PrescriptionCryptoError);
  });

  it('fails without the old key: replacing the key alone would lose legacy data', () => {
    const legacy = legacyEncrypt(plain, OLD_SECRET);
    const newOnly = buildKeyRing({ currentSecret: NEW_SECRET, currentId: 2 });
    expect(() => decrypt(legacy, newOnly)).toThrow(PrescriptionCryptoError);
  });

  it('detects tampering with ciphertext, tag and the key-id header', () => {
    const blob = encrypt(plain, rotated);
    const flipped = Buffer.from(blob);
    flipped[flipped.length - 1] ^= 0x01;
    expect(() => decrypt(flipped, rotated)).toThrow(/Authentication failed/);

    const headerSwap = Buffer.from(encrypt(plain, oldRing));
    headerSwap[MAGIC.length] = 2; // claim it was written by key 2
    expect(() => decrypt(headerSwap, rotated)).toThrow(PrescriptionCryptoError);

    const unknownId = Buffer.from(blob);
    unknownId[MAGIC.length] = 99;
    expect(() => decrypt(unknownId, rotated)).toThrow(/not configured/);
  });

  it('rejects unsafe key-ring configuration', () => {
    expect(() => buildKeyRing({ currentSecret: NEW_SECRET, currentId: 0 })).toThrow();
    expect(() => buildKeyRing({ currentSecret: NEW_SECRET, currentId: 2, previousSecret: NEW_SECRET, previousId: 1 })).toThrow(/differ/);
    expect(() => buildKeyRing({ currentSecret: NEW_SECRET, currentId: 2, previousSecret: OLD_SECRET, previousId: 2 })).toThrow();
  });

  it('uses a fresh IV for every encryption', () => {
    expect(encrypt(plain, oldRing).equals(encrypt(plain, oldRing))).toBe(false);
  });
});
