import { Platform } from 'react-native';
import { PickedFile } from '../types/prescription';
import { MedicalReport } from '../types/health-records';
import { api } from './api/client';

export const reportService = {
  list: () => api.get<MedicalReport[]>('/v1/medical-reports'),
  /** Fetches a report through the authenticated, owner-scoped endpoint. */
  file: (id: string) => api.getBinary(`/v1/medical-reports/${encodeURIComponent(id)}/file`),
  async upload(file: PickedFile, name: string, category: string): Promise<MedicalReport> {
    const form = new FormData();
    if (Platform.OS === 'web') {
      const blob = await (await fetch(file.uri)).blob();
      form.append('file', blob, file.name);
    } else {
      form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
    }
    form.append('name', name);
    form.append('category', category);
    return api.post<MedicalReport>('/v1/medical-reports', form, {
      timeout: 60_000,
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
