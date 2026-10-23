import { Paginated } from "../types/api";
import { ClinicalPrescription } from "../types/clinical-prescription";
import { api } from "./api/client";

/** Ownership is derived from the signed-in session on the server; no patient id is ever sent. */
export const clinicalPrescriptionService = {
  list(params: { appointmentId?: string; page?: number; limit?: number } = {}): Promise<Paginated<ClinicalPrescription>> {
    return api.getPage<ClinicalPrescription>("/v1/patient/prescriptions", { params });
  },

  get(id: string): Promise<ClinicalPrescription> {
    return api.get<ClinicalPrescription>(`/v1/patient/prescriptions/${encodeURIComponent(id)}`);
  },

  medicineOrderOptions(id: string): Promise<{
    prescriptionId: string;
    reference: string;
    status: "issued";
    medicines: Array<{
      prescriptionMedicineIndex: number;
      prescriptionMedicine: ClinicalPrescription["medicines"][number];
      status: "MATCHED" | "UNAVAILABLE" | "NEEDS_PHARMACIST_REVIEW";
      candidates: Array<import("../types/medicine").MedicineProduct & { maxPrescriptionQuantity: number; quantityUnitKnown: boolean }>;
    }>;
  }> {
    return api.get(`/v1/patient/prescriptions/${encodeURIComponent(id)}/medicine-order-options`);
  },
};
