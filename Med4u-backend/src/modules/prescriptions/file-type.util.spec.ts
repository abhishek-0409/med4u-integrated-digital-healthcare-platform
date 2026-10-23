import { sniffPrescriptionMime } from './file-type.util';

describe('sniffPrescriptionMime', () => {
  it('recognises supported formats by content', () => {
    expect(sniffPrescriptionMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('image/jpeg');
    expect(
      sniffPrescriptionMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])),
    ).toBe('image/png');
    expect(sniffPrescriptionMime(Buffer.from('%PDF-1.7\n'))).toBe('application/pdf');
    expect(
      sniffPrescriptionMime(
        Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]),
      ),
    ).toBe('image/webp');
  });

  it('rejects scripts, HTML, executables and truncated data regardless of their name', () => {
    expect(sniffPrescriptionMime(Buffer.from('<html><script>alert(1)</script>'))).toBeNull();
    expect(sniffPrescriptionMime(Buffer.from('MZ\x90\x00'))).toBeNull();
    expect(sniffPrescriptionMime(Buffer.from('GIF89a'))).toBeNull();
    expect(sniffPrescriptionMime(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(sniffPrescriptionMime(Buffer.alloc(0))).toBeNull();
  });
});
