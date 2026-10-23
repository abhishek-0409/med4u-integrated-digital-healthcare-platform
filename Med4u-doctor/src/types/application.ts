export type ApplicationStatus = "PENDING_VERIFICATION" | "UNDER_REVIEW" | "NEEDS_INFO" | "APPROVED" | "REJECTED";
export type ConsultationMode = "ONLINE" | "OFFLINE" | "BOTH";
export type DocumentKind = "GRADUATION_CERTIFICATE" | "REGISTRATION_CERTIFICATE";

export interface ApplicationFields {
  fullName: string;
  email: string;
  registrationNumber: string;
  registrationCouncil: string;
  qualification: string;
  medicalCollege: string;
  specialization: string;
  clinicName: string;
  clinicAddress: string;
  city: string;
  consultationMode: ConsultationMode;
}

export interface ApplicationDocument {
  id: string;
  kind: DocumentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

/** GET /api/v1/doctor-applications/me. Never contains reviewer notes, storage keys or hashes. */
export interface DoctorApplication extends ApplicationFields {
  id: string;
  status: ApplicationStatus;
  statusLabel: string;
  submittedAt: string;
  reviewDeadlineAt: string;
  reviewOverdue: boolean;
  reviewTargetNote: string;
  emailVerified: false;
  applicantMessage: string | null;
  canResubmit: boolean;
  resubmissionCount: number;
  documents: ApplicationDocument[];
  notifications: "not_configured";
}

/** A file chosen on the device, ready to upload. */
export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}
