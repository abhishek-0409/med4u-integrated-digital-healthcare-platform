import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import {
  KeyRing,
  PrescriptionCryptoError,
  buildKeyRing,
  decrypt,
  encrypt,
} from '../prescriptions/prescription-crypto';

const KEY_PATTERN = /^[a-f0-9]{32}$/;

/**
 * Private, encrypted file store for doctor-application documents (licences and certificates).
 * Same AES-256-GCM, key-versioned format as prescriptions, but with its OWN key (DOCUMENT_ENCRYPTION_KEY) and
 * directory, so rotating or losing one never affects the other. The directory is never served statically:
 * the only way to read a file is through an authorised API call. Without a key, uploads fail closed.
 */
@Injectable()
export class DoctorDocumentStorageService {
  private readonly logger = new Logger(DoctorDocumentStorageService.name);
  private readonly dir: string;
  private readonly ring: KeyRing | null;

  constructor(config: ConfigService) {
    this.dir = resolve(
      config.get<string>('DOCTOR_DOCUMENT_STORAGE_DIR') ?? join(process.cwd(), 'storage', 'doctor-documents'),
    );
    const secret = config.get<string>('DOCUMENT_ENCRYPTION_KEY');
    this.ring =
      secret && secret.length >= 32
        ? buildKeyRing({
            currentSecret: secret,
            currentId: Number(config.get('DOCUMENT_ENCRYPTION_KEY_ID') ?? 1),
          })
        : null;
    if (!this.ring) {
      this.logger.warn('DOCUMENT_ENCRYPTION_KEY is not set: doctor-application uploads are disabled.');
    }
  }

  get available(): boolean {
    return this.ring !== null;
  }

  /** Encrypts and stores a file; returns its random storage key. */
  async save(plain: Buffer): Promise<string> {
    const ring = this.requireRing();
    const storageKey = randomBytes(16).toString('hex');
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.pathFor(storageKey), encrypt(plain, ring), { flag: 'wx', mode: 0o600 });
    return storageKey;
  }

  async read(storageKey: string): Promise<Buffer> {
    const ring = this.requireRing();
    const raw = await readFile(this.pathFor(storageKey));
    try {
      return decrypt(raw, ring).plain;
    } catch (err) {
      if (err instanceof PrescriptionCryptoError) {
        this.logger.error(`Cannot decrypt application document ${storageKey.slice(0, 6)}…`);
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
        code: 'DOCUMENT_STORAGE_UNAVAILABLE',
        message: 'Document upload is temporarily unavailable.',
      });
    }
    return this.ring;
  }
}
