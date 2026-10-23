import { api } from './api/client';
import { MedicalReport, PatientPrescription } from '../types/health-records';

export const healthRecordsService = {
  reports: () => api.get<MedicalReport[]>('/v1/medical-reports'),
  prescriptions: () => api.get<PatientPrescription[]>('/v1/prescriptions'),
};
