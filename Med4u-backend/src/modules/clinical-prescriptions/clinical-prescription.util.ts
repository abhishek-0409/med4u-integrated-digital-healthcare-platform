import { createHash } from 'crypto';
import {
  ClinicalPrescription,
  DoctorSnapshot,
  PrescribedMedicine,
  PrescribedTest,
} from '../../database/entities/clinical-prescription.entity';
import { Doctor } from '../../database/entities/doctor.entity';

/** Fields that make up the clinical content. Same fields the database freezes after issue. */
export interface ClinicalContent {
  diagnosis: string | null;
  medicines: PrescribedMedicine[];
  recommendedTests: PrescribedTest[];
  additionalInstructions: string | null;
  warnings: string | null;
  followUpDate: string | null;
}

export function contentOf(rx: Pick<ClinicalPrescription, keyof ClinicalContent>): ClinicalContent {
  return {
    diagnosis: rx.diagnosis ?? null,
    medicines: rx.medicines ?? [],
    recommendedTests: rx.recommendedTests ?? [],
    additionalInstructions: rx.additionalInstructions ?? null,
    warnings: rx.warnings ?? null,
    followUpDate: rx.followUpDate ?? null,
  };
}

/** JSON with sorted keys so equal content always serialises (and hashes) identically. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export function sameContent(a: ClinicalContent, b: ClinicalContent): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

/** SHA-256 over the clinical content and the identifiers that bind it to one patient/doctor/appointment. */
export function hashPrescription(
  rx: Pick<ClinicalPrescription, 'id' | 'appointmentId' | 'doctorId' | 'patientId' | 'version'> &
    ClinicalContent,
): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        id: rx.id,
        appointmentId: rx.appointmentId,
        doctorId: rx.doctorId,
        patientId: rx.patientId,
        version: rx.version,
        content: contentOf(rx),
      }),
    )
    .digest('hex');
}

/** Printable identifier, e.g. RX-1A2B3C4D-V2. Derived from the id, so it cannot collide or be guessed to a record. */
export function prescriptionReference(id: string, version: number): string {
  return `RX-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}-V${version}`;
}

/**
 * Doctor identity as it may appear on the document. Registration details are copied only when the profile is
 * verified and actually has a stored number: nothing is invented or defaulted.
 */
export function snapshotDoctor(
  doctor: Pick<
    Doctor,
    | 'specialization'
    | 'clinicName'
    | 'registrationNumber'
    | 'registrationCouncil'
    | 'isVerified'
    | 'isDemo'
    | 'verificationStatus'
  > & { user?: { name?: string } | null },
): DoctorSnapshot {
  const verified = doctor.isVerified && doctor.verificationStatus === 'verified' && !doctor.isDemo;
  const hasNumber = verified && !!doctor.registrationNumber?.trim();
  return {
    name: doctor.user?.name?.trim() || 'Doctor',
    specialization: doctor.specialization,
    clinicName: doctor.clinicName ?? null,
    registrationNumber: hasNumber ? doctor.registrationNumber!.trim() : null,
    registrationCouncil: hasNumber ? (doctor.registrationCouncil?.trim() ?? null) : null,
    registrationVerified: hasNumber,
    isDemo: doctor.isDemo,
  };
}

export function ageOn(dob: string | null | undefined, today: Date = new Date()): number | null {
  if (!dob) return null;
  const birth = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const m = today.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age >= 0 && age < 150 ? age : null;
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  );
}
