import {
  DoctorImportRecordSchema,
  cleanRegistrationNumber,
  councilKey,
  licenseKey,
  normalizeName,
  placeholderPhone,
} from './doctor-import.schema';
import { resolveExperience } from '../doctor-experience.util';

const valid = {
  fullName: 'Test Person',
  specialization: 'Cardiology',
  registrationCouncil: 'Example State Medical Council',
  registrationNumber: 'EX 12345',
  qualifications: [{ degree: 'MBBS' }],
  source: {
    name: 'Doctor-supplied onboarding form',
    retrievedAt: '2026-01-15',
    permission: 'Supplied and consented to by the doctor (form #1)',
  },
};

describe('DoctorImportRecordSchema', () => {
  it('accepts a minimal sourced record and leaves unknowns undefined', () => {
    const r = DoctorImportRecordSchema.parse(valid);
    expect(r.consultationFeeInr).toBeUndefined();
    expect(r.careerStartYear).toBeUndefined();
    expect(r.photoUrl).toBeUndefined();
  });

  it.each([
    ['missing source', { ...valid, source: undefined }],
    ['source without permission', { ...valid, source: { ...valid.source, permission: '' } }],
    ['future retrieval date', { ...valid, source: { ...valid.source, retrievedAt: '2999-01-01' } }],
    ['no qualifications', { ...valid, qualifications: [] }],
    ['verification fields are not importable', { ...valid, isVerified: true }],
    ['verification status is not importable', { ...valid, verificationStatus: 'verified' }],
    ['photo without attribution', { ...valid, photoUrl: 'https://example.com/a.jpg' }],
    ['http photo', { ...valid, photoUrl: 'http://example.com/a.jpg', photoAttribution: 'Doctor' }],
    ['stated experience without a source', { ...valid, statedExperienceYears: 10 }],
    ['future graduation year', { ...valid, qualifications: [{ degree: 'MBBS', year: 2999 }] }],
    ['odd characters in registration number', { ...valid, registrationNumber: "1; DROP TABLE" }],
    ['zero fee', { ...valid, consultationFeeInr: 0 }],
  ])('rejects %s', (_label, record) => {
    expect(DoctorImportRecordSchema.safeParse(record).success).toBe(false);
  });

  it('accepts a stated experience value that carries its source', () => {
    const r = DoctorImportRecordSchema.safeParse({
      ...valid,
      statedExperienceYears: 12,
      experienceSource: 'Doctor-supplied CV, 2026-01-15',
    });
    expect(r.success).toBe(true);
  });
});

describe('registration identity (duplicate prevention)', () => {
  it('treats spacing and case differences as the same registration', () => {
    expect(cleanRegistrationNumber(' ex 12 345 ')).toBe('EX12345');
    expect(councilKey('  Example   State Medical COUNCIL ')).toBe('example state medical council');
    expect(licenseKey('Example State Medical Council', 'ex 12345')).toBe(
      licenseKey(' example  state medical council', 'EX12345'),
    );
  });

  it('separates different councils or numbers', () => {
    expect(licenseKey('Council A', '1')).not.toBe(licenseKey('Council B', '1'));
    expect(licenseKey('Council A', '1')).not.toBe(licenseKey('Council A', '2'));
  });

  it('derives keys that fit the existing varchar columns and cannot be an OTP phone number', () => {
    expect(licenseKey('Council A', '1').length).toBeLessThanOrEqual(50);
    const phone = placeholderPhone('Council A', '1');
    expect(phone.length).toBeLessThanOrEqual(20);
    expect(phone.startsWith('+')).toBe(false);
  });

  it('normalises names for register comparison', () => {
    expect(normalizeName('Dr. A. Kumar')).toBe(normalizeName('DR A KUMAR'));
    expect(normalizeName('Dr. A. Kumar')).not.toBe(normalizeName('Dr. B. Kumar'));
  });
});

describe('resolveExperience', () => {
  const now = new Date('2026-06-01T00:00:00Z');

  it('computes from the career start year', () => {
    expect(resolveExperience({ isDemo: false, careerStartYear: 2010 }, now)).toEqual({ years: 16, basis: 'career_start' });
  });

  it('uses a stated value only when it has a source', () => {
    expect(resolveExperience({ isDemo: false, experienceYears: 9, experienceSource: 'CV' }, now)).toEqual({ years: 9, basis: 'stated' });
    expect(resolveExperience({ isDemo: false, experienceYears: 9 }, now)).toEqual({ years: null, basis: null });
  });

  it('never presents a bare 0 as real experience, but keeps demo values', () => {
    expect(resolveExperience({ isDemo: false, experienceYears: 0 }, now).years).toBeNull();
    expect(resolveExperience({ isDemo: true, experienceYears: 7 }, now)).toEqual({ years: 7, basis: 'demo' });
  });
});
