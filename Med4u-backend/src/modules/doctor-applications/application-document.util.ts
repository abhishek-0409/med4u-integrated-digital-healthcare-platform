import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { createHash } from 'crypto';
import { sniffPrescriptionMime } from '../prescriptions/file-type.util';

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

/** Only these types are accepted. WebP is deliberately excluded: certificates are photos or PDFs. */
const ALLOWED: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'application/pdf': ['pdf'],
};

/** Extensions that must never be stored, even as the first of several (e.g. report.exe.pdf). */
const DANGEROUS_EXTENSIONS = new Set([
  'exe', 'dll', 'bat', 'cmd', 'com', 'msi', 'scr', 'ps1', 'sh', 'bash', 'js', 'mjs', 'jar', 'apk', 'vbs', 'wsf',
  'html', 'htm', 'svg', 'php', 'py', 'rb', 'pl', 'app', 'dmg', 'iso', 'lnk', 'hta', 'jse',
]);

export interface ValidatedDocument {
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  /** Safe for display and for the database. Never used for a path or an HTTP header. */
  displayName: string;
  extension: string;
}

const reject = (code: string, message: string) => new BadRequestException({ code, message });

/** Strips directories, control and unusual characters; keeps something recognisable for the reviewer. */
export function sanitizeFileName(raw: string | undefined): string {
  const base = (raw ?? '').replace(/\\/g, '/').split('/').pop() ?? '';
  const cleaned = base
    .normalize('NFKC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^A-Za-z0-9._ -]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.\s-]+/, '')
    .trim();
  return cleaned.slice(0, 80) || 'document';
}

/**
 * Validates an uploaded certificate from its CONTENT (magic bytes), size, and name. The client-supplied
 * Content-Type is ignored; the extension must agree with the detected type and must not look executable.
 */
export function validateDocument(
  file: { buffer: Buffer; size: number; originalname?: string; mimetype?: string } | undefined,
  label: string,
): ValidatedDocument {
  if (!file || file.size === 0 || !file.buffer?.length) {
    throw reject('DOCUMENT_REQUIRED', `${label} is required.`);
  }
  if (file.size > MAX_DOCUMENT_BYTES || file.buffer.length > MAX_DOCUMENT_BYTES) {
    throw new PayloadTooLargeException({
      code: 'DOCUMENT_TOO_LARGE',
      message: `${label} must be 5 MB or smaller.`,
    });
  }
  const sniffed = sniffPrescriptionMime(file.buffer);
  if (!sniffed || !(sniffed in ALLOWED)) {
    throw reject('UNSUPPORTED_DOCUMENT_TYPE', `${label} must be a PDF, JPEG or PNG file.`);
  }
  const parts = (file.originalname ?? '').split(/[\\/]/).pop()?.toLowerCase().split('.') ?? [];
  const extensions = parts.slice(1);
  if (extensions.some((e) => DANGEROUS_EXTENSIONS.has(e))) {
    throw reject('UNSAFE_DOCUMENT_NAME', `${label} has an unsupported file name.`);
  }
  const extension = extensions[extensions.length - 1] ?? '';
  if (!ALLOWED[sniffed].includes(extension)) {
    throw reject(
      'DOCUMENT_TYPE_MISMATCH',
      `${label}: the file extension does not match the file contents.`,
    );
  }
  return {
    buffer: file.buffer,
    mimeType: sniffed,
    sizeBytes: file.buffer.length,
    sha256: createHash('sha256').update(file.buffer).digest('hex'),
    displayName: sanitizeFileName(file.originalname),
    extension: ALLOWED[sniffed][0],
  };
}
