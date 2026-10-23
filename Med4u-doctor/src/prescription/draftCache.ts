import { PrescriptionForm } from "../types/prescription";

interface CachedDraft {
  form: PrescriptionForm;
  /** Server draft this form was last synced with; null until the first successful save. */
  prescriptionId: string | null;
  revision: number | null;
}

/**
 * In-memory only. A failed save keeps the doctor's work here so navigating between the editor and the review
 * screen (or a failed network call) never loses it. Medical text is deliberately not written to device storage.
 */
const drafts = new Map<string, CachedDraft>();

export const draftCache = {
  get: (appointmentId: string): CachedDraft | undefined => drafts.get(appointmentId),
  set: (appointmentId: string, value: CachedDraft): void => { drafts.set(appointmentId, value); },
  clear: (appointmentId: string): void => { drafts.delete(appointmentId); },
  clearAll: (): void => drafts.clear(),
};
