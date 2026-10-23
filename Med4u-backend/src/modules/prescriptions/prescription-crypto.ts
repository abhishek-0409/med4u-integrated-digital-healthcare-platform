import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Prescription file encryption with key versioning, so ENCRYPTION_KEY can be rotated without losing records.
 *
 * Formats:
 *  - v1 (written now):  "M4E" 0x01 | keyId (1 byte) | iv (12) | auth tag (16) | ciphertext.
 *    The 5-byte header is bound into the GCM tag as additional authenticated data, so the key id cannot
 *    be altered without detection.
 *  - legacy (written before rotation support): iv (12) | auth tag (16) | ciphertext, no header. Decrypted
 *    by trying the current key, then the previous key.
 *
 * Key derivation is unchanged (SHA-256 of the configured secret) so existing files stay readable.
 */

export const MAGIC = Buffer.from([0x4d, 0x34, 0x45, 0x01]); // "M4E" + format version 1
const HEADER_BYTES = MAGIC.length + 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface RingKey {
  /** 1..255. Id 0 is reserved for "legacy, no id". */
  id: number;
  key: Buffer;
}

export interface KeyRing {
  /** Used for every new write. */
  current: RingKey;
  /** Still accepted for reads (and re-encryption). */
  previous?: RingKey;
}

export class PrescriptionCryptoError extends Error {}

export const deriveKey = (secret: string): Buffer => createHash('sha256').update(secret).digest();

/** Same-key check for ring construction: a previous key equal to the current one is a misconfiguration. */
export function buildKeyRing(opts: {
  currentSecret: string;
  currentId: number;
  previousSecret?: string;
  previousId?: number;
}): KeyRing {
  if (!Number.isInteger(opts.currentId) || opts.currentId < 1 || opts.currentId > 255) {
    throw new PrescriptionCryptoError('ENCRYPTION_KEY_ID must be an integer from 1 to 255');
  }
  const current: RingKey = { id: opts.currentId, key: deriveKey(opts.currentSecret) };
  if (!opts.previousSecret) return { current };
  const previousId = opts.previousId ?? 0;
  if (!Number.isInteger(previousId) || previousId < 0 || previousId > 255 || previousId === current.id) {
    throw new PrescriptionCryptoError('ENCRYPTION_KEY_PREVIOUS_ID must differ from ENCRYPTION_KEY_ID (0 = legacy key)');
  }
  const previous: RingKey = { id: previousId, key: deriveKey(opts.previousSecret) };
  if (previous.key.equals(current.key)) {
    throw new PrescriptionCryptoError('ENCRYPTION_KEY_PREVIOUS must differ from ENCRYPTION_KEY');
  }
  return { current, previous };
}

export function encrypt(plain: Buffer, ring: KeyRing): Buffer {
  const header = Buffer.concat([MAGIC, Buffer.from([ring.current.id])]);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', ring.current.key, iv);
  cipher.setAAD(header);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([header, iv, cipher.getAuthTag(), body]);
}

const hasHeader = (raw: Buffer): boolean => raw.length > HEADER_BYTES && raw.subarray(0, MAGIC.length).equals(MAGIC);

function open(raw: Buffer, key: Buffer, aad?: Buffer): Buffer {
  const offset = aad ? HEADER_BYTES : 0;
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(offset, offset + IV_BYTES));
  decipher.setAuthTag(raw.subarray(offset + IV_BYTES, offset + IV_BYTES + TAG_BYTES));
  if (aad) decipher.setAAD(aad);
  return Buffer.concat([decipher.update(raw.subarray(offset + IV_BYTES + TAG_BYTES)), decipher.final()]);
}

export interface Decrypted {
  plain: Buffer;
  /** Which format/key opened it: 'legacy' files report the ring key that worked. */
  format: 'v1' | 'legacy';
  keyId: number;
}

export function decrypt(raw: Buffer, ring: KeyRing): Decrypted {
  const keys = [ring.current, ...(ring.previous ? [ring.previous] : [])];

  if (hasHeader(raw)) {
    const header = raw.subarray(0, HEADER_BYTES);
    const keyId = raw[MAGIC.length];
    const key = keys.find((k) => k.id === keyId);
    if (!key) throw new PrescriptionCryptoError(`File was encrypted with key id ${keyId}, which is not configured`);
    try {
      return { plain: open(raw, key.key, header), format: 'v1', keyId };
    } catch {
      throw new PrescriptionCryptoError('Authentication failed (wrong key or modified file)');
    }
  }

  // Legacy: no header, so there is no key id; try each configured key.
  for (const k of keys) {
    try {
      return { plain: open(raw, k.key), format: 'legacy', keyId: k.id };
    } catch {
      // try the next key
    }
  }
  throw new PrescriptionCryptoError('Authentication failed (no configured key opens this file)');
}
