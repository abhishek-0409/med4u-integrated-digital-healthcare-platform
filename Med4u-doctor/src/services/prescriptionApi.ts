import { doctorApi } from "../api/client";
import {
  AppointmentPrescriptionState,
  CatalogProduct,
  CatalogLabTest,
  DoctorPrescription,
  IssueResult,
  SaveDraftPayload,
} from "../types/prescription";

const enc = encodeURIComponent;

/** Every identity (doctor, patient) is derived by the server from the session; none is ever sent from here. */
export const prescriptionApi = {
  state: (appointmentId: string) =>
    doctorApi.get<AppointmentPrescriptionState>(`/api/v1/doctor/appointments/${enc(appointmentId)}/prescription`),
  /** PUT is idempotent, so a lost response can safely be retried. */
  saveDraft: (appointmentId: string, payload: SaveDraftPayload) =>
    doctorApi.put<DoctorPrescription>(`/api/v1/doctor/appointments/${enc(appointmentId)}/prescription/draft`, payload),
  get: (id: string) => doctorApi.get<DoctorPrescription>(`/api/v1/doctor/prescriptions/${enc(id)}`),
  /** Bound to the reviewed revision; repeating a completed call returns `alreadyIssued: true`. */
  issue: (id: string, revision: number) =>
    doctorApi.post<IssueResult>(`/api/v1/doctor/prescriptions/${enc(id)}/issue`, { revision }),
  amend: (id: string, reason: string) =>
    doctorApi.post<DoctorPrescription>(`/api/v1/doctor/prescriptions/${enc(id)}/amend`, { reason }),
  cancel: (id: string, reason: string) =>
    doctorApi.post<DoctorPrescription>(`/api/v1/doctor/prescriptions/${enc(id)}/cancel`, { reason }),
  discard: (id: string) => doctorApi.delete<void>(`/api/v1/doctor/prescriptions/${enc(id)}`),
  /** Autocomplete over the existing medicine catalog. Suggestions only prefill identity fields. */
  searchCatalog: async (search: string): Promise<CatalogProduct[]> => {
    const page = await doctorApi.getPage<CatalogProduct>("/api/v1/medicines", { params: { search, limit: 8 } });
    return page.items;
  },
  searchLabTests: (search: string) =>
    doctorApi.get<CatalogLabTest[]>(`/api/v1/doctor/lab-tests?search=${encodeURIComponent(search)}`),
};

/** True when a failure means "the request may not have reached the server" and a retry is appropriate. */
export function isRetryable(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  return status === undefined || status === 408 || status === 429 || status >= 500;
}

/**
 * Re-sends an idempotent request after a transient failure (no response, timeout, 429, 5xx). Safe only because
 * the server treats repeated saves and repeated issues of the same revision as no-ops, so a response lost on
 * the network can never produce a second prescription.
 */
export async function retryIdempotent<T>(
  send: () => Promise<T>,
  { attempts = 3, delayMs = 600, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) } = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await send();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === attempts) break;
      await sleep(delayMs * attempt);
    }
  }
  throw lastError;
}
