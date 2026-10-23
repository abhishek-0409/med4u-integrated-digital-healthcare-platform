import { doctorApi } from "../api/client";
import { ApplicationFields, DoctorApplication, PickedFile } from "../types/application";

export interface ApplicationFiles {
  graduationCertificate?: PickedFile;
  registrationCertificate?: PickedFile;
}

/** React Native's FormData accepts {uri, name, type} file descriptors. */
export function buildApplicationForm(fields: Partial<ApplicationFields>, files: ApplicationFiles): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) form.append(key, String(value).trim());
  }
  for (const [key, file] of Object.entries(files) as Array<[keyof ApplicationFiles, PickedFile | undefined]>) {
    if (file) form.append(key, { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  }
  return form;
}

export const applicationApi = {
  /** Resolves null when the account has not applied yet (the server answers 404 APPLICATION_NOT_FOUND). */
  async getMine(): Promise<DoctorApplication | null> {
    try {
      return await doctorApi.get<DoctorApplication>("/api/v1/doctor-applications/me");
    } catch (error) {
      if (error instanceof Error && (error as { code?: string }).code === "APPLICATION_NOT_FOUND") return null;
      throw error;
    }
  },
  submit: (fields: ApplicationFields, files: ApplicationFiles, onProgress?: (fraction: number) => void) =>
    doctorApi.postForm<DoctorApplication>("/api/v1/doctor-applications", buildApplicationForm(fields, files), onProgress),
  resubmit: (fields: Partial<ApplicationFields>, files: ApplicationFiles, onProgress?: (fraction: number) => void) =>
    doctorApi.postForm<DoctorApplication>("/api/v1/doctor-applications/me/resubmit", buildApplicationForm(fields, files), onProgress),
};
