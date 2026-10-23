import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { DoctorApplicationStatus as S, REVIEW_TARGET_HOURS } from '../../database/entities/doctor-application.entity';
import {
  MAX_DOCUMENT_BYTES,
  sanitizeFileName,
  validateDocument,
} from './application-document.util';
import {
  canResubmit,
  canReview,
  canStartReview,
  computeReviewDeadline,
  isReviewOverdue,
} from './application-workflow';
import {
  ApplicationFieldsSchema,
  ApproveApplicationSchema,
  RejectApplicationSchema,
  RequestInfoSchema,
  ResubmitFieldsSchema,
} from './dto/doctor-application.dto';

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from('synthetic test document')]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('x')]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('x')]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const file = (buffer: Buffer, originalname: string) => ({ buffer, size: buffer.length, originalname });

describe('document validation', () => {
  it('accepts PDF, PNG and JPEG by content with a matching extension', () => {
    expect(validateDocument(file(PDF, 'degree.pdf'), 'Doc')).toMatchObject({ mimeType: 'application/pdf', extension: 'pdf' });
    expect(validateDocument(file(PNG, 'scan.PNG'), 'Doc').mimeType).toBe('image/png');
    expect(validateDocument(file(JPG, 'scan.jpeg'), 'Doc').mimeType).toBe('image/jpeg');
  });

  it('ignores the client Content-Type entirely', () => {
    const f = { ...file(PDF, 'a.pdf'), mimetype: 'image/png' };
    expect(validateDocument(f, 'Doc').mimeType).toBe('application/pdf');
  });

  it('rejects executables and scripts even when renamed to look harmless', () => {
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]);
    expect(() => validateDocument(file(exe, 'degree.pdf'), 'Doc')).toThrow(BadRequestException);
    expect(() => validateDocument(file(Buffer.from('#!/bin/sh\nrm -rf /'), 'degree.pdf'), 'Doc')).toThrow(BadRequestException);
    expect(() => validateDocument(file(Buffer.from('<script>alert(1)</script>'), 'x.html'), 'Doc')).toThrow(BadRequestException);
  });

  it('rejects dangerous or double extensions on otherwise valid content', () => {
    expect(() => validateDocument(file(PDF, 'degree.exe.pdf'), 'Doc')).toThrow(/unsupported file name/);
    expect(() => validateDocument(file(PDF, 'degree.pdf.js'), 'Doc')).toThrow(BadRequestException);
    expect(() => validateDocument(file(PDF, 'cert.php.pdf'), 'Doc')).toThrow(/unsupported file name/);
  });

  it('rejects an extension that disagrees with the detected type, and missing extensions', () => {
    expect(() => validateDocument(file(PDF, 'degree.png'), 'Doc')).toThrow(/does not match/);
    expect(() => validateDocument(file(PNG, 'degree'), 'Doc')).toThrow(/does not match/);
  });

  it('rejects WebP and unknown types', () => {
    expect(() => validateDocument(file(WEBP, 'a.webp'), 'Doc')).toThrow(/PDF, JPEG or PNG/);
    expect(() => validateDocument(file(Buffer.from('plain text'), 'a.txt'), 'Doc')).toThrow(/PDF, JPEG or PNG/);
  });

  it('rejects missing and empty files', () => {
    expect(() => validateDocument(undefined, 'Graduation certificate')).toThrow(/Graduation certificate is required/);
    expect(() => validateDocument({ buffer: Buffer.alloc(0), size: 0, originalname: 'a.pdf' }, 'Doc')).toThrow(BadRequestException);
  });

  it('rejects oversize files with 413', () => {
    const big = Buffer.concat([PDF, Buffer.alloc(MAX_DOCUMENT_BYTES)]);
    expect(() => validateDocument(file(big, 'a.pdf'), 'Doc')).toThrow(PayloadTooLargeException);
  });

  it('computes a content hash and the true size', () => {
    const v = validateDocument(file(PDF, 'a.pdf'), 'Doc');
    expect(v.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(v.sizeBytes).toBe(PDF.length);
  });
});

describe('file name sanitising (path traversal and unsafe names)', () => {
  it.each([
    ['../../etc/passwd', 'passwd'],
    ['..\\..\\windows\\system32\\evil.pdf', 'evil.pdf'],
    ['/abs/path/degree.pdf', 'degree.pdf'],
    ['de\u0000gree\n.pdf', 'degree.pdf'],
    ['<script>"x".pdf', '_script__x_.pdf'],
    ['....hidden.pdf', 'hidden.pdf'],
    ['', 'document'],
    ['...', 'document'],
  ])('%j -> %j', (input, expected) => {
    expect(sanitizeFileName(input)).toBe(expected);
  });

  it('bounds the length', () => {
    expect(sanitizeFileName('a'.repeat(500) + '.pdf').length).toBeLessThanOrEqual(80);
  });
});

describe('24-hour review deadline', () => {
  it('is exactly 24 hours after submission', () => {
    const submitted = new Date('2026-10-16T08:30:00.000Z');
    const deadline = computeReviewDeadline(submitted);
    expect(REVIEW_TARGET_HOURS).toBe(24);
    expect(deadline.toISOString()).toBe('2026-10-17T08:30:00.000Z');
  });

  it('is exact across a month/DST-independent boundary (UTC arithmetic)', () => {
    expect(computeReviewDeadline(new Date('2026-10-31T23:00:00.000Z')).toISOString()).toBe('2026-11-01T23:00:00.000Z');
  });

  it('marks waiting applications overdue after the deadline but never decides them', () => {
    const deadline = new Date('2026-10-17T08:30:00.000Z');
    const after = new Date('2026-10-17T08:30:01.000Z');
    const before = new Date('2026-10-17T08:29:59.000Z');
    expect(isReviewOverdue(S.PENDING_VERIFICATION, deadline, before)).toBe(false);
    expect(isReviewOverdue(S.PENDING_VERIFICATION, deadline, after)).toBe(true);
    expect(isReviewOverdue(S.UNDER_REVIEW, deadline, after)).toBe(true);
    // Decided states are never "overdue", and there is no function that approves on time passing.
    for (const s of [S.APPROVED, S.REJECTED, S.NEEDS_INFO]) expect(isReviewOverdue(s, deadline, after)).toBe(false);
  });
});

describe('workflow rules', () => {
  it('only pending or under-review applications can be decided', () => {
    expect(canReview(S.PENDING_VERIFICATION)).toBe(true);
    expect(canReview(S.UNDER_REVIEW)).toBe(true);
    for (const s of [S.APPROVED, S.REJECTED, S.NEEDS_INFO]) expect(canReview(s)).toBe(false);
  });
  it('a review can only start from pending', () => {
    expect(canStartReview(S.PENDING_VERIFICATION)).toBe(true);
    for (const s of [S.UNDER_REVIEW, S.APPROVED, S.REJECTED, S.NEEDS_INFO]) expect(canStartReview(s)).toBe(false);
  });
  it('resubmission: needs-info always, rejected only when the reviewer allowed it, never approved/pending', () => {
    expect(canResubmit(S.NEEDS_INFO, false)).toBe(true);
    expect(canResubmit(S.REJECTED, true)).toBe(true);
    expect(canResubmit(S.REJECTED, false)).toBe(false);
    for (const s of [S.APPROVED, S.PENDING_VERIFICATION, S.UNDER_REVIEW]) expect(canResubmit(s, true)).toBe(false);
  });
});

describe('application field validation', () => {
  const valid = {
    fullName: 'Dr Asha Verma',
    email: 'Asha@Example.com',
    registrationNumber: 'MH/2015/12345',
    registrationCouncil: 'Maharashtra Medical Council',
    qualification: 'MBBS, MD',
    medicalCollege: 'Grant Medical College',
    specialization: 'Cardiology',
    clinicName: 'Verma Heart Clinic',
    clinicAddress: '12 Lake View Road, Kothrud',
    city: 'Pune',
    consultationMode: 'BOTH',
  };

  it('accepts a complete, valid application and normalises email', () => {
    const parsed = ApplicationFieldsSchema.parse(valid);
    expect(parsed.email).toBe('asha@example.com');
  });

  it.each(Object.keys(valid))('requires %s', (field) => {
    const body: Record<string, unknown> = { ...valid };
    delete body[field];
    expect(ApplicationFieldsSchema.safeParse(body).success).toBe(false);
  });

  it('rejects bad email, registration number characters, mode, and unknown fields', () => {
    expect(ApplicationFieldsSchema.safeParse({ ...valid, email: 'nope' }).success).toBe(false);
    expect(ApplicationFieldsSchema.safeParse({ ...valid, registrationNumber: "12345'; DROP TABLE" }).success).toBe(false);
    expect(ApplicationFieldsSchema.safeParse({ ...valid, consultationMode: 'TELEPATHY' }).success).toBe(false);
    expect(ApplicationFieldsSchema.safeParse({ ...valid, status: 'APPROVED' }).success).toBe(false);
    expect(ApplicationFieldsSchema.safeParse({ ...valid, userId: 'someone-else' }).success).toBe(false);
    expect(ApplicationFieldsSchema.safeParse({ ...valid, role: 'doctor' }).success).toBe(false);
  });

  it('rejects control characters', () => {
    expect(ApplicationFieldsSchema.safeParse({ ...valid, city: 'Pu\u0000ne' }).success).toBe(false);
  });

  it('resubmission accepts a subset but still forbids status/ownership fields', () => {
    expect(ResubmitFieldsSchema.safeParse({ city: 'Mumbai' }).success).toBe(true);
    expect(ResubmitFieldsSchema.safeParse({}).success).toBe(true);
    expect(ResubmitFieldsSchema.safeParse({ status: 'APPROVED' }).success).toBe(false);
    expect(ResubmitFieldsSchema.safeParse({ email: 'bad' }).success).toBe(false);
  });
});

describe('reviewer decision validation', () => {
  it('approval needs the registry evidence the reviewer actually gathered', () => {
    const notes = 'Checked certificate against register entry.';
    expect(ApproveApplicationSchema.safeParse({ registryCheck: 'VERIFIED_AGAINST_OFFICIAL_REGISTER', notes }).success).toBe(false);
    expect(
      ApproveApplicationSchema.safeParse({
        registryCheck: 'VERIFIED_AGAINST_OFFICIAL_REGISTER',
        registrySource: 'NMC Indian Medical Register',
        registryReference: 'Looked up 2026-10-16',
        notes,
      }).success,
    ).toBe(true);
    expect(ApproveApplicationSchema.safeParse({ registryCheck: 'REGISTER_UNAVAILABLE', notes }).success).toBe(false);
    expect(
      ApproveApplicationSchema.safeParse({
        registryCheck: 'REGISTER_UNAVAILABLE',
        registryUnavailableReason: 'Council website was down all day',
        notes,
      }).success,
    ).toBe(true);
    expect(ApproveApplicationSchema.safeParse({ registryCheck: 'REGISTER_UNAVAILABLE', notes: 'short' }).success).toBe(false);
  });
  it('rejection and info requests require a message for the applicant', () => {
    expect(RejectApplicationSchema.safeParse({ reason: 'no' }).success).toBe(false);
    expect(RejectApplicationSchema.parse({ reason: 'Registration number not found.' }).allowResubmission).toBe(false);
    expect(RequestInfoSchema.safeParse({ message: '' }).success).toBe(false);
    expect(RequestInfoSchema.safeParse({ message: 'Please upload a clearer scan of the certificate.' }).success).toBe(true);
  });
});
