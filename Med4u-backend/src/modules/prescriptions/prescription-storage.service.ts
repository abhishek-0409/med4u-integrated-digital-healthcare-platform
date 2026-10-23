import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { KeyRing, PrescriptionCryptoError, buildKeyRing, decrypt, encrypt } from './prescription-crypto';

const KEY_PATTERN = /^[a-f0-9]{32}$/;

/**
 * Private file store for prescription uploads. Files are AES-256-GCM encrypted at rest (versioned format,
 * see prescription-crypto.ts, so the key can be rotated) and addressed by
 * a random key; the directory is not served by the web server, so the only way to read a file is through
 * an authorized API call. For production, point this at encrypted object storage with the same contract.
 */
@Injectable()
export class PrescriptionStorageService {
  private readonly logger = new Logger(PrescriptionStorageService.name);
  private readonly dir: string;
  private readonly ring: KeyRing | null;

  constructor(config: ConfigService) {
    this.dir = resolve(
      config.get<string>('PRESCRIPTION_STORAGE_DIR') ??
        join(process.cwd(), 'storage', 'prescriptions'),
    );
    const secret = config.get<string>('ENCRYPTION_KEY');
    const previous = config.get<string>('ENCRYPTION_KEY_PREVIOUS');
    this.ring =
      secret && secret.length >= 32
        ? buildKeyRing({
            currentSecret: secret,
            currentId: Number(config.get('ENCRYPTION_KEY_ID') ?? 1),
            previousSecret: previous && previous.length >= 32 ? previous : undefined,
            previousId: Number(config.get('ENCRYPTION_KEY_PREVIOUS_ID') ?? 0),
          })
        : null;
    if (!this.ring) {
      this.logger.warn('ENCRYPTION_KEY is not set: prescription uploads are disabled.');
    }
  }

  /** Encrypts and stores a file; returns its storage key. */
  async save(plain: Buffer): Promise<string> {
    const ring = this.requireRing();
    const storageKey = randomBytes(16).toString('hex');
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.pathFor(storageKey), encrypt(plain, ring), {
      flag: 'wx',
      mode: 0o600,
    });
    return storageKey;
  }

  async read(storageKey: string): Promise<Buffer> {
    const ring = this.requireRing();
    const raw = await readFile(this.pathFor(storageKey));
    try {
      return decrypt(raw, ring).plain;
    } catch (err) {
      if (err instanceof PrescriptionCryptoError) {
        this.logger.error(`Cannot decrypt prescription file ${storageKey.slice(0, 6)}…: ${err.message}`);
      }
      throw err;
    }
  }

  async remove(storageKey: string): Promise<void> {
    await rm(this.pathFor(storageKey), { force: true });
  }

  private pathFor(storageKey: string): string {
    // Keys are generated here, but never build a path from anything unvalidated.
    if (!KEY_PATTERN.test(storageKey)) throw new Error('Invalid storage key');
    return join(this.dir, storageKey);
  }

  private requireRing(): KeyRing {
    if (!this.ring) {
      throw new ServiceUnavailableException({
        code: 'PRESCRIPTION_STORAGE_UNAVAILABLE',
        message: 'Prescription upload is temporarily unavailable.',
      });
    }
    return this.ring;
  }
}
