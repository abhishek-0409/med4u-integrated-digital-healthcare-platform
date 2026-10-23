export interface MedicalReport {
  id: string; name: string; category: string; status: string; date: string; mimeType: string; sizeBytes: number;
}
export interface PatientPrescription {
  id: string; kind: 'issued' | 'patient_upload'; date: string; status: string; clinician: string | null; fileAvailable: boolean;
}
