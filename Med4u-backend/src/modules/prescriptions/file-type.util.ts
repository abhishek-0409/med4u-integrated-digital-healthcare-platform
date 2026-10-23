export type PrescriptionMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

/**
 * Identifies an upload from its content, never from the client-supplied name or Content-Type.
 * Returns null for anything that is not a JPEG, PNG, WebP or PDF.
 */
export function sniffPrescriptionMime(buf: Buffer): PrescriptionMime | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}
