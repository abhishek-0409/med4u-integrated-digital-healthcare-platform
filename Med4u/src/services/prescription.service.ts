import { Platform } from "react-native";
import { Paginated } from "../types/api";
import { PickedFile, Prescription } from "../types/prescription";
import { api } from "./api/client";

const UPLOAD_TIMEOUT_MS = 60_000;

export const prescriptionService = {
  /** Uploads a JPEG/PNG/WebP photo or PDF (max 5 MB). The server verifies the file's real type. */
  async upload(file: PickedFile): Promise<Prescription> {
    const form = new FormData();
    if (Platform.OS === "web") {
      // Browsers need a real Blob; react-native's { uri, name, type } shape is native-only.
      const blob = await (await fetch(file.uri)).blob();
      form.append("file", blob, file.name);
    } else {
      form.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
    }
    return api.post<Prescription>("/v1/prescription-uploads", form, {
      timeout: UPLOAD_TIMEOUT_MS,
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  list(params: { page?: number; limit?: number } = {}): Promise<Paginated<Prescription>> {
    return api.getPage<Prescription>("/v1/prescription-uploads", { params });
  },

  getById(id: string): Promise<Prescription> {
    return api.get<Prescription>(`/v1/prescription-uploads/${encodeURIComponent(id)}`);
  },
};
