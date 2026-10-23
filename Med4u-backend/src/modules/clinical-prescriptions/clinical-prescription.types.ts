import {
  ClinicalPrescriptionStatus,
  DoctorSnapshot,
  PrescribedMedicine,
  PrescribedTest,
} from '../../database/entities/clinical-prescription.entity';

export interface PrescriptionConsultationInfo {
  appointmentId: string;
  /** Clinic wall-clock date (IST) and times, as published on the slot. */
  date: string;
  startTime: string;
  endTime: string;
}

/** Shape sent to the doctor who owns the prescription (drafts included). */
export interface DoctorPrescriptionView {
  id: string;
  /** Human-readable identifier printed on the document, e.g. RX-1A2B3C4D-V1. */
  reference: string;
  status: ClinicalPrescriptionStatus;
  version: number;
  revision: number;
  diagnosis: string | null;
  medicines: PrescribedMedicine[];
  recommendedTests: PrescribedTest[];
  additionalInstructions: string | null;
  warnings: string | null;
  followUpDate: string | null;
  consultation: PrescriptionConsultationInfo;
  patient: { id: string; name: string };
  issuedAt: string | null;
  /** Frozen identity once issued; for a draft this is a preview from the current profile. */
  doctor: DoctorSnapshot;
  supersedesId: string | null;
  supersededById: string | null;
  amendmentReason: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  digitallySigned: false;
  createdAt: string;
  updatedAt: string;
}

/** Shape sent to the patient: only issued, superseded or cancelled prescriptions, never drafts. */
export interface PatientPrescriptionView {
  id: string;
  reference: string;
  status: Exclude<ClinicalPrescriptionStatus, ClinicalPrescriptionStatus.DRAFT>;
  version: number;
  diagnosis: string | null;
  medicines: PrescribedMedicine[];
  recommendedTests: PrescribedTest[];
  additionalInstructions: string | null;
  warnings: string | null;
  followUpDate: string | null;
  consultation: PrescriptionConsultationInfo;
  patient: { name: string; age: number | null; gender: string | null };
  issuedAt: string;
  doctor: DoctorSnapshot;
  supersededById: string | null;
  amendmentReason: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  /** The document carries a content hash for tamper evidence only; it is not a digital signature. */
  digitallySigned: false;
}

export interface PrescriptionEligibility {
  canPrescribe: boolean;
  /** Machine-readable reason when `canPrescribe` is false. */
  code: string | null;
  message: string | null;
}

export interface PrescriptionHistoryEntry {
  action: string;
  at: string;
  fromStatus: string | null;
  toStatus: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AppointmentPrescriptionState {
  eligibility: PrescriptionEligibility;
  /** The open draft, if any. */
  draft: DoctorPrescriptionView | null;
  /** The currently valid issued prescription, if any. */
  issued: DoctorPrescriptionView | null;
}

export interface IssueResult {
  prescription: DoctorPrescriptionView;
  /** True when the call was a repeat of an already-completed issuance (no new record or notification). */
  alreadyIssued: boolean;
}
